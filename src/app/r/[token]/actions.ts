"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { appendBookingNote, confirmBooking, setBookingClosed } from "@/lib/bookings-server";
import { normalizeEmail, normalizePhone } from "@/lib/contacts";
import { processOutbox } from "@/lib/email/outbox";
import { resolveMagicLink } from "@/lib/magic-links";

export type RespondState = { error?: string } | undefined;

const detailsSchema = z.object({
  phone: z.string().trim().max(40),
  email: z.union([z.literal(""), z.string().trim().email("Adresse email invalide.")]),
  street: z.string().trim().max(200),
  houseNumber: z.string().trim().max(20),
  postcode: z.string().trim().max(10),
  city: z.string().trim().max(100),
});

export async function respondToOffer(
  token: string,
  _prev: RespondState,
  formData: FormData,
): Promise<RespondState> {
  const link = await resolveMagicLink(token);
  if (!link) return { error: "Ce lien n’est plus valable." };
  const decision = formData.get("decision");
  const details = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!details.success) return { error: details.error.issues[0].message };

  await db
    .update(contacts)
    .set({
      ...details.data,
      phone: normalizePhone(details.data.phone),
      email: normalizeEmail(details.data.email),
    })
    .where(eq(contacts.id, link.contactId));

  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 2000);
  if (message) {
    const when = new Date().toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" });
    await appendBookingNote(link.bookingId, `Message de l’exposant (${when}) : ${message}`);
  }

  if (decision === "decline") {
    await setBookingClosed(link.bookingId, "declined");
  } else if (decision === "confirm") {
    const keep = formData.getAll("spot").map(Number).filter(Number.isInteger);
    const res = await confirmBooking(link.bookingId, keep);
    if (res.error) return { error: res.error };
    after(processOutbox);
  } else {
    return { error: "Choisissez de confirmer ou non." };
  }
  redirect(`/r/${token}`);
}
