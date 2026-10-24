"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, hasAnyUser, requireUser } from "@/lib/auth";

export type FormState = { error?: string; ok?: string } | undefined;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Email ou mot de passe invalide." };
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email));
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "Email ou mot de passe incorrect." };
  }
  await createSession(user.id);
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const userSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis."),
  email: z.string().trim().toLowerCase().email("Email invalide."),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères."),
});

/** First-run setup: only allowed while no organiser account exists. */
export async function setupFirstUser(_prev: FormState, formData: FormData): Promise<FormState> {
  if (await hasAnyUser()) redirect("/login");
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [user] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    })
    .returning({ id: users.id });
  await createSession(user.id);
  redirect("/admin");
}

/** An existing organiser adds another organiser (all are admins). */
export async function addUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
  if (existing.length) return { error: "Un organisateur avec cet email existe déjà." };
  await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await bcrypt.hash(parsed.data.password, 10),
  });
  return { ok: `${parsed.data.name} peut maintenant se connecter.` };
}
