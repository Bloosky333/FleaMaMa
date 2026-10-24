import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card } from "@/components/ui";
import { hasAnyUser } from "@/lib/auth";
import { SetupForm } from "../login/auth-forms";

export const metadata: Metadata = { title: "Premier démarrage" };

export default async function SetupPage() {
  await connection(); // depends on the database, never prerender
  if (await hasAnyUser()) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">Bienvenue sur FleaMaMa</h1>
      <p className="mb-6 text-sm text-stone-600">
        Créez le premier compte organisateur. Vous pourrez ajouter d’autres organisateurs ensuite.
      </p>
      <Card>
        <SetupForm />
      </Card>
    </main>
  );
}
