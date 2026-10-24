import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type Edition, editions } from "@/db/schema";
import { emailVars, loadBooking } from "./bookings-server";
import { enqueueEmails, type OutgoingEmail } from "./email/outbox";
import { bookingLink } from "./magic-links";

/** Queues priority invitations (or reminders) with a personal link for each offer. */
export async function queueInvitations(
  edition: Edition,
  bookingIds: number[],
  template: "invitation" | "invitation_reminder",
  userId: number,
): Promise<{ queued: number; noEmail: number }> {
  const emails: OutgoingEmail[] = [];
  let noEmail = 0;
  for (const id of bookingIds) {
    const b = await loadBooking(id);
    if (!b || b.booking.status !== "offered" || b.edition.id !== edition.id) continue;
    if (!b.contact.email) {
      noEmail++;
      continue;
    }
    emails.push({
      to: b.contact.email,
      template,
      vars: await emailVars(b, await bookingLink(b.contact.id, id)),
      contactId: b.contact.id,
      bookingId: id,
    });
  }
  await enqueueEmails(emails, { campaign: { editionId: edition.id, template, createdBy: userId } });
  if (emails.length && edition.status === "preparation") {
    await db.update(editions).set({ status: "priority" }).where(eq(editions.id, edition.id));
  }
  return { queued: emails.length, noEmail };
}
