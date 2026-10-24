import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { AddUserForm } from "./add-user-form";

export const metadata: Metadata = { title: "Organisateurs" };

export default async function UsersPage() {
  await requireUser();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name));
  return (
    <>
      <PageHeader title="Organisateurs" description="Tous les organisateurs ont accès à tout." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <ul className="divide-y divide-stone-100">
            {rows.map((u) => (
              <li key={u.id} className="py-2 text-sm">
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-stone-500">{u.email}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Ajouter un organisateur</h2>
          <AddUserForm />
        </Card>
      </div>
    </>
  );
}
