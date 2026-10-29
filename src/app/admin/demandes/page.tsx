import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { expireOffers } from "@/lib/bookings-server";
import { formatDateFr, todayBrussels } from "@/lib/dates";
import { getCurrentEdition } from "@/lib/editions";
import { isPublicBookingOpen } from "@/lib/requests";
import { loadRequests } from "@/lib/requests-server";
import { RequestCard } from "./request-card";

export const metadata: Metadata = { title: "Demandes" };

export default async function RequestsPage() {
  await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) {
    return (
      <>
        <PageHeader title="Demandes" />
        <Alert tone="amber">
          Créez d’abord l’édition dans{" "}
          <Link href="/admin/parametres" className="underline">
            Paramètres
          </Link>
          .
        </Alert>
      </>
    );
  }
  await expireOffers(edition.id);
  const requests = await loadRequests(edition);
  const pending = requests.filter((r) => r.status === "requested");
  const waiting = requests.filter((r) => r.status === "waitlist");
  const open = isPublicBookingOpen(edition, todayBrussels());
  const toCard = (r: (typeof requests)[number], i: number) => ({
    ...r,
    position: i + 1,
    requestedAt: r.requestedAt?.toISOString() ?? null,
  });

  return (
    <>
      <PageHeader
        title={`Demandes ${edition.year}`}
        description={
          <>
            Demandes faites sur la page publique{" "}
            <Link href="/reserver" target="_blank" className="underline">
              /reserver
            </Link>
            , dans l’ordre d’arrivée. Plusieurs personnes peuvent demander le même emplacement : c’est vous
            qui choisissez.
          </>
        }
      />
      {!open && (
        <div className="mb-4">
          <Alert tone="amber">
            La page publique est fermée.{" "}
            {edition.publicOpeningDate
              ? `Elle ouvrira le ${formatDateFr(edition.publicOpeningDate)}.`
              : "Fixez une date d’ouverture ou passez l’édition à l’étape « Réservations ouvertes à tous » dans Paramètres."}
          </Alert>
        </div>
      )}
      <h2 className="mb-3 font-semibold">À traiter ({pending.length})</h2>
      <div className="mb-8 space-y-3">
        {pending.length === 0 && <p className="text-sm text-slate-500">Aucune demande en attente.</p>}
        {pending.map((r, i) => (
          <RequestCard key={r.id} r={toCard(r, i)} />
        ))}
      </div>
      <h2 className="mb-3 font-semibold">Liste d’attente ({waiting.length})</h2>
      <div className="space-y-3">
        {waiting.length === 0 && <p className="text-sm text-slate-500">Personne en liste d’attente.</p>}
        {waiting.map((r, i) => (
          <RequestCard key={r.id} r={toCard(r, i)} />
        ))}
      </div>
    </>
  );
}
