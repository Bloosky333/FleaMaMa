/** Pure helpers for phase 2: requests from exhibitors without priority (spec §4.5 steps 9-12). */

type EditionDates = { status: string; publicOpeningDate: string | null };

/** Public requests are open when the organiser says so, or from the opening date on. */
export function isPublicBookingOpen(edition: EditionDates, today: string): boolean {
  if (edition.status === "closed") return false;
  if (edition.status === "open") return true;
  return edition.publicOpeningDate !== null && today >= edition.publicOpeningDate;
}

export type GeoSpot = { id: number; label: string; street: string; x: number; y: number };

/**
 * Free spots to propose instead of `wanted` (taken): same street first, then nearest on the plan.
 * Returns up to `limit` groups of `count` spots, each group made of spots close to each other.
 */
export function suggestSpots(wanted: GeoSpot[], free: GeoSpot[], count: number, limit = 3): GeoSpot[][] {
  if (!wanted.length || !free.length || count < 1) return [];
  const cx = wanted.reduce((t, s) => t + s.x, 0) / wanted.length;
  const cy = wanted.reduce((t, s) => t + s.y, 0) / wanted.length;
  const streets = new Set(wanted.map((s) => s.street).filter(Boolean));
  const dist = (s: { x: number; y: number }, x: number, y: number) => Math.hypot(s.x - x, s.y - y);
  const rank = (s: GeoSpot) => (streets.has(s.street) ? 0 : 1e9) + dist(s, cx, cy);
  const seeds = [...free].sort((a, b) => rank(a) - rank(b));

  const groups: GeoSpot[][] = [];
  const used = new Set<number>();
  for (const seed of seeds) {
    if (groups.length >= limit) break;
    if (used.has(seed.id)) continue;
    // The seed plus its nearest free neighbours (not already proposed).
    const near = (s: GeoSpot) => (s.street === seed.street ? 0 : 1e9) + dist(s, seed.x, seed.y);
    const neighbours = free
      .filter((s) => s.id !== seed.id && !used.has(s.id))
      .sort((a, b) => near(a) - near(b));
    const group = [seed, ...neighbours].slice(0, count);
    if (group.length < count) continue;
    group.forEach((s) => used.add(s.id));
    groups.push(group);
  }
  return groups;
}
