import "server-only";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { type ContactLike, duplicateReason } from "./contacts";

export type DuplicateCandidate = { id: number; name: string; city: string; reason: string };

/** Existing contacts that may be the same person. Fine for a few thousand contacts. */
export async function findDuplicates(
  candidate: ContactLike,
  excludeId?: number,
): Promise<DuplicateCandidate[]> {
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      email: contacts.email,
      phone: contacts.phone,
      street: contacts.street,
      houseNumber: contacts.houseNumber,
      postcode: contacts.postcode,
      city: contacts.city,
    })
    .from(contacts)
    .where(isNull(contacts.mergedIntoId));
  return rows
    .filter((r) => r.id !== excludeId)
    .map((r) => ({ r, m: duplicateReason(candidate, r) }))
    .filter((x): x is { r: (typeof rows)[number]; m: NonNullable<typeof x.m> } => x.m !== null)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, 5)
    .map(({ r, m }) => ({
      id: r.id,
      name: [r.lastName.toUpperCase(), r.firstName].filter(Boolean).join(" ") || r.company,
      city: r.city,
      reason: m.reason,
    }));
}
