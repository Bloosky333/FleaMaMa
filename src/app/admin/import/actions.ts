"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { importBatches, importPhotos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { extractionErrorMessage, extractRowsFromPhoto } from "@/lib/extract-photo";
import { emptyRowData, type GridRow, IMPORT_FIELDS, type ImportRowData } from "@/lib/import";
import {
  analyzeRows,
  commitBatch,
  type RowAnalysis,
  rollbackBatch,
  saveBatchRows,
} from "@/lib/import-server";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createImportBatch(formData: FormData) {
  await requireUser();
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 1990 || year > 2100) redirect("/admin/import?erreur=annee");
  const [batch] = await db
    .insert(importBatches)
    .values({ year, source: "manual" })
    .returning({ id: importBatches.id });
  redirect(`/admin/import/${batch.id}`);
}

export async function deleteImportBatch(batchId: number) {
  await requireUser();
  await db.delete(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.status, "draft")));
  revalidatePath("/admin/import");
  redirect("/admin/import");
}

const rowSchema = z.object({
  key: z.string(),
  data: z.object(Object.fromEntries(IMPORT_FIELDS.map((f) => [f, z.string().max(500)]))),
  uncertain: z.array(z.string()).max(20),
  photoId: z.number().int().nullable(),
  action: z.enum(["auto", "new", "existing", "skip"]),
  matchContactId: z.number().int().nullable(),
});
const rowsSchema = z.array(rowSchema).max(2000);

function parseRows(rows: unknown): GridRow[] | null {
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({ ...r, data: { ...emptyRowData(), ...r.data } as ImportRowData }));
}

export async function saveImportRows(batchId: number, rows: GridRow[]): Promise<Result<null>> {
  await requireUser();
  const parsed = parseRows(rows);
  if (!parsed) return { ok: false, error: "Données invalides." };
  try {
    await saveBatchRows(batchId, parsed);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  return { ok: true, data: null };
}

export async function analyzeImport(batchId: number, rows: GridRow[]): Promise<Result<RowAnalysis[]>> {
  await requireUser();
  const parsed = parseRows(rows);
  if (!parsed) return { ok: false, error: "Données invalides." };
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) return { ok: false, error: "Import introuvable." };
  return { ok: true, data: await analyzeRows(batchId, batch.year, parsed) };
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function uploadImportPhoto(
  batchId: number,
  formData: FormData,
): Promise<Result<{ id: number }>> {
  await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || !PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number])) {
    return { ok: false, error: "Format de photo non supporté." };
  }
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: "Photo trop lourde (max 4 Mo)." };
  const [photo] = await db
    .insert(importPhotos)
    .values({ batchId, mime: file.type, data: Buffer.from(await file.arrayBuffer()) })
    .returning({ id: importPhotos.id });
  await db.update(importBatches).set({ source: "photo" }).where(eq(importBatches.id, batchId));
  return { ok: true, data: { id: photo.id } };
}

/** Reads one photo with the AI. The rows are returned to the grid; the organiser reviews them before saving. */
export async function extractImportPhoto(
  photoId: number,
): Promise<Result<{ rows: (ImportRowData & { uncertain: string[] })[]; comment: string }>> {
  await requireUser();
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "La lecture par IA n’est pas configurée (clé ANTHROPIC_API_KEY manquante)." };
  }
  const [photo] = await db.select().from(importPhotos).where(eq(importPhotos.id, photoId));
  if (!photo) return { ok: false, error: "Photo introuvable." };
  try {
    const result = await extractRowsFromPhoto(photo.data, photo.mime as (typeof PHOTO_TYPES)[number]);
    await db
      .update(importPhotos)
      .set({ status: "extracted", error: null })
      .where(eq(importPhotos.id, photoId));
    return { ok: true, data: result };
  } catch (err) {
    const message = extractionErrorMessage(err);
    await db
      .update(importPhotos)
      .set({ status: "failed", error: message })
      .where(eq(importPhotos.id, photoId));
    return { ok: false, error: message };
  }
}

export async function deleteImportPhoto(photoId: number): Promise<Result<null>> {
  await requireUser();
  await db.delete(importPhotos).where(eq(importPhotos.id, photoId));
  return { ok: true, data: null };
}

export async function commitImport(
  batchId: number,
  rows: GridRow[],
): Promise<Result<{ created: number; linked: number }>> {
  await requireUser();
  const saved = await saveImportRows(batchId, rows);
  if (!saved.ok) return saved;
  const res = await commitBatch(batchId);
  if (res.errors) {
    return { ok: false, error: `${res.errors} ligne(s) à corriger avant de valider (en rouge).` };
  }
  revalidatePath("/admin/import");
  revalidatePath("/admin/exposants");
  return { ok: true, data: { created: res.created, linked: res.linked } };
}

export async function rollbackImport(batchId: number) {
  await requireUser();
  await rollbackBatch(batchId);
  revalidatePath("/admin/import");
  revalidatePath("/admin/exposants");
  redirect(`/admin/import/${batchId}?annule`);
}
