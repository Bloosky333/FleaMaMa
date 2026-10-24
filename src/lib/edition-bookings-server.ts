import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookingSpots, bookings, contacts, spots } from "@/db/schema";
import { liveStatuses } from "./bookings-server";
import { displayName } from "./contacts";
import { paymentState } from "./payments";
import { paidTotals } from "./payments-server";
import { compareLabels } from "./spots";

export type EditionBooking = Awaited<ReturnType<typeof loadEditionBookings>>[number];

/** Every booking of an edition with its exhibitor, active spots and payment state. */
export async function loadEditionBookings(editionId: number, opts: { liveOnly?: boolean } = {}) {
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      status: bookings.status,
      source: bookings.source,
      priorityReason: bookings.priorityReason,
      amountDueCents: bookings.amountDueCents,
      confirmedAt: bookings.confirmedAt,
      offerExpiresAt: bookings.offerExpiresAt,
      presence: bookings.presence,
      notes: bookings.notes,
      contact: {
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        company: contacts.company,
        email: contacts.email,
        phone: contacts.phone,
        kind: contacts.kind,
      },
    })
    .from(bookings)
    .innerJoin(contacts, eq(contacts.id, bookings.contactId))
    .where(
      and(
        eq(bookings.editionId, editionId),
        opts.liveOnly ? inArray(bookings.status, [...liveStatuses]) : undefined,
      ),
    );
  const ids = rows.map((r) => r.id);
  const [held, paid] = await Promise.all([
    ids.length
      ? db
          .select({
            bookingId: bookingSpots.bookingId,
            spotId: spots.id,
            label: spots.label,
            street: spots.street,
            released: bookingSpots.released,
          })
          .from(bookingSpots)
          .innerJoin(spots, eq(spots.id, bookingSpots.spotId))
          .where(inArray(bookingSpots.bookingId, ids))
      : [],
    paidTotals(ids),
  ]);
  return rows
    .map((r) => {
      const own = held
        .filter((h) => h.bookingId === r.id && !h.released)
        .sort((a, b) => compareLabels(a.label, b.label));
      const paidCents = paid.get(r.id) ?? 0;
      return {
        ...r,
        contact: { ...r.contact, name: displayName(r.contact) },
        spots: own.map((h) => ({ id: h.spotId, label: h.label, street: h.street })),
        paidCents,
        payment: paymentState(r.amountDueCents, paidCents),
      };
    })
    .sort((a, b) => compareLabels(a.spots[0]?.label ?? "~", b.spots[0]?.label ?? "~"));
}
