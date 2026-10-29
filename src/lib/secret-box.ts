import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts small secrets stored in the database (the Gmail app password) with a key derived
 * from SESSION_SECRET, so a database dump alone does not reveal them. AES-256-GCM.
 */
function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set.");
  return createHash("sha256").update(`fleamama:settings:${secret}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64")))
    .join(":");
}

/** Null when the value cannot be read (corrupted, or SESSION_SECRET changed since). */
export function unseal(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
