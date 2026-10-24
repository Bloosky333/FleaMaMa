import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingSpots,
  bookings,
  contacts,
  type Edition,
  residentLinks,
  spotEditionStates,
  spots,
} from "@/db/schema";
import { displayName } from "./contacts";
import { getPreviousEdition } from "./editions";
import { loadEditionBookings } from "./edition-bookings-server";
import { isSettled, type PaymentState } from "./payments";
import { reasonLabels } from "./priorities";
import { loadPriorityOverview } from "./priorities-server";

export type MapStatus = "free" | "priority" | "conflict" | "offered" | "booked" | "paid" | "inactive";

export type MapSpot = {
  id: number;
  label: string;
  street: string;
  lengthM: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: MapStatus;
  booking: {
    id: number;
    reference: string;
    status: string;
    contactId: number;
    contactName: string;
    phone: string;
    amountDueCents: number | null;
    paidCents: number;
    payment: PaymentState;
    spotLabels: string[];
    offerExpiresAt: string | null;
  } | null;
  lastYear: string[];
  residents: string[];
  /** Pending priority (not prepared yet) or conflict, e.g. "DUPONT Marie (Riverain)". */
  priority: string[];
};

export async function loadMapData(
  edition: Edition,
): Promise<{ spots: MapSpot[]; previousYear: number | null }> {
  const previous = await getPreviousEdition(edition.year);
  const [allSpots, live, lastYear, residents, inactive, overview] = await Promise.all([
    db.select().from(spots),
    loadEditionBookings(edition.id, { liveOnly: true }),
    previous
      ? db
          .select({
            spotId: bookingSpots.spotId,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            company: contacts.company,
          })
          .from(bookingSpots)
          .innerJoin(bookings, eq(bookings.id, bookingSpots.bookingId))
          .innerJoin(contacts, eq(contacts.id, bookings.contactId))
          .where(
            and(
              eq(bookingSpots.editionId, previous.id),
              eq(bookingSpots.released, false),
              inArray(bookings.status, ["historical", "confirmed"]),
            ),
          )
      : [],
    db
      .select({
        spotId: residentLinks.spotId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        company: contacts.company,
      })
      .from(residentLinks)
      .innerJoin(contacts, eq(contacts.id, residentLinks.contactId)),
    db
      .select({ spotId: spotEditionStates.spotId })
      .from(spotEditionStates)
      .where(eq(spotEditionStates.editionId, edition.id)),
    loadPriorityOverview(edition),
  ]);

  const group = (rows: { spotId: number; firstName: string; lastName: string; company: string }[]) => {
    const m = new Map<number, string[]>();
    for (const r of rows) m.set(r.spotId, [...(m.get(r.spotId) ?? []), displayName(r)]);
    return m;
  };
  const lastYearBySpot = group(lastYear);
  const residentsBySpot = group(residents);
  const inactiveIds = new Set(inactive.map((i) => i.spotId));
  const bookingBySpot = new Map(live.flatMap((b) => b.spots.map((s) => [s.id, b] as const)));
  const planned = new Map<number, string[]>();
  for (const p of overview.planned) {
    const who = `${p.contact.name} (${p.reasons.map((r) => reasonLabels[r]).join(" + ")})`;
    for (const s of p.spots) planned.set(s.id, [who]);
  }
  const conflicts = new Map(
    overview.conflicts.map((c) => [
      c.spotId,
      c.claims.map((x) => `${x.contact.name} (${x.reasons.map((r) => reasonLabels[r]).join(" + ")})`),
    ]),
  );

  return {
    previousYear: previous?.year ?? null,
    spots: allSpots.map((s) => {
      const b = bookingBySpot.get(s.id);
      let status: MapStatus;
      if (b) status = b.status === "offered" ? "offered" : isSettled(b.payment) ? "paid" : "booked";
      else if (!s.active || inactiveIds.has(s.id)) status = "inactive";
      else if (conflicts.has(s.id)) status = "conflict";
      else if (planned.has(s.id)) status = "priority";
      else status = "free";
      return {
        id: s.id,
        label: s.label,
        street: s.street,
        lengthM: s.lengthM,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rotation: s.rotation,
        status,
        booking: b
          ? {
              id: b.id,
              reference: b.reference,
              status: b.status,
              contactId: b.contact.id,
              contactName: b.contact.name,
              phone: b.contact.phone,
              amountDueCents: b.amountDueCents,
              paidCents: b.paidCents,
              payment: b.payment,
              spotLabels: b.spots.map((x) => x.label),
              offerExpiresAt: b.offerExpiresAt?.toISOString() ?? null,
            }
          : null,
        lastYear: lastYearBySpot.get(s.id) ?? [],
        residents: residentsBySpot.get(s.id) ?? [],
        priority: conflicts.get(s.id) ?? planned.get(s.id) ?? [],
      };
    }),
  };
}
