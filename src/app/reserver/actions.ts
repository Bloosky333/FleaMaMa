"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { todayBrussels } from "@/lib/dates";
import { getCurrentEdition } from "@/lib/editions";
import { processOutbox } from "@/lib/email/outbox";
import { isPublicBookingOpen } from "@/lib/requests";
import { createPublicRequest } from "@/lib/requests-server";

export type RequestState = { error?: string } | undefined;

const schema = z
  .object({
    lastName: z.string().trim().min(1, "Indiquez votre nom.").max(100),
    firstName: z.string().trim().max(100),
    company: z.string().trim().max(200),
    kind: z.enum(["private", "pro"]),
    vatNumber: z.string().trim().max(30),
    street: z.string().trim().min(1, "Indiquez votre adresse.").max(200),
    houseNumber: z.string().trim().max(20),
    postcode: z.string().trim().min(4, "Indiquez votre code postal.").max(10),
    city: z.string().trim().min(1, "Indiquez votre localité.").max(100),
    phone: z.string().trim().min(6, "Indiquez votre téléphone.").max(40),
    email: z.string().trim().email("Adresse email invalide."),
    message: z.string().max(2000),
    consent: z.literal("on", { message: "Merci d’accepter l’utilisation de vos données pour la brocante." }),
    choices: z.string(),
    website: z.string().max(0), // honeypot: bots fill every field
  })
  .refine((v) => v.kind === "private" || v.vatNumber, {
    message: "Indiquez votre n° d’entreprise (BCE/TVA).",
  });

export async function submitRequest(_prev: RequestState, formData: FormData): Promise<RequestState> {
  const raw = Object.fromEntries(
    [
      "lastName",
      "firstName",
      "company",
      "kind",
      "vatNumber",
      "street",
      "houseNumber",
      "postcode",
      "city",
      "phone",
      "email",
      "message",
      "consent",
      "choices",
      "website",
    ].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let choices: number[][];
  try {
    choices = z.array(z.array(z.number().int()).max(6)).max(3).parse(JSON.parse(parsed.data.choices));
  } catch {
    return { error: "Choix d’emplacements invalides." };
  }
  const edition = await getCurrentEdition();
  if (!edition || !isPublicBookingOpen(edition, todayBrussels()))
    return { error: "Les réservations ne sont pas ouvertes." };
  const res = await createPublicRequest(edition, { ...parsed.data, choices });
  if (res.error || !res.token) return { error: res.error ?? "Erreur inattendue." };
  after(processOutbox);
  redirect(`/r/${res.token}?nouveau`);
}
