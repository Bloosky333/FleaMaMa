import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ContactForm, emptyContact } from "../contact-form";

export const metadata: Metadata = { title: "Nouvel exposant" };

export default async function NewContactPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Nouvel exposant" />
      <Card className="max-w-2xl">
        <ContactForm initial={emptyContact} />
      </Card>
    </>
  );
}
