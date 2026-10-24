import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingSpots,
  bookings,
  contacts,
  type Edition,
  plans,
  spotEditionStates,
  spotRequests,
  spots,
} from "@/db/schema";
import { createBooking, emailVars, loadBooking } from "./bookings-server";
import { displayName, normalizeEmail, normalizePhone } from "./contacts";
import { addDaysIso, endOfDayBrussels, todayBrussels } from "./dates";
import { loadTariffGrid } from "./editions";
import { enqueueEmails, PRIORITY_TRANSACTIONAL, type OutgoingEmail } from "./email/outbox";
import type { TemplateKey } from "./email/templates";
import { isUniqueViolation } from "./db-errors";
import { appUrl, bookingLink, createMagicLink } from "./magic-links";
import { amountDue } from "./pricing";
import { loadPriorityOverview } from "./priorities-server";
import { suggestSpots } from "./requests";
import { compareLabels, joinLabels } from "./spots";

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

export function requestSummary(choices: string[][]): string {
  return choices.map((labels, i) => `${ordinal(i + 1)} choix : n°${joinLabels(labels)}`).join(" ; ");
}

/** Spots that cannot be requested: held by a booking, inactive, or reserved for a pending priority. */
async function unavailableSpotIds(edition: Edition): Promise<Set<number>> {
  const [held, inactive, overview] = await Promise.all([
    db
      .select({ spotId: bookingSpots.spotId })
      .from(bookingSpots)
      .where(and(eq(bookingSpots.editionId, edition.id), eq(bookingSpots.released, false))),
    db
      .select({ spotId: spotEditionStates.spotId })
      .from(spotEditionStates)
      .where(eq(spotEditionStates.editionId, edition.id)),
    loadPriorityOverview(edition),
  ]);
  const inactiveSpots = await db.select({ id: spots.id }).from(spots).where(eq(spots.active, false));
  return new Set([
    ...held.map((h) => h.spotId),
    ...inactive.map((i) => i.spotId),
    ...inactiveSpots.map((s) => s.id),
    ...overview.planned.flatMap((p) => p.spots.map((s) => s.id)),
    ...overview.conflicts.map((c) => c.spotId),
  ]);
}

/** Pending requests per spot (all choices of requests not yet handled). */
export async function requestsBySpot(
  editionId: number,
): Promise<Map<number, { bookingId: number; contact: string }[]>> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      spotIds: spotRequests.spotIds,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
    })
    .from(spotRequests)
    .innerJoin(bookings, eq(bookings.id, spotRequests.bookingId))
    .innerJoin(contacts, eq(contacts.id, bookings.contactId))
    .where(and(eq(bookings.editionId, editionId), inArray(bookings.status, ["requested", "waitlist"])));
  const map = new Map<number, { bookingId: number; contact: string }[]>();
  for (const r of rows) {
    for (const id of r.spotIds) {
      const list = map.get(id) ?? [];
      if (!list.some((x) => x.bookingId === r.bookingId))
        list.push({ bookingId: r.bookingId, contact: displayName(r) });
      map.set(id, list);
    }
  }
  return map;
}

export type PublicSpot = {
  id: number;
  label: string;
  street: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  available: boolean;
  requests: number;
};

export async function loadPublicMap(edition: Edition) {
  const [[plan], all, unavailable, requested, grid] = await Promise.all([
    db
      .select({ id: plans.id, width: plans.width, height: plans.height })
      .from(plans)
      .orderBy(desc(plans.id))
      .limit(1),
    db.select().from(spots),
    unavailableSpotIds(edition),
    requestsBySpot(edition.id),
    loadTariffGrid(edition.id),
  ]);
  const publicSpots: PublicSpot[] = all.map((s) => ({
    id: s.id,
    label: s.label,
    street: s.street,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    rotation: s.rotation,
    available: !unavailable.has(s.id),
    requests: requested.get(s.id)?.length ?? 0,
  }));
  return { plan: plan ?? null, spots: publicSpots, grid };
}

export type RequestInput = {
  lastName: string;
  firstName: string;
  company: string;
  kind: "private" | "pro";
  vatNumber: string;
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  phone: string;
  email: string;
  message: string;
  choices: number[][];
};

