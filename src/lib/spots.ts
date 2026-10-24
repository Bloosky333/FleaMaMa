/** Pure helpers for spot labels and geometry (shared by client and server). */

export type SpotShape = { x: number; y: number; width: number; height: number; rotation: number };

/** Splits a label like "12bis" into its number (12) and suffix ("bis"). */
export function parseLabel(label: string): { num: number | null; suffix: string } {
  const m = /^\s*(\d+)\s*(.*?)\s*$/.exec(label);
  if (!m) return { num: null, suffix: label.trim() };
  return { num: Number(m[1]), suffix: m[2] };
}

/** Natural order: 2 < 10 < 10bis < 11 < "A" (non-numeric labels last, alphabetically). */
export function compareLabels(a: string, b: string): number {
  const pa = parseLabel(a);
  const pb = parseLabel(b);
  if (pa.num !== null && pb.num !== null && pa.num !== pb.num) return pa.num - pb.num;
  if (pa.num === null && pb.num !== null) return 1;
  if (pa.num !== null && pb.num === null) return -1;
  return pa.suffix.localeCompare(pb.suffix, "fr", { numeric: true, sensitivity: "base" });
}

/** Next free numeric label after `previous` (suffix dropped: "12bis" → "13"), skipping used labels. */
export function nextLabel(previous: string | undefined, used: Iterable<string>): string {
  const taken = new Set(Array.from(used, (l) => l.trim().toLowerCase()));
  let n: number;
  if (previous === undefined) {
    n = 1;
  } else {
    const { num } = parseLabel(previous);
    n = num === null ? 1 : num + 1;
  }
  while (taken.has(String(n))) n++;
  return String(n);
}

/** Labels for a row of `count` spots starting at `start` ("12" → 12, 13, …). */
export function rowLabels(start: string, count: number): string[] {
  const { num, suffix } = parseLabel(start);
  if (num === null) throw new Error("Le numéro de départ doit commencer par un nombre.");
  return Array.from({ length: count }, (_, i) => (i === 0 ? `${num}${suffix}` : String(num + i)));
}

/**
 * Splits the segment start→end into `count` contiguous rectangles of the given depth,
 * aligned with the segment (Konva rotation, degrees clockwise).
 */
export function rowShapes(
  start: { x: number; y: number },
  end: { x: number; y: number },
  count: number,
  depth: number,
): SpotShape[] {
  if (count < 1) return [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
  const width = length / count;
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return {
      x: start.x + dx * t,
      y: start.y + dy * t,
      width,
      height: depth,
      rotation,
    };
  });
}
