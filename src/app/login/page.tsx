import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Card } from "@/components/ui";
import { getCurrentUser, hasAnyUser } from "@/lib/auth";
import { LoginForm } from "./auth-forms";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  await connection(); // depends on the database, never prerender
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/admin");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-semibold">FleaMaMa</h1>
      <p className="mb-6 text-sm text-stone-600">Espace organisateurs</p>
      <Card>
        <LoginForm />
      </Card>
    </main>
  );
}
