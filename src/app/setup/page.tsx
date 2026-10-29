import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/public-shell";
import { hasAnyUser } from "@/lib/auth";
import { SetupForm } from "../login/auth-forms";

export const metadata: Metadata = { title: "Premier démarrage" };

export default async function SetupPage() {
  await connection(); // depends on the database, never prerender
  if (await hasAnyUser()) redirect("/login");
  return (
    <AuthShell
      title="Bienvenue sur FleaMaMa"
      subtitle="Créez le premier compte organisateur. Vous pourrez ajouter d’autres organisateurs ensuite."
    >
      <SetupForm />
    </AuthShell>
  );
}
