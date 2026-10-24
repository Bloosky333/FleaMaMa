"use server";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { plans, spots, type Spot } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadPlan(formData: FormData): Promise<Result<{ id: number }>> {
  await requireUser();
  const file = formData.get("image");
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!(file instanceof File) || !IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Format d’image non supporté (JPEG, PNG ou WebP)." };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image trop lourde (max 4 Mo)." };
  if (!(width > 0 && height > 0)) return { ok: false, error: "Dimensions de l’image invalides." };

  const [previous] = await db.select().from(plans).orderBy(desc(plans.id)).limit(1);
  const data = Buffer.from(await file.arrayBuffer());

  const id = await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        imageMime: file.type,
        imageData: data,
        width,
        height,
        ...(previous
          ? {
              defaultSpotWidth: previous.defaultSpotWidth * (width / previous.width),
              defaultSpotHeight: previous.defaultSpotHeight * (height / previous.height),
              defaultSpotLengthM: previous.defaultSpotLengthM,
            }
          : // A first guess the organiser refines with "use its size as default".
            {
              defaultSpotWidth: Math.max(width, height) / 40,
              defaultSpotHeight: Math.max(width, height) / 80,
            }),
      })
      .returning({ id: plans.id });
    // Keep existing spots where they were, relative to the new image size.
    if (previous && (previous.width !== width || previous.height !== height)) {
      const sx = width / previous.width;
      const sy = height / previous.height;
      await tx.update(spots).set({
        x: sql`${spots.x} * ${sx}`,
        y: sql`${spots.y} * ${sy}`,
        width: sql`${spots.width} * ${sx}`,
        height: sql`${spots.height} * ${sy}`,
      });
    }
    // Only the current plan is kept.
    await tx.delete(plans).where(sql`${plans.id} <> ${plan.id}`);
    return plan.id;
  });

  revalidatePath("/admin/plan");
  return { ok: true, data: { id } };
}

const defaultsSchema = z.object({
  defaultSpotWidth: z.number().positive(),
  defaultSpotHeight: z.number().positive(),
  defaultSpotLengthM: z.number().positive().max(100),
});

export async function updatePlanDefaults(input: z.input<typeof defaultsSchema>): Promise<Result<null>> {
  await requireUser();
  const parsed = defaultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Valeurs invalides." };
  await db.update(plans).set(parsed.data);
  return { ok: true, data: null };
}

const shapeSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().finite(),
});

const newSpotSchema = shapeSchema.extend({
  label: z.string().trim().min(1).max(20),
  street: z.string().trim().max(200).optional(),
});

export async function createSpots(input: z.input<typeof newSpotSchema>[]): Promise<Result<Spot[]>> {
  await requireUser();
  const parsed = z.array(newSpotSchema).min(1).max(500).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données d’emplacement invalides." };

  const labels = parsed.data.map((s) => s.label.toLowerCase());
  if (new Set(labels).size !== labels.length) return { ok: false, error: "Numéros en double." };
  const existing = await db
    .select({ label: spots.label })
    .from(spots)
    .where(inArray(sql`lower(${spots.label})`, labels));
  if (existing.length) {
    return {
      ok: false,
      error: `Numéro(s) déjà utilisé(s) : ${existing.map((s) => s.label).join(", ")}.`,
    };
  }
  try {
    const rows = await db.insert(spots).values(parsed.data).returning();
    revalidatePath("/admin/emplacements");
    return { ok: true, data: rows };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "Ce numéro existe déjà." };
    throw err;
  }
}

const patchSchema = shapeSchema.partial().extend({
  id: z.number().int(),
  label: z.string().trim().min(1).max(20).optional(),
  street: z.string().trim().max(200).optional(),
  side: z.string().trim().max(50).optional(),
  lengthM: z.number().positive().max(100).nullable().optional(),
  facingAddresses: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  notes: z.string().max(2000).optional(),
  active: z.boolean().optional(),
});

export type SpotPatch = z.input<typeof patchSchema>;

export async function updateSpots(patches: SpotPatch[]): Promise<Result<Spot[]>> {
  await requireUser();
  const parsed = z.array(patchSchema).min(1).max(500).safeParse(patches);
  if (!parsed.success) return { ok: false, error: "Données d’emplacement invalides." };
  try {
    const rows = await db.transaction(async (tx) => {
      const out: Spot[] = [];
      for (const { id, ...values } of parsed.data) {
        if (Object.keys(values).length === 0) continue;
        const [row] = await tx.update(spots).set(values).where(eq(spots.id, id)).returning();
        if (row) out.push(row);
      }
      return out;
    });
    revalidatePath("/admin/emplacements");
    return { ok: true, data: rows };
  } catch (err) {
    if (isUniqueViolation(err))
      return { ok: false, error: "Ce numéro est déjà utilisé par un autre emplacement." };
    throw err;
  }
}

export async function deleteSpots(ids: number[]): Promise<Result<null>> {
  await requireUser();
  const parsed = z.array(z.number().int()).min(1).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };
  try {
    await db.delete(spots).where(inArray(spots.id, parsed.data));
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return {
        ok: false,
        error: "Impossible de supprimer un emplacement qui a déjà été réservé. Désactivez-le plutôt.",
      };
    }
    throw err;
  }
  revalidatePath("/admin/emplacements");
  return { ok: true, data: null };
}
