import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingSpots,
  bookings,
  contacts,
  type Edition,
  emailOutbox,
  residentLinks,
  spotEditionStates,
  spots,
} from "@/db/schema";
import { createBooking } from "./bookings-server";
import { displayName } from "./contacts";
import { endOfDayBrussels } from "./dates";
import { getPreviousEdition } from "./editions";
import { type Claim, mainReason, planOffers, type PriorityReason } from "./priorities";
import { compareLabels } from "./spots";

const CLOSED = ["declined", "cancelled", "expired"] as const;

async function loadClaims(edition: Edition) {
  const previous = await getPreviousEdition(edition.year);
  const [lastYear, residents, current, inactive] = await Promise.all([
    previous
      ? db
          .select({ spotId: bookingSpots.spotId, contactId: bookings.contactId })
          .from(bookingSpots)
          .innerJoin(bookings, eq(bookings.id, bookingSpots.bookingId))
          .where(
            and(
              eq(bookingSpots.editionId, previous.id),
              eq(bookingSpots.released, false),
              inArray(bookings.status, ["historical", "confirmed"]),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ spotId: residentLinks.spotId, contactId: residentLinks.contactId })
      .from(residentLinks)
      .where(isNotNull(residentLinks.validatedAt)),
    db
      .select({
        bookingId: bookings.id,
        contactId: bookings.contactId,
        status: bookings.status,
        spotId: bookingSpots.spotId,
        released: bookingSpots.released,
      })
      .from(bookings)
      .leftJoin(bookingSpots, eq(bookingSpots.bookingId, bookings.id))
      .where(eq(bookings.editionId, edition.id)),
    db
      .select({ spotId: spotEditionStates.spotId })
      .from(spotEditionStates)
      .where(eq(spotEditionStates.editionId, edition.id)),
  ]);

  const claims: Claim[] = [
    ...lastYear.map((c) => ({ ...c, reason: "last_year" as const })),
    ...residents.map((c) => ({ ...c, reason: "resident" as const })),
  ];
  const heldSpotIds = new Set(current.filter((c) => c.spotId !== null && !c.released).map((c) => c.spotId!));
  const active = current.filter((c) => !(CLOSED as readonly string[]).includes(c.status));
  const contactsWithBooking = new Set(active.map((c) => c.contactId));
  // Someone who declined, or whose offer was withdrawn or expired, is not offered again.
  const closedOnly = new Set(current.map((c) => c.contactId).filter((id) => !contactsWithBooking.has(id)));
  const inactiveSpotIds = new Set([
    ...inactive.map((i) => i.spotId),
    ...(await db.select({ id: spots.id }).from(spots).where(eq(spots.active, false))).map((s) => s.id),
  ]);

  return {
    previous,
    plan: planOffers(
      claims.filter((c) => !closedOnly.has(c.contactId)),
      { heldSpotIds, contactsWithBooking, inactiveSpotIds },
    ),
  };
}

export type PriorityOverview = Awaited<ReturnType<typeof loadPriorityOverview>>;

