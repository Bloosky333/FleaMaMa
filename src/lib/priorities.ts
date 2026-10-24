/**
 * Priority claims (spec §4.5, Phase 0): who may be offered which spot before the open phase.
 * - whoever held the spot in the previous edition ("last_year"),
 * - the resident(s) living in front of it ("resident"), every year.
 * Spots claimed by several people are conflicts that the organiser settles.
 */

export type PriorityReason = "last_year" | "resident";

export type Claim = { spotId: number; contactId: number; reason: PriorityReason };

export type PlannedOffer = { contactId: number; spotIds: number[]; reasons: PriorityReason[] };

export type Conflict = { spotId: number; claims: { contactId: number; reasons: PriorityReason[] }[] };

export function planOffers(
  claims: Claim[],
  opts: {
    /** Spots already held in the new edition (offer, booking…): not offered again. */
    heldSpotIds: Set<number>;
    /** Contacts that already have a booking in the new edition: left alone. */
    contactsWithBooking: Set<number>;
    /** Inactive spots this edition. */
    inactiveSpotIds?: Set<number>;
  },
): { offers: PlannedOffer[]; conflicts: Conflict[] } {
  // spot → contact → reasons
  const bySpot = new Map<number, Map<number, Set<PriorityReason>>>();
  for (const c of claims) {
    if (opts.heldSpotIds.has(c.spotId) || opts.inactiveSpotIds?.has(c.spotId)) continue;
    const contacts = bySpot.get(c.spotId) ?? new Map<number, Set<PriorityReason>>();
    contacts.set(c.contactId, (contacts.get(c.contactId) ?? new Set()).add(c.reason));
    bySpot.set(c.spotId, contacts);
  }

  const offers = new Map<number, PlannedOffer>();
  const conflicts: Conflict[] = [];
  for (const [spotId, contacts] of [...bySpot].sort((a, b) => a[0] - b[0])) {
    if (contacts.size > 1) {
      conflicts.push({
        spotId,
        claims: [...contacts].map(([contactId, reasons]) => ({ contactId, reasons: [...reasons].sort() })),
      });
      continue;
    }
    const [[contactId, reasons]] = [...contacts];
    if (opts.contactsWithBooking.has(contactId)) continue;
    const offer = offers.get(contactId) ?? { contactId, spotIds: [], reasons: [] };
    offer.spotIds.push(spotId);
    offer.reasons = [...new Set([...offer.reasons, ...reasons])].sort();
    offers.set(contactId, offer);
  }
  return { offers: [...offers.values()], conflicts };
}

/** The booking's priority reason when several apply: being a resident is the stronger right. */
export function mainReason(reasons: PriorityReason[]): PriorityReason {
  return reasons.includes("resident") ? "resident" : "last_year";
}

export const reasonLabels: Record<PriorityReason | "manual", string> = {
  last_year: "Loué l’an dernier",
  resident: "Riverain",
  manual: "Attribué par l’organisateur",
};
