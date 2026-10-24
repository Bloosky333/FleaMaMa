import { timingSafeEqual } from "node:crypto";
import { expireOffers } from "@/lib/bookings-server";
import { getCurrentEdition } from "@/lib/editions";
import { processOutbox } from "@/lib/email/outbox";

/**
 * Scheduled job (every ~10 minutes, see .github/workflows/outbox.yml): sends the next email
 * batch and expires overdue offers. Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const edition = await getCurrentEdition();
  const expired = edition ? await expireOffers(edition.id) : 0;
  const result = await processOutbox();
  return Response.json({ ...result, expired });
}
