import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { importBatches, importRows } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createImportBatch } from "./actions";

export const metadata: Metadata = { title: "Reprise de l’historique" };

export default async function ImportListPage({ searchParams }: PageProps<"/admin/import">) {
  await requireUser();
  const sp = await searchParams;
  const batches = await db
    .select({
      id: importBatches.id,
      year: importBatches.year,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      committedAt: importBatches.committedAt,
      rows: sql<number>`count(${importRows.id})::int`,
    })
    .from(importBatches)
    .leftJoin(importRows, eq(importRows.batchId, importBatches.id))
    .groupBy(importBatches.id)
    .orderBy(desc(importBatches.createdAt));

  // The market takes place once a year: from July on, "last market" is this year's.
  const now = new Date();
  const defaultYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  return (
    <>
      <PageHeader
        title="Reprise de l’historique"
        description="Recopiez les exposants de l’an dernier depuis l’ancien logiciel : par photos lues automatiquement, en tapant dans un tableau, ou en collant depuis Excel."
      />
      {sp.erreur === "annee" && (
        <div className="mb-4">
          <Alert>Année invalide.</Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <h2 className="mb-3 font-semibold">Nouvelle reprise</h2>
          <form action={createImportBatch} className="space-y-3">
            <Field label="Année de la brocante" hint="Les emplacements seront enregistrés pour cette année.">
              <Input name="year" type="number" defaultValue={defaultYear} required />
            </Field>
            <Button type="submit">Commencer</Button>
          </form>
          <p className="mt-4 text-xs text-slate-500">
            Conseil : placez d’abord tous les emplacements sur le plan, l’import vérifie que chaque numéro
            existe.
          </p>
        </Card>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Année</th>
                <th className="px-4 py-2">Lignes</th>
                <th className="px-4 py-2">État</th>
                <th className="px-4 py-2">Créée le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/admin/import/${b.id}`} className="text-brand-700 hover:underline">
                      Reprise {b.year}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{b.rows}</td>
                  <td className="px-4 py-2">
                    {b.status === "committed" ? (
                      <Badge tone="green">Validée</Badge>
                    ) : (
                      <Badge tone="amber">Brouillon</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">{b.createdAt.toLocaleDateString("fr-BE")}</td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Aucune reprise pour l’instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
