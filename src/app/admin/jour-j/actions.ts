"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bookings, contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createManualBooking, loadBooking } from "@/lib/bookings-server";
import { normalizePhone } from "@/lib/contacts";
import { todayBrussels } from "@/lib/dates";
import { getCurrentEdition } from "@/lib/editions";
import { recordPayment } from "@/lib/payments-server";

function refresh() {
  revalidatePath("/admin/jour-j");
  revalidatePath("/admin/carte");
  revalidatePath("/admin/reservations");
}

export async function setPresence(bookingId: number, presence: "unknown" | "present" | "no_show") {
  await requireUser();
  await db.update(bookings).set({ presence }).where(eq(bookings.id, bookingId));
  refresh();
}

export type WalkInState = { error?: string; ok?: string } | undefined;

const walkInSchema = z.object({
  lastName: z.string().trim().min(1, "Indiquez le nom."),
  firstName: z.string().trim().max(100),
  phone: z.string().trim().max(40),
  kind: z.enum(["private", "pro"]),
  vatNumber: z.string().trim().max(30),
  paidCash: z.string().optional(),
});

/** Someone turns up on the day: create (or reuse by phone) the contact, book the spots, take the cash. */
export async function registerWalkIn(_prev: WalkInState, formData: FormData): Promise<WalkInState> {
  const user = await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) return { error: "Aucune édition en cours." };
  const parsed = walkInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const spotIds = formData.getAll("spot").map(Number).filter(Number.isInteger);
  if (!spotIds.length) return { error: "Choisissez au moins un emplacement." };

  const phone = normalizePhone(parsed.data.phone);
  const [existing] = phone
    ? await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.phone, phone), isNull(contacts.mergedIntoId)))
        .limit(1)
    : [];
  const contactId =
    existing?.id ??
    (
      await db
        .insert(contacts)
        .values({
          lastName: parsed.data.lastName,
          firstName: parsed.data.firstName,
          phone,
          kind: parsed.data.kind,
          vatNumber: parsed.data.kind === "pro" ? parsed.data.vatNumber : "",
          notes: `Inscrit sur place le ${todayBrussels()}`,
        })
        .returning({ id: contacts.id })
    )[0].id;

  const res = await createManualBooking({
    editionId: edition.id,
    contactId,
    spotIds,
    source: "walk_in",
    sendConfirmation: false,
  });
  if (res.error || !res.bookingId) return { error: res.error };
  await db.update(bookings).set({ presence: "present" }).where(eq(bookings.id, res.bookingId));
  const b = (await loadBooking(res.bookingId))!;
  if (parsed.data.paidCash && (b.booking.amountDueCents ?? 0) > 0) {
    await recordPayment({
      bookingId: res.bookingId,
      amountCents: b.booking.amountDueCents!,
      method: "cash",
      paidAt: todayBrussels(),
      userId: user.id,
    });
  }
  refresh();
  revalidatePath("/admin/jour-j/sur-place");
  return {
    ok: `${parsed.data.lastName.toUpperCase()} installé(e) sur n°${b.spots.map((s) => s.label).join(", ")}${
      parsed.data.paidCash ? " — payé en liquide" : ""
    }${existing ? " (exposant déjà connu)" : ""}.`,
  };
}
