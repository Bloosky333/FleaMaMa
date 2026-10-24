"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { bookings, contacts, residentLinks, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normalizeEmail, normalizePhone } from "@/lib/contacts";
import { type DuplicateCandidate, findDuplicates } from "@/lib/contacts-server";

export type ContactFormState =
  { error?: string; duplicates?: DuplicateCandidate[]; values?: Record<string, string> } | undefined;

const contactSchema = z
  .object({
    lastName: z.string().trim().max(100),
    firstName: z.string().trim().max(100),
    company: z.string().trim().max(200),
    street: z.string().trim().max(200),
    houseNumber: z.string().trim().max(20),
    postcode: z.string().trim().max(10),
    city: z.string().trim().max(100),
    phone: z.string().trim().max(40),
    email: z.union([z.literal(""), z.string().trim().email("Email invalide.")]),
    kind: z.enum(["private", "pro"]),
    vatNumber: z.string().trim().max(30),
    notes: z.string().max(5000),
  })
  .refine((c) => c.lastName || c.company, { message: "Indiquez au moins un nom ou une société." });

function readForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  return {
    lastName: get("lastName"),
    firstName: get("firstName"),
    company: get("company"),
    street: get("street"),
    houseNumber: get("houseNumber"),
    postcode: get("postcode"),
    city: get("city"),
    phone: get("phone"),
    email: get("email").trim(),
    kind: get("kind") || "private",
    vatNumber: get("vatNumber"),
    notes: get("notes"),
  };
}

export async function saveContact(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  await requireUser();
  const raw = readForm(formData);
  const id = Number(formData.get("id")) || undefined;
  const force = formData.get("force") === "1";
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: raw };

  const values = {
    ...parsed.data,
    phone: normalizePhone(parsed.data.phone),
    email: normalizeEmail(parsed.data.email),
    vatNumber: parsed.data.kind === "pro" ? parsed.data.vatNumber : "",
  };

  if (!force) {
    const duplicates = await findDuplicates(values, id);
    if (duplicates.length) return { duplicates, values: raw };
  }

  let contactId = id;
  if (id) {
    await db.update(contacts).set(values).where(eq(contacts.id, id));
  } else {
    const [row] = await db.insert(contacts).values(values).returning({ id: contacts.id });
    contactId = row.id;
  }
  revalidatePath("/admin/exposants");
  redirect(`/admin/exposants/${contactId}?enregistre`);
}

export async function deleteContact(id: number) {
  await requireUser();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.contactId, id));
  if (n > 0) {
    redirect(`/admin/exposants/${id}?erreur=reservations`);
  }
  await db.delete(contacts).where(eq(contacts.id, id));
  revalidatePath("/admin/exposants");
  redirect("/admin/exposants");
}

export type LinkState = { error?: string } | undefined;

/** Marks the contact as living in front of the given spot (validated by the organiser). */
export async function addResidentLink(
  contactId: number,
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const user = await requireUser();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Indiquez un numéro d’emplacement." };
  const [spot] = await db
    .select({ id: spots.id })
    .from(spots)
    .where(sql`lower(${spots.label}) = ${label.toLowerCase()}`);
  if (!spot) return { error: `L’emplacement n°${label} n’existe pas.` };
  await db
    .insert(residentLinks)
    .values({ contactId, spotId: spot.id, validatedAt: new Date(), validatedBy: user.id })
    .onConflictDoNothing();
  revalidatePath(`/admin/exposants/${contactId}`);
  return undefined;
}

export async function linkResidentSpot(contactId: number, spotId: number) {
  const user = await requireUser();
  await db
    .insert(residentLinks)
    .values({ contactId, spotId, validatedAt: new Date(), validatedBy: user.id })
    .onConflictDoNothing();
  revalidatePath(`/admin/exposants/${contactId}`);
}

export async function removeResidentLink(contactId: number, spotId: number) {
  await requireUser();
  await db
    .delete(residentLinks)
    .where(and(eq(residentLinks.contactId, contactId), eq(residentLinks.spotId, spotId)));
  revalidatePath(`/admin/exposants/${contactId}`);
}
