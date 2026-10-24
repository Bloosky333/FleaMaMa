/** Dates are stored as "YYYY-MM-DD" and interpreted in Belgian time. */

export const TIME_ZONE = "Europe/Brussels";

/** Today's date in Brussels as "YYYY-MM-DD". */
export function todayBrussels(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** The last instant of the given day in Brussels (23:59:59.999 local time). */
export function endOfDayBrussels(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  // Start from that wall-clock time read as UTC, then correct by Brussels' offset on that day.
  const asUtc = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const shownAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
    999,
  );
  return new Date(asUtc - (shownAsUtc - asUtc));
}

/** "2027-05-01" → "1er mai 2027" ("samedi 1er mai 2027" with weekday). */
export function formatDateFr(date: string | null | undefined, withWeekday = false): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-BE", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withWeekday && { weekday: "long" }),
  })
    .formatToParts(new Date(Date.UTC(y, m - 1, d)))
    .map((p) => (p.type === "day" && p.value === "1" ? "1er" : p.value))
    .join("");
}

/** Brussels calendar date of a timestamp. */
export function toBrusselsDate(at: Date): string {
  return todayBrussels(at);
}

/** "2027-05-01" + 7 → "2027-05-08". */
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
