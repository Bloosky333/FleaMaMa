import { eq } from "drizzle-orm";
import { db } from "@/db";
import { importPhotos } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

// Photos of the old database contain personal data: organisers only.
export async function GET(_request: Request, { params }: RouteContext<"/api/import/photo/[id]">) {
  if (!(await getCurrentUser())) return new Response("Non autorisé", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Introuvable", { status: 404 });
  const [photo] = await db
    .select({ mime: importPhotos.mime, data: importPhotos.data })
    .from(importPhotos)
    .where(eq(importPhotos.id, id));
  if (!photo) return new Response("Introuvable", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=86400" },
  });
}
