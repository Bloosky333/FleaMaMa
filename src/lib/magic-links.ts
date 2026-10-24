import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { magicLinks } from "@/db/schema";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Personal link for an exhibitor's booking. Only the hash is stored. */
export async function createMagicLink(
  contactId: number,
  bookingId: number,
  validDays = 365,
): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(magicLinks).values({
    tokenHash: hash(token),
    contactId,
    bookingId,
    expiresAt: new Date(Date.now() + validDays * 24 * 3600 * 1000),
  });
  return token;
}

export async function resolveMagicLink(
  token: string,
): Promise<{ contactId: number; bookingId: number } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [link] = await db
    .select({ contactId: magicLinks.contactId, bookingId: magicLinks.bookingId })
    .from(magicLinks)
    .where(and(eq(magicLinks.tokenHash, hash(token)), gt(magicLinks.expiresAt, new Date())));
  return link?.bookingId ? { contactId: link.contactId, bookingId: link.bookingId } : null;
}

/** Public base URL for links in emails: APP_URL, else the host of the current request. */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function bookingLink(contactId: number, bookingId: number): Promise<string> {
  return `${await appUrl()}/r/${await createMagicLink(contactId, bookingId)}`;
}
