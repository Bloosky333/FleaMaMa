import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingSpots, bookings, contacts, editions, spots } from "@/db/schema";
import { displayName } from "./contacts";
import { endOfDayBrussels, formatDateFr, todayBrussels } from "./dates";
import { getSettings, loadTariffGrid } from "./editions";
import { enqueueEmails, PRIORITY_TRANSACTIONAL } from "./email/outbox";
import { bookingLink } from "./magic-links";
import { amountDue, formatEuros } from "./pricing";
import { compareLabels, joinLabels, spotsPhrase } from "./spots";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** "2027-042": year and booking number, easy to write in a transfer. */
export const bookingReference = (year: number, id: number) => `${year}-${String(id).padStart(3, "0")}`;

export async function createBooking(
  tx: Tx,
  input: {
    editionId: number;
    year: number;
    contactId: number;
    status: "offered" | "requested" | "confirmed";
    source: "priority" | "request" | "walk_in";
    priorityReason?: "last_year" | "resident" | "manual" | null;
    spotIds: number[];
    offerExpiresAt?: Date | null;
  },
): Promise<number> {
  const [row] = await tx
    .insert(bookings)
    .values({
      editionId: input.editionId,
      contactId: input.contactId,
      status: input.status,
      source: input.source,
      priorityReason: input.priorityReason ?? null,
      offerExpiresAt: input.offerExpiresAt ?? null,
      reference: `tmp-${crypto.randomUUID()}`,
    })
    .returning({ id: bookings.id });
  await tx
    .update(bookings)
    .set({ reference: bookingReference(input.year, row.id) })
    .where(eq(bookings.id, row.id));
  if (input.spotIds.length) {
    await tx
      .insert(bookingSpots)
      .values(input.spotIds.map((spotId) => ({ bookingId: row.id, spotId, editionId: input.editionId })));
  }
  return row.id;
}

/** A booking with what the exhibitor page and the emails need. */
export async function loadBooking(bookingId: number) {
  const [row] = await db
    .select({ booking: bookings, contact: contacts, edition: editions })
    .from(bookings)
    .innerJoin(contacts, eq(contacts.id, bookings.contactId))
    .innerJoin(editions, eq(editions.id, bookings.editionId))
    .where(eq(bookings.id, bookingId));
  if (!row) return null;
  const held = await db
    .select({ id: spots.id, label: spots.label, street: spots.street, released: bookingSpots.released })
    .from(bookingSpots)
    .innerJoin(spots, eq(spots.id, bookingSpots.spotId))
    .where(eq(bookingSpots.bookingId, bookingId));
  const active = held.filter((s) => !s.released).sort((a, b) => compareLabels(a.label, b.label));
  return { ...row, spots: active };
}

export type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

/** Variables available in email templates for a booking. */
export async function emailVars(b: LoadedBooking, link: string): Promise<Record<string, string>> {
  const settings = await getSettings();
  const deadline = b.booking.offerExpiresAt
    ? todayBrussels(b.booking.offerExpiresAt)
    : b.edition.priorityDeadline;
  return {
    prenom: b.contact.firstName || displayName(b.contact),
    nom: b.contact.lastName,
    annee: String(b.edition.year),
    date_brocante: formatDateFr(b.edition.marketDate, true) || "(date à confirmer)",
    emplacements: joinLabels(b.spots.map((s) => s.label)),
    emplacement_s: spotsPhrase(b.spots.map((s) => s.label)),
    date_limite: formatDateFr(deadline) || "(date à confirmer)",
    lien: link,
    montant: formatEuros(b.booking.amountDueCents),
    reference: b.booking.reference,
    instructions_paiement: b.edition.paymentInstructions,
    organisateur: settings.organizerName,
    raison:
      b.booking.priorityReason === "resident" ? "vous habitez juste en face" : "vous l’aviez l’an dernier",
  };
}

/**
 * Confirms an offer, keeping only `keepSpotIds` (the exhibitor may reduce, spec D17).
 * Computes the amount from the tariffs and queues the confirmation email.
 */
export async function confirmBooking(bookingId: number, keepSpotIds: number[]): Promise<{ error?: string }> {
  const b = await loadBooking(bookingId);
  if (!b) return { error: "Réservation introuvable." };
  if (b.booking.status !== "offered") return { error: "Cette offre n’est plus en attente de réponse." };
  if (b.booking.offerExpiresAt && b.booking.offerExpiresAt < new Date()) {
    return { error: "La date limite pour confirmer est dépassée." };
  }
  const kept = b.spots.filter((s) => keepSpotIds.includes(s.id)).map((s) => s.id);
  if (!kept.length)
    return { error: "Choisissez au moins un emplacement, ou indiquez que vous ne venez pas." };

  const today = todayBrussels();
  const grid = await loadTariffGrid(b.edition.id);
  const amount = amountDue(grid, b.contact.kind, kept.length, today, b.edition.earlyBirdDeadline);
  await db.transaction(async (tx) => {
    const released = b.spots.filter((s) => !kept.includes(s.id)).map((s) => s.id);
    if (released.length) {
      await tx
        .update(bookingSpots)
        .set({ released: true })
        .where(and(eq(bookingSpots.bookingId, bookingId), inArray(bookingSpots.spotId, released)));
    }
    await tx
      .update(bookings)
      .set({ status: "confirmed", confirmedAt: new Date(), amountDueCents: amount })
      .where(eq(bookings.id, bookingId));
  });

  if (b.contact.email) {
    const fresh = (await loadBooking(bookingId))!;
    await enqueueEmails(
      [
        {
          to: b.contact.email,
          template: "confirmation",
          vars: await emailVars(fresh, await bookingLink(b.contact.id, bookingId)),
          contactId: b.contact.id,
          bookingId,
        },
      ],
      { priority: PRIORITY_TRANSACTIONAL },
    );
  }
  return {};
}

async function releaseAll(tx: Tx, bookingId: number) {
  await tx.update(bookingSpots).set({ released: true }).where(eq(bookingSpots.bookingId, bookingId));
}

export async function setBookingClosed(bookingId: number, status: "declined" | "cancelled") {
  await db.transaction(async (tx) => {
    await tx.update(bookings).set({ status }).where(eq(bookings.id, bookingId));
    await releaseAll(tx, bookingId);
  });
}

export async function extendOffer(bookingId: number, date: string) {
  await db
    .update(bookings)
    .set({ offerExpiresAt: endOfDayBrussels(date) })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "offered")));
}

/** Offers past their deadline expire and free their spots (spec §4.5 step 8). */
export async function expireOffers(editionId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(bookings)
      .set({ status: "expired" })
      .where(
        and(
          eq(bookings.editionId, editionId),
          eq(bookings.status, "offered"),
          lt(bookings.offerExpiresAt, new Date()),
        ),
      )
      .returning({ id: bookings.id });
    if (expired.length) {
      await tx
        .update(bookingSpots)
        .set({ released: true })
        .where(
          inArray(
            bookingSpots.bookingId,
            expired.map((e) => e.id),
          ),
        );
    }
    return expired.length;
  });
}

export async function appendBookingNote(bookingId: number, note: string) {
  await db
    .update(bookings)
    .set({ notes: sql`trim(both from ${bookings.notes} || E'\n' || ${note})` })
    .where(eq(bookings.id, bookingId));
}