/** Records a public request (no spot is held) and emails the requester their personal link. */
export async function createPublicRequest(
  edition: Edition,
  input: RequestInput,
): Promise<{ token?: string; error?: string }> {
  const choices = input.choices.filter((c) => c.length).slice(0, 3);
  if (!choices.length) return { error: "Choisissez au moins un emplacement." };
  const unavailable = await unavailableSpotIds(edition);
  const wanted = [...new Set(choices.flat())];
  const known = await db
    .select({ id: spots.id, label: spots.label })
    .from(spots)
    .where(inArray(spots.id, wanted));
  const label = new Map(known.map((s) => [s.id, s.label]));
  const gone = wanted.filter((id) => !label.has(id) || unavailable.has(id));
  if (gone.length) {
    return {
      error: `Emplacement(s) plus disponible(s) : n°${joinLabels(gone.map((id) => label.get(id) ?? "?"))}. Choisissez-en un autre.`,
    };
  }

  const email = normalizeEmail(input.email);
  const values = {
    lastName: input.lastName.trim(),
    firstName: input.firstName.trim(),
    company: input.company.trim(),
    kind: input.kind,
    vatNumber: input.kind === "pro" ? input.vatNumber.trim() : "",
    street: input.street.trim(),
    houseNumber: input.houseNumber.trim(),
    postcode: input.postcode.trim(),
    city: input.city.trim(),
    phone: normalizePhone(input.phone),
    email,
  };

  const bookingId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.email, email), isNull(contacts.mergedIntoId)))
      .limit(1);
    let contactId: number;
    if (existing) {
      contactId = existing.id;
      // Complete what is missing, never overwrite the organiser's data.
      const fill = Object.fromEntries(
        (["firstName", "company", "street", "houseNumber", "postcode", "city", "phone", "vatNumber"] as const)
          .filter((f) => !existing[f] && values[f])
          .map((f) => [f, values[f]]),
      );
      await tx
        .update(contacts)
        .set({ ...fill, gdprConsentAt: existing.gdprConsentAt ?? new Date() })
        .where(eq(contacts.id, contactId));
    } else {
      const [row] = await tx
        .insert(contacts)
        .values({ ...values, gdprConsentAt: new Date() })
        .returning({ id: contacts.id });
      contactId = row.id;
    }
    const id = await createBooking(tx, {
      editionId: edition.id,
      year: edition.year,
      contactId,
      status: "requested",
      source: "request",
      spotIds: [],
    });
    await tx
      .update(bookings)
      .set({
        requestedAt: new Date(),
        notes: input.message.trim() ? `Message de l’exposant : ${input.message.trim().slice(0, 2000)}` : "",
      })
      .where(eq(bookings.id, id));
    await tx
      .insert(spotRequests)
      .values(choices.map((spotIds, i) => ({ bookingId: id, choiceRank: i + 1, spotIds })));
    return id;
  });

  const b = (await loadBooking(bookingId))!;
  const token = await createMagicLink(b.contact.id, bookingId);
  const link = `${await appUrl()}/r/${token}`;
  await enqueueEmails(
    [
      {
        to: email,
        template: "request_received",
        vars: {
          ...(await emailVars(b, link)),
          demande: requestSummary(choices.map((c) => c.map((id) => label.get(id)!).sort(compareLabels))),
        },
        contactId: b.contact.id,
        bookingId,
      },
    ],
    { priority: PRIORITY_TRANSACTIONAL },
  );
  return { token };
}

export async function loadChoices(bookingId: number) {
  const rows = await db
    .select({ rank: spotRequests.choiceRank, spotIds: spotRequests.spotIds })
    .from(spotRequests)
    .where(eq(spotRequests.bookingId, bookingId))
    .orderBy(asc(spotRequests.choiceRank));
  const ids = [...new Set(rows.flatMap((r) => r.spotIds))];
  const info = ids.length
    ? await db
        .select({ id: spots.id, label: spots.label, street: spots.street })
        .from(spots)
        .where(inArray(spots.id, ids))
    : [];
  const byId = new Map(info.map((s) => [s.id, s]));
  return rows.map((r) => ({
    rank: r.rank,
    spots: r.spotIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => compareLabels(a.label, b.label)),
  }));
}

export type RequestOverview = Awaited<ReturnType<typeof loadRequests>>;

