"use server";

import { and, eq, exists, inArray, notExists, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db";
import { bookings, emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { confirmBooking, extendOffer, loadBooking, setBookingClosed } from "@/lib/bookings-server";
import { getCurrentEdition } from "@/lib/editions";
import { processOutbox } from "@/lib/email/outbox";
import { queueInvitations } from "@/lib/invitations-server";
import { bookingLink } from "@/lib/magic-links";
import type { PriorityReason } from "@/lib/priorities";
import { assignConflict, createPlannedOffers } from "@/lib/priorities-server";

async function currentEditionOrFail() {
  const edition = await getCurrentEdition();
  if (!edition) redirect("/admin/parametres");
  return edition;
}

const done = (msg: string) => redirect(`/admin/priorites?ok=${encodeURIComponent(msg)}`);
const fail = (msg: string) => redirect(`/admin/priorites?erreur=${encodeURIComponent(msg)}`);

export async function prepareOffers() {
  await requireUser();
  const edition = await currentEditionOrFail();
  let n: number;
  try {
    n = await createPlannedOffers(edition);
  } catch (err) {
    return fail((err as Error).message);
  }
  revalidatePath("/admin/priorites");
  done(`${n} offre(s) préparée(s). Vous pouvez maintenant envoyer les invitations.`);
}

export async function settleConflict(spotId: number, contactId: number, reasons: PriorityReason[]) {
  await requireUser();
  const edition = await currentEditionOrFail();
  try {
    await assignConflict(edition, spotId, contactId, reasons);
  } catch (err) {
    return fail((err as Error).message);
  }
  revalidatePath("/admin/priorites");
}

export type InvitationMode = "new" | "reminder" | "selected";

export async function sendInvitations(mode: InvitationMode, selectedIds: number[] = []) {
  const user = await requireUser();
  const edition = await currentEditionOrFail();
  const offered = and(
    eq(bookings.editionId, edition.id),
    eq(bookings.status, "offered"),
    eq(bookings.source, "priority"),
  );
  const invited = (template: string) =>
    db
      .select({ x: sql`1` })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.bookingId, bookings.id),
          eq(emailOutbox.template, template),
          inArray(emailOutbox.status, ["queued", "sending", "sent"]),
        ),
      );

  let ids: number[];
  if (mode === "selected") {
    ids = selectedIds;
  } else if (mode === "new") {
    ids = (
      await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(offered, notExists(invited("invitation"))))
    ).map((r) => r.id);
  } else {
    // Reminder: invitation already sent, still no answer.
    ids = (
      await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(offered, exists(invited("invitation"))))
    ).map((r) => r.id);
  }
  if (!ids.length) return fail("Aucune offre concernée.");
  const { queued, noEmail } = await queueInvitations(
    edition,
    ids,
    mode === "reminder" ? "invitation_reminder" : "invitation",
    user.id,
  );
  after(processOutbox);
  revalidatePath("/admin/priorites");
  done(
    `${queued} email(s) ajouté(s) à la file d’envoi.` +
      (noEmail ? ` ${noEmail} exposant(s) sans email : prévenez-les par téléphone (bouton « Lien »).` : ""),
  );
}

export async function confirmOffer(bookingId: number) {
  await requireUser();
  const b = await loadBooking(bookingId);
  if (!b) return;
  const res = await confirmBooking(
    bookingId,
    b.spots.map((s) => s.id),
  );
  after(processOutbox);
  revalidatePath("/admin/priorites");
  if (res.error) fail(res.error);
}

export async function declineOffer(bookingId: number) {
  await requireUser();
  await setBookingClosed(bookingId, "declined");
  revalidatePath("/admin/priorites");
}

export async function withdrawOffer(bookingId: number) {
  await requireUser();
  await setBookingClosed(bookingId, "cancelled");
  revalidatePath("/admin/priorites");
}

export async function extendOfferTo(bookingId: number, date: string) {
  await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await extendOffer(bookingId, date);
  revalidatePath("/admin/priorites");
}

/** A personal link the organiser can give by phone or SMS to someone without email. */
export async function personalLink(bookingId: number): Promise<string | null> {
  await requireUser();
  const b = await loadBooking(bookingId);
  return b ? bookingLink(b.contact.id, bookingId) : null;
}
