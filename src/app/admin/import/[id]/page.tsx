import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { bookings, contacts, importBatches, importPhotos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { aiAvailable } from "@/lib/extract-photo";
import { loadBatchRows } from "@/lib/import-server";
import { deleteImportBatch, rollbackImport } from "../actions";
import { ImportWorkspace } from "./import-workspace";

export const metadata: Metadata = { title: "Reprise de l’historique" };

// Reading a photo with the AI can take a while.
export const maxDuration = 120;

export default async function ImportBatchPage({ params, searchParams }: PageProps<"/admin/import/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const sp = await searchParams;
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
  if (!batch) notFound();

  const back = (
    <Link href="/admin/import" className="text-brand-700 text-sm underline">
      ← Toutes les reprises
    </Link>
  );

  if (batch.status === "committed") {
    const [[{ bookingCount }], [{ contactCount }]] = await Promise.all([
      db
        .select({ bookingCount: sql<number>`count(*)::int` })
        .from(bookings)
        .where(eq(bookings.importBatchId, id)),
      db
        .select({ contactCount: sql<number>`count(*)::int` })
        .from(contacts)
        .where(eq(contacts.importBatchId, id)),
    ]);
    return (
      <>
        <PageHeader title={`Reprise ${batch.year}`} actions={back} />
        <Card className="max-w-2xl space-y-3">
          <Alert tone="green">
            Import validé le {batch.committedAt?.toLocaleDateString("fr-BE")} : {bookingCount} réservation(s){" "}
            {batch.year} enregistrée(s), {contactCount} nouvel(s) exposant(s) créé(s).
          </Alert>
          <p className="text-sm text-stone-600">
            Les exposants sont dans la liste{" "}
            <Link href="/admin/exposants" className="text-brand-700 underline">
              Exposants
            </Link>{" "}
            avec leur historique {batch.year}. Une erreur ? Annulez l’import pour revenir au tableau,
            corrigez, puis validez à nouveau.
          </p>
          <form action={rollbackImport.bind(null, id)}>
            <ConfirmButton
              variant="danger"
              message={`Annuler l’import ${batch.year} ? Les réservations ${batch.year} importées et les exposants créés par cet import (s’ils ne sont pas utilisés ailleurs) seront supprimés. Le tableau est conservé.`}
            >
              Annuler cet import
            </ConfirmButton>
          </form>
        </Card>
      </>
    );
  }

  const [rows, photos] = await Promise.all([
    loadBatchRows(id),
    db
      .select({ id: importPhotos.id, status: importPhotos.status, error: importPhotos.error })
      .from(importPhotos)
      .where(and(eq(importPhotos.batchId, id)))
      .orderBy(asc(importPhotos.id)),
  ]);

  return (
    <>
      <PageHeader
        title={`Reprise ${batch.year}`}
        description="Vérifiez chaque ligne : les numéros d’emplacement doivent exister sur le plan, et les exposants déjà connus sont reconnus automatiquement."
        actions={
          <>
            {back}
            <form action={deleteImportBatch.bind(null, id)}>
              <ConfirmButton variant="ghost" message="Supprimer ce brouillon, ses lignes et ses photos ?">
                Supprimer le brouillon
              </ConfirmButton>
            </form>
          </>
        }
      />
      {sp.annule !== undefined && (
        <div className="mb-4">
          <Alert tone="amber">
            Import annulé : vous pouvez corriger le tableau puis le valider à nouveau.
          </Alert>
        </div>
      )}
      <ImportWorkspace
        batchId={id}
        year={batch.year}
        initialRows={rows}
        initialPhotos={photos}
        aiEnabled={aiAvailable()}
      />
    </>
  );
}