/** Requests (and the waiting list) in submission order, with what is still free and suggestions. */
export async function loadRequests(edition: Edition) {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      requestedAt: bookings.requestedAt,
      notes: bookings.notes,
      reference: bookings.reference,
      contact: {
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        company: contacts.company,
        email: contacts.email,
        phone: contacts.phone,
        kind: contacts.kind,
        city: contacts.city,
      },
    })
    .from(bookings)
    .innerJoin(contacts, eq(contacts.id, bookings.contactId))
    .where(and(eq(bookings.editionId, edition.id), inArray(bookings.status, ["requested", "waitlist"])))
    .orderBy(asc(bookings.requestedAt), asc(bookings.id));

  const [unavailable, competing, all, live] = await Promise.all([
    unavailableSpotIds(edition),
    requestsBySpot(edition.id),
    db.select({ id: spots.id, label: spots.label, street: spots.street, x: spots.x, y: spots.y }).from(spots),
    db
      .select({ contactId: bookings.contactId })
      .from(bookings)
      .where(and(eq(bookings.editionId, edition.id), inArray(bookings.status, ["offered", "confirmed"]))),
  ]);
  const free = all.filter((s) => !unavailable.has(s.id));
  const withBooking = new Set(live.map((l) => l.contactId));
  const geo = new Map(all.map((s) => [s.id, s]));

  return Promise.all(
    rows.map(async (r) => {
      const choices = (await loadChoices(r.id)).map((c) => ({
        ...c,
        spots: c.spots.map((s) => ({
          ...s,
          available: !unavailable.has(s.id),
          others: (competing.get(s.id) ?? []).filter((x) => x.bookingId !== r.id).map((x) => x.contact),
        })),
      }));
      const firstFree = choices.find((c) => c.spots.length && c.spots.every((s) => s.available));
      const wanted = (choices[0]?.spots ?? []).map((s) => geo.get(s.id)!).filter(Boolean);
      return {
        ...r,
        contact: { ...r.contact, name: displayName(r.contact) },
        choices,
        firstFreeRank: firstFree?.rank ?? null,
        alreadyBooked: withBooking.has(r.contact.id),
        suggestions: firstFree
          ? []
          : suggestSpots(wanted, free, Math.max(1, wanted.length)).map((g) =>
              g
                .map((s) => ({ id: s.id, label: s.label, street: s.street }))
                .sort((a, b) => compareLabels(a.label, b.label)),
            ),
      };
    }),
  );
}

async function notify(bookingId: number, template: TemplateKey) {
  const b = await loadBooking(bookingId);
  if (!b?.contact.email) return;
  const email: OutgoingEmail = {
    to: b.contact.email,
    template,
    vars: await emailVars(b, await bookingLink(b.contact.id, bookingId)),
    contactId: b.contact.id,
    bookingId,
  };
  await enqueueEmails([email], { priority: PRIORITY_TRANSACTIONAL });
}

async function attachSpots(
  bookingId: number,
  spotIds: number[],
): Promise<{ error?: string; booking?: Awaited<ReturnType<typeof loadBooking>> }> {
  const b = await loadBooking(bookingId);
  if (!b || !["requested", "waitlist"].includes(b.booking.status))
    return { error: "Demande introuvable ou déjà traitée." };
  if (!spotIds.length) return { error: "Aucun emplacement choisi." };
  return { booking: b };
}

/** Gives the requester these spots: booking confirmed, priced at the request date, confirmation email. */
export async function acceptRequest(bookingId: number, spotIds: number[]): Promise<{ error?: string }> {
  const { error, booking: b } = await attachSpots(bookingId, spotIds);
  if (error || !b) return { error };
  const grid = await loadTariffGrid(b.edition.id);
  const bookedOn = todayBrussels(b.booking.requestedAt ?? new Date());
  const amount = amountDue(grid, b.contact.kind, spotIds.length, bookedOn, b.edition.earlyBirdDeadline);
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(bookingSpots)
        .values(spotIds.map((spotId) => ({ bookingId, spotId, editionId: b.edition.id })));
      await tx
        .update(bookings)
        .set({ status: "confirmed", confirmedAt: new Date(), amountDueCents: amount })
        .where(eq(bookings.id, bookingId));
      await tx.update(spotRequests).set({ status: "handled" }).where(eq(spotRequests.bookingId, bookingId));
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Un de ces emplacements vient d’être attribué." };
    throw err;
  }
  await notify(bookingId, "confirmation");
  return {};
}

/** Proposes other spots: held for `days` days, the requester accepts or declines on their page. */
export async function proposeAlternative(
  bookingId: number,
  spotIds: number[],
  days = 7,
): Promise<{ error?: string }> {
  const { error, booking: b } = await attachSpots(bookingId, spotIds);
  if (error || !b) return { error };
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(bookingSpots)
        .values(spotIds.map((spotId) => ({ bookingId, spotId, editionId: b.edition.id })));
      await tx
        .update(bookings)
        .set({ status: "offered", offerExpiresAt: endOfDayBrussels(addDaysIso(todayBrussels(), days)) })
        .where(eq(bookings.id, bookingId));
      await tx.update(spotRequests).set({ status: "handled" }).where(eq(spotRequests.bookingId, bookingId));
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "Un de ces emplacements vient d’être attribué." };
    throw err;
  }
  await notify(bookingId, "request_alternative");
  return {};
}

export async function waitlistRequest(bookingId: number) {
  await db
    .update(bookings)
    .set({ status: "waitlist" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "requested")));
  await notify(bookingId, "request_waitlist");
}

export async function refuseRequest(bookingId: number) {
  await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ["requested", "waitlist"])));
}
