import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookingSpots, type Edition, spotEditionStates, spots } from "@/db/schema";
import { compareLabels } from "./spots";

/** Spots nobody holds on market day (pending priorities no longer matter then). */
export async function freeSpotsNow(edition: Edition) {
  const [all, held, inactive] = await Promise.all([
    db.select({ id: spots.id, label: spots.label, street: spots.street, active: spots.active }).from(spots),
    db
      .select({ spotId: bookingSpots.spotId })
      .from(bookingSpots)
      .where(and(eq(bookingSpots.editionId, edition.id), eq(bookingSpots.released, false))),
    db
      .select({ spotId: spotEditionStates.spotId })
      .from(spotEditionStates)
      .where(eq(spotEditionStates.editionId, edition.id)),
  ]);
  const taken = new Set([...held.map((h) => h.spotId), ...inactive.map((i) => i.spotId)]);
  return all
    .filter((s) => s.active && !taken.has(s.id))
    .map(({ id, label, street }) => ({ id, label, street }))
    .sort((a, b) => a.street.localeCompare(b.street, "fr") || compareLabels(a.label, b.label));
}
