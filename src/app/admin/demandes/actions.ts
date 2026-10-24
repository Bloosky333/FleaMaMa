"use server";

import { inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { processOutbox } from "@/lib/email/outbox";
import { parseSpotList } from "@/lib/import";
import { acceptRequest, proposeAlternative, refuseRequest, waitlistRequest } from "@/lib/requests-server";

function refresh() {
  revalidatePath("/admin/demandes");
  revalidatePath("/admin/carte");
  revalidatePath("/admin/reservations");
}

/** "12-13, 20" → spot ids, or an error naming unknown numbers. */
async function spotIdsFromLabels(input: string): Promise<{ ids?: number[]; error?: string }> {
  const { labels, error } = parseSpotList(input);
  if (error) return { error };
  if (!labels.length) return { error: "Indiquez des numéros d’emplacement." };
  const rows = await db
    .select({ id: spots.id, label: spots.label })
    .from(spots)
    .where(
      inArray(
        sql`lower(${spots.label})`,
        labels.map((l) => l.toLowerCase()),
      ),
    );
  if (rows.length !== labels.length) {
    const known = new Set(rows.map((r) => r.label.toLowerCase()));
    return { error: `Emplacement inconnu : ${labels.filter((l) => !known.has(l.toLowerCase())).join(", ")}` };
  }
  return { ids: rows.map((r) => r.id) };
}

export async function handleRequest(
  bookingId: number,
  decision: "accept" | "propose",
  spotIds: number[] | string,
): Promise<{ error?: string }> {
  await requireUser();
  let ids: number[];
  if (typeof spotIds === "string") {
    const parsed = await spotIdsFromLabels(spotIds);
    if (parsed.error) return { error: parsed.error };
    ids = parsed.ids!;
  } else {
    ids = spotIds;
  }
  const res =
    decision === "accept" ? await acceptRequest(bookingId, ids) : await proposeAlternative(bookingId, ids);
  if (!res.error) after(processOutbox);
  refresh();
  return res;
}

export async function putOnWaitlist(bookingId: number) {
  await requireUser();
  await waitlistRequest(bookingId);
  after(processOutbox);
  refresh();
}

export async function refuse(bookingId: number) {
  await requireUser();
  await refuseRequest(bookingId);
  refresh();
}