export async function loadPriorityOverview(edition: Edition) {
  const { previous, plan } = await loadClaims(edition);

  const offers = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      priorityReason: bookings.priorityReason,
      offerExpiresAt: bookings.offerExpiresAt,
      confirmedAt: bookings.confirmedAt,
      amountDueCents: bookings.amountDueCents,
      notes: bookings.notes,
      contact: {
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        company: contacts.company,
        email: contacts.email,
        phone: contacts.phone,
      },
    })
    .from(bookings)
    .innerJoin(contacts, eq(contacts.id, bookings.contactId))
    .where(and(eq(bookings.editionId, edition.id), eq(bookings.source, "priority")))
    .orderBy(bookings.id);

  const offerIds = offers.map((o) => o.id);
  const [offerSpots, mails] = offerIds.length
    ? await Promise.all([
        db
          .select({ bookingId: bookingSpots.bookingId, label: spots.label, released: bookingSpots.released })
          .from(bookingSpots)
          .innerJoin(spots, eq(spots.id, bookingSpots.spotId))
          .where(inArray(bookingSpots.bookingId, offerIds)),
        db
          .select({
            bookingId: emailOutbox.bookingId,
            template: emailOutbox.template,
            status: emailOutbox.status,
          })
          .from(emailOutbox)
          .where(inArray(emailOutbox.bookingId, offerIds))
          .orderBy(desc(emailOutbox.id)),
      ])
    : [[], []];

  // Display data for planned offers and conflicts.
  const contactIds = [
    ...new Set([
      ...plan.offers.map((o) => o.contactId),
      ...plan.conflicts.flatMap((c) => c.claims.map((x) => x.contactId)),
    ]),
  ];
  const spotIds = [
    ...new Set([...plan.offers.flatMap((o) => o.spotIds), ...plan.conflicts.map((c) => c.spotId)]),
  ];
  const [people, labels, lastYearInfo] = await Promise.all([
    contactIds.length
      ? db
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            company: contacts.company,
            email: contacts.email,
            phone: contacts.phone,
          })
          .from(contacts)
          .where(inArray(contacts.id, contactIds))
      : [],
    spotIds.length
      ? db.select({ id: spots.id, label: spots.label }).from(spots).where(inArray(spots.id, spotIds))
      : [],
    previous && contactIds.length
      ? db
          .select({
            contactId: bookings.contactId,
            historicalPaid: bookings.historicalPaid,
            presence: bookings.presence,
          })
          .from(bookings)
          .where(and(eq(bookings.editionId, previous.id), inArray(bookings.contactId, contactIds)))
      : [],
  ]);
  const person = new Map(people.map((p) => [p.id, { ...p, name: displayName(p) }]));
  const label = new Map(labels.map((l) => [l.id, l.label]));
  const lastYear = new Map(lastYearInfo.map((l) => [l.contactId, l]));

  const describe = (contactId: number) => {
    const p = person.get(contactId)!;
    const ly = lastYear.get(contactId);
    const warnings: string[] = [];
    if (ly?.historicalPaid === false) warnings.push(`non payé en ${previous!.year}`);
    if (ly?.presence === "no_show") warnings.push(`absent en ${previous!.year}`);
    if (!p.email) warnings.push("pas d’email");
    return { ...p, warnings };
  };

  return {
    previousYear: previous?.year ?? null,
    planned: plan.offers
      .map((o) => ({
        contact: describe(o.contactId),
        spots: o.spotIds
          .map((id) => ({ id, label: label.get(id)! }))
          .sort((a, b) => compareLabels(a.label, b.label)),
        reasons: o.reasons,
      }))
      .sort((a, b) => compareLabels(a.spots[0].label, b.spots[0].label)),
    conflicts: plan.conflicts
      .map((c) => ({
        spotId: c.spotId,
        label: label.get(c.spotId)!,
        claims: c.claims.map((x) => ({ contact: describe(x.contactId), reasons: x.reasons })),
      }))
      .sort((a, b) => compareLabels(a.label, b.label)),
    offers: offers.map((o) => {
      const own = offerSpots.filter((s) => s.bookingId === o.id);
      const ownMails = mails.filter((m) => m.bookingId === o.id);
      const invitation = ownMails.find((m) => m.template === "invitation");
      return {
        ...o,
        contact: { ...o.contact, name: displayName(o.contact) },
        spots: own
          .filter((s) => !s.released)
          .map((s) => s.label)
          .sort(compareLabels),
        releasedSpots: own
          .filter((s) => s.released)
          .map((s) => s.label)
          .sort(compareLabels),
        invitation: invitation?.status ?? null,
        reminders: ownMails.filter((m) => m.template === "invitation_reminder").length,
      };
    }),
  };
}

/** Creates an "offered" booking for every planned (conflict-free) offer. */
export async function createPlannedOffers(edition: Edition): Promise<number> {
  if (!edition.priorityDeadline)
    throw new Error("Indiquez d’abord la date limite des priorités dans les paramètres.");
  const { plan } = await loadClaims(edition);
  const expires = endOfDayBrussels(edition.priorityDeadline);
  await db.transaction(async (tx) => {
    for (const o of plan.offers) {
      await createBooking(tx, {
        editionId: edition.id,
        year: edition.year,
        contactId: o.contactId,
        status: "offered",
        source: "priority",
        priorityReason: mainReason(o.reasons),
        spotIds: o.spotIds,
        offerExpiresAt: expires,
      });
    }
  });
  return plan.offers.length;
}

/** The organiser settles a conflict: the spot goes to `contactId`'s offer. */
export async function assignConflict(
  edition: Edition,
  spotId: number,
  contactId: number,
  reasons: PriorityReason[],
) {
  if (!edition.priorityDeadline)
    throw new Error("Indiquez d’abord la date limite des priorités dans les paramètres.");
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.editionId, edition.id),
          eq(bookings.contactId, contactId),
          eq(bookings.status, "offered"),
          eq(bookings.source, "priority"),
        ),
      )
      .limit(1);
    if (existing) {
      await tx.insert(bookingSpots).values({ bookingId: existing.id, spotId, editionId: edition.id });
    } else {
      await createBooking(tx, {
        editionId: edition.id,
        year: edition.year,
        contactId,
        status: "offered",
        source: "priority",
        priorityReason: reasons.length ? mainReason(reasons) : "manual",
        spotIds: [spotId],
        offerExpiresAt: endOfDayBrussels(edition.priorityDeadline!),
      });
    }
  });
}
