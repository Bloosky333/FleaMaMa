"use server";

import { and, asc, ilike, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createManualBooking, emailVars, loadBooking, setBookingClosed } from "@/lib/bookings-server";
import { displayName, normalizePhone } from "@/lib/contacts";
import { todayBrussels } from "@/lib/dates";
import { loadEditionBookings } from "@/lib/edition-bookings-server";
import { getCurrentEdition } from "@/lib/editions";
import { enqueueEmails, type OutgoingEmail, PRIORITY_TRANSACTIONAL, processOutbox } from "@/lib/email/outbox";
import { emailsEnabled } from "@/lib/email/transport";
import { bookingLink } from "@/lib/magic-links";
import { isSettled, paymentState } from "@/lib/payments";
import { deletePayment, paidTotals, recordPayment } from "@/lib/payments-server";
import { parseEuros } from "@/lib/pricing";

function refresh(bookingId?: number) {
  revalidatePath("/admin/carte");
  revalidatePath("/admin/reservations");
  if (bookingId) revalidatePath(`/admin/reservations/${bookingId}`);
}

/** Records what is left to pay, in one click (cash on the day, or a transfer seen on the account). */
export async function quickPay(bookingId: number, method: "cash" | "transfer"): Promise<{ error?: string }> {
  const user = await requireUser();
  const b = await loadBooking(bookingId);
  if (!b) return { error: "Réservation introuvable." };
  const paid = (await paidTotals([bookingId])).get(bookingId) ?? 0;
  const left = (b.booking.amountDueCents ?? 0) - paid;
  if (left <= 0) return { error: "Rien à payer." };
  await recordPayment({ bookingId, amountCents: left, method, paidAt: todayBrussels(), userId: user.id });
  refresh(bookingId);
  return {};
}

export async function markPaidBulk(
  bookingIds: number[],
  method: "cash" | "transfer",
): Promise<{ count: number }> {
  let count = 0;
  for (const id of bookingIds) if (!(await quickPay(id, method)).error) count++;
  return { count };
}

const paymentSchema = z.object({
  amount: z.string(),
  kind: z.enum(["payment", "refund"]),
  method: z.enum(["cash", "transfer"]),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  reference: z.string().trim().max(200),
});

export async function addPayment(
  bookingId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const cents = parseEuros(parsed.data.amount);
  if (!cents) return { error: "Montant invalide." };
  await recordPayment({
    bookingId,
    amountCents: parsed.data.kind === "refund" ? -cents : cents,
    method: parsed.data.method,
    paidAt: parsed.data.paidAt,
    reference: parsed.data.reference,
    userId: user.id,
  });
  refresh(bookingId);
  return { ok: parsed.data.kind === "refund" ? "Remboursement enregistré." : "Paiement enregistré." };
}

export async function removePayment(paymentId: number) {
  await requireUser();
  const bookingId = await deletePayment(paymentId);
  refresh(bookingId ?? undefined);
}

export async function cancelBooking(bookingId: number) {
  await requireUser();
  await setBookingClosed(bookingId, "cancelled");
  refresh(bookingId);
}

export async function searchContacts(q: string) {
  await requireUser();
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      city: contacts.city,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      and(
        isNull(contacts.mergedIntoId),
        or(
          ilike(contacts.lastName, like),
          ilike(contacts.firstName, like),
          ilike(contacts.company, like),
          ilike(contacts.email, like),
          ilike(contacts.phone, `%${normalizePhone(term)}%`),
          ilike(sql`${contacts.firstName} || ' ' || ${contacts.lastName}`, like),
          ilike(sql`${contacts.lastName} || ' ' || ${contacts.firstName}`, like),
        ),
      ),
    )
    .orderBy(asc(contacts.lastName))
    .limit(10);
  return rows.map((r) => ({ id: r.id, name: displayName(r), city: r.city, hasEmail: !!r.email }));
}

export async function assignSpots(
  spotIds: number[],
  contactId: number,
  sendConfirmation: boolean,
): Promise<{ error?: string; bookingId?: number }> {
  await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) return { error: "Aucune édition en cours." };
  const res = await createManualBooking({
    editionId: edition.id,
    contactId,
    spotIds,
    source: "request",
    sendConfirmation,
  });
  if (res.bookingId && sendConfirmation) after(processOutbox);
  refresh(res.bookingId);
  return res;
}

export async function resendConfirmation(bookingId: number) {
  await requireUser();
  const b = await loadBooking(bookingId);
  if (!b?.contact.email || b.booking.status !== "confirmed" || !(await emailsEnabled())) return;
  await enqueueEmails(
    [
      {
        to: b.contact.email,
        template: "confirmation",
        vars: await emailVars(b, await bookingLink(b.contact.id, bookingId)),
        contactId: b.contact.id,
        bookingId,
      },
    ],
    { priority: PRIORITY_TRANSACTIONAL },
  );
  after(processOutbox);
  refresh(bookingId);
}

/** Payment reminders, only when the organiser asks (spec §4.7). Empty list = every unpaid booking. */
export async function sendPaymentReminders(
  bookingIds: number[],
): Promise<{ queued: number; noEmail: number }> {
  const user = await requireUser();
  const edition = await getCurrentEdition();
  if (!edition || !(await emailsEnabled())) return { queued: 0, noEmail: 0 };
  const all = await loadEditionBookings(edition.id, { liveOnly: true });
  const targets = all.filter(
    (b) =>
      b.status === "confirmed" &&
      !isSettled(paymentState(b.amountDueCents, b.paidCents)) &&
      b.amountDueCents !== null &&
      (!bookingIds.length || bookingIds.includes(b.id)),
  );
  const emails: OutgoingEmail[] = [];
  let noEmail = 0;
  for (const t of targets) {
    if (!t.contact.email) {
      noEmail++;
      continue;
    }
    const b = (await loadBooking(t.id))!;
    emails.push({
      to: t.contact.email,
      template: "unpaid_reminder",
      vars: await emailVars(b, await bookingLink(t.contact.id, t.id)),
      contactId: t.contact.id,
      bookingId: t.id,
    });
  }
  await enqueueEmails(emails, {
    campaign: { editionId: edition.id, template: "unpaid_reminder", createdBy: user.id },
  });
  after(processOutbox);
  refresh();
  return { queued: emails.length, noEmail };
}
