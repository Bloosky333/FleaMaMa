import { desc } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";

// The plan is a hand-drawn street drawing; it will also be shown on the public request page.
export async function GET(request: Request) {
  const [plan] = await db
    .select({ id: plans.id, mime: plans.imageMime, data: plans.imageData })
    .from(plans)
    .orderBy(desc(plans.id))
    .limit(1);
  if (!plan) return new Response("Aucun plan", { status: 404 });
  // Callers pass ?v=<plan id>: a given id never changes, so it can be cached for good.
  const versioned = new URL(request.url).searchParams.get("v") === String(plan.id);
  return new Response(new Uint8Array(plan.data), {
    headers: {
      "Content-Type": plan.mime,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
}
