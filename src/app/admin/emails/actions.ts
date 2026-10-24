"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { processOutbox, resumeOutbox, retryFailed } from "@/lib/email/outbox";

export async function sendBatchNow() {
  await requireUser();
  const res = await processOutbox();
  revalidatePath("/admin/emails");
  const msg = res.skipped
    ? `Rien envoyé : ${res.skipped}.`
    : `${res.sent} email(s) envoyé(s)${res.failed ? `, ${res.failed} en échec` : ""}.`;
  redirect(`/admin/emails?info=${encodeURIComponent(msg)}`);
}

export async function resumeSending() {
  await requireUser();
  await resumeOutbox();
  revalidatePath("/admin/emails");
}

export async function retryFailedEmails() {
  await requireUser();
  await retryFailed();
  revalidatePath("/admin/emails");
}
