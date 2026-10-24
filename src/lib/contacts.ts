/** Pure helpers for contact data: normalization and duplicate detection. */

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Normalizes a Belgian-style phone number to E.164 when possible
 * ("0475 12 34 56" → "+32475123456", "0032 2 123 45 67" → "+3221234567").
 * Returns the trimmed input when it doesn't look like a phone number.
 */
export function normalizePhone(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  let digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  else if (digits.startsWith("0")) digits = "+32" + digits.slice(1);
  else if (!digits.startsWith("+") && digits.length >= 8) digits = "+32" + digits;
  return /^\+\d{8,15}$/.test(digits) ? digits : trimmed;
}

/** Display format for Belgian numbers: +32475123456 → 0475 12 34 56. */
export function formatPhone(s: string): string {
  if (!s.startsWith("+32")) return s;
  const local = "0" + s.slice(3);
  if (local.length === 10)
    return `${local.slice(0, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
  if (local.length === 9) {
    // Landlines: Brussels, Antwerp, Liège and Ghent have 2-digit zones, others 3 digits.
    if (/^0[2349]/.test(local)) {
      return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
    }
    return `${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
  }
  return local;
}

export type ContactLike = {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  postcode: string;
};

export type DuplicateMatch = { reason: string; score: number };

/** Why `b` may be the same person as `a` (null if no meaningful similarity). */
export function duplicateReason(a: ContactLike, b: ContactLike): DuplicateMatch | null {
  const reasons: string[] = [];
  let score = 0;
  if (a.email && b.email && normalizeEmail(a.email) === normalizeEmail(b.email)) {
    reasons.push("même email");
    score += 3;
  }
  if (a.phone && b.phone && normalizePhone(a.phone) === normalizePhone(b.phone)) {
    reasons.push("même téléphone");
    score += 3;
  }
  const sameLast = a.lastName && normalizeText(a.lastName) === normalizeText(b.lastName);
  const sameFirst = a.firstName && normalizeText(a.firstName) === normalizeText(b.firstName);
  if (sameLast && sameFirst) {
    reasons.push("même nom");
    score += 2;
  }
  const sameAddress =
    a.street &&
    normalizeText(a.street) === normalizeText(b.street) &&
    normalizeText(a.houseNumber) === normalizeText(b.houseNumber) &&
    (!a.postcode || !b.postcode || a.postcode.trim() === b.postcode.trim());
  if (sameAddress && sameLast) {
    reasons.push("même nom de famille et adresse");
    score += 2;
  }
  if (score < 2) return null;
  return { reason: reasons.join(", "), score };
}

/** Comparable form of an address: "Rue Haute, 12" and "rue haute 12" give the same key. */
export function addressKey(street: string, houseNumber = ""): string {
  return normalizeText(`${street} ${houseNumber}`);
}

export function displayName(c: { firstName: string; lastName: string; company: string }): string {
  const person = [c.lastName.toUpperCase(), c.firstName].filter(Boolean).join(" ");
  if (person && c.company) return `${person} (${c.company})`;
  return person || c.company || "Sans nom";
}
