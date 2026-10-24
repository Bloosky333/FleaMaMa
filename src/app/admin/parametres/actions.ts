"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { db } from "@/db";
import { editions, emailTemplates, tariffs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { loadTariffGrid, saveTariffGrid, setSettings } from "@/lib/editions";
import { enqueueEmails, processOutbox, PRIORITY_TRANSACTIONAL } from "@/lib/email/outbox";
import { isTemplateKey } from "@/lib/email/templates";
import { getSettings } from "@/lib/editions";
import { parseEuros } from "@/lib/pricing";

/** New edition: copies prices and payment instructions from the last edition that had them. */
export async function createEdition(formData: FormData) {
  await requireUser();
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) redirect("/admin/parametres?erreur=annee");
  const [model] = await db
    .selectDistinct({
      id: editions.id,
      paymentInstructions: editions.paymentInstructions,
      iban: editions.iban,
    })
    .from(editions)
    .innerJoin(tariffs, eq(tariffs.editionId, editions.id))
    .orderBy(desc(editions.id))
    .limit(1);
  const [edition] = await db
    .insert(editions)
    .values({ year, paymentInstructions: model?.paymentInstructions ?? "", iban: model?.iban ?? null })
    .onConflictDoNothing()
    .returning({ id: editions.id });
  if (edition && model) await saveTariffGrid(edition.id, await loadTariffGrid(model.id));
  revalidatePath("/admin", "layout");
  redirect("/admin/parametres");
}

const date = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) => v || null);

const editionSchema = z.object({
  status: z.enum(["preparation", "priority", "open", "closed"]),
  marketDate: date,
  priorityDeadline: date,
  earlyBirdDeadline: date,
  paymentDeadline: date,
  refundDeadline: date,
  publicOpeningDate: date,
  paymentInstructions: z.string().max(3000),
  iban: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
});

export async function saveEdition(
  editionId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const parsed = editionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Vérifiez les dates." };
  const prices = Object.fromEntries(
    ["private_early", "private_normal", "pro_early", "pro_normal"].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ]),
  );
  const grid = {
    private: { early: parseEuros(prices.private_early), normal: parseEuros(prices.private_normal) },
    pro: { early: parseEuros(prices.pro_early), normal: parseEuros(prices.pro_normal) },
  };
  for (const [k, v] of Object.entries(prices)) {
    if (v.trim() && parseEuros(v) === null) return { error: `Prix invalide : « ${v} » (${k}).` };
  }
  await db.update(editions).set(parsed.data).where(eq(editions.id, editionId));
  await saveTariffGrid(editionId, grid);
  revalidatePath("/admin", "layout");
  return { ok: "Paramètres enregistrés." };
}

const emailSettingsSchema = z.object({
  organizerName: z.string().trim().min(1).max(200),
  outboxBatchSize: z.coerce.number().int().min(1).max(100),
  outboxDailyCap: z.coerce.number().int().min(1).max(2000),
});

export async function saveEmailSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = emailSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Valeurs invalides." };
  await setSettings(parsed.data);
  revalidatePath("/admin/parametres");
  return { ok: "Réglages des emails enregistrés." };
}

export async function sendTestEmail(): Promise<FormState> {
  const user = await requireUser();
  const settings = await getSettings();
  await enqueueEmails(
    [{ to: user.email, template: "test", vars: { organisateur: settings.organizerName } }],
    {
      priority: PRIORITY_TRANSACTIONAL,
    },
  );
  after(processOutbox);
  return { ok: `Email de test ajouté à la file d’envoi, vers ${user.email}.` };
}

export async function saveTemplate(key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!isTemplateKey(key)) return { error: "Modèle inconnu." };
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!subject || !body.trim()) return { error: "Le sujet et le texte sont obligatoires." };
  await db
    .insert(emailTemplates)
    .values({ key, subject, body })
    .onConflictDoUpdate({ target: emailTemplates.key, set: { subject, body } });
  revalidatePath("/admin/parametres/emails");
  return { ok: "Modèle enregistré." };
}

export async function resetTemplate(key: string) {
  await requireUser();
  await db.delete(emailTemplates).where(eq(emailTemplates.key, key));
  revalidatePath("/admin/parametres/emails");
}
