/** Spot prices (spec §4.4): per spot, by exhibitor kind and early-bird date. */

export type TariffGrid = {
  private: { early: number | null; normal: number | null };
  pro: { early: number | null; normal: number | null };
};

export type TariffRow = { kind: "private" | "pro"; earlyBird: boolean; pricePerSpotCents: number };

export function tariffGrid(rows: TariffRow[]): TariffGrid {
  const grid: TariffGrid = { private: { early: null, normal: null }, pro: { early: null, normal: null } };
  for (const r of rows) grid[r.kind][r.earlyBird ? "early" : "normal"] = r.pricePerSpotCents;
  return grid;
}

/**
 * Price per spot for a booking confirmed on `bookedOn` ("YYYY-MM-DD", Brussels).
 * The early-bird price applies up to and including the early-bird deadline; without
 * an early-bird price the normal price applies. Null when no price is configured.
 */
export function pricePerSpot(
  grid: TariffGrid,
  kind: "private" | "pro",
  bookedOn: string,
  earlyBirdDeadline: string | null,
): number | null {
  const prices = grid[kind];
  const early = earlyBirdDeadline !== null && bookedOn <= earlyBirdDeadline;
  return (early ? prices.early : null) ?? prices.normal;
}

export function amountDue(
  grid: TariffGrid,
  kind: "private" | "pro",
  spotCount: number,
  bookedOn: string,
  earlyBirdDeadline: string | null,
): number | null {
  const unit = pricePerSpot(grid, kind, bookedOn, earlyBirdDeadline);
  return unit === null ? null : unit * spotCount;
}

export function formatEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** "12,50" / "12.5" / "12" → 1250 cents; null if empty or invalid. */
export function parseEuros(input: string): number | null {
  const v = input.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
