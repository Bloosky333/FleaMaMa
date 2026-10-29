import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthShell } from "@/components/public-shell";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";
import { LoginForm } from "./auth-forms";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  await connection(); // depends on the database, never prerender
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/admin");
  return (
    <AuthShell title="FleaMaMa" subtitle="Espace organisateurs">
      <LoginForm />
    </AuthShell>
  );
}
