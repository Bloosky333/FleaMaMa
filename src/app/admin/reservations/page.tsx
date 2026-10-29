import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { expireOffers } from "@/lib/bookings-server";
import { loadEditionBookings } from "@/lib/edition-bookings-server";
import { getCurrentEdition, getSettings } from "@/lib/editions";
import { isSettled } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";
import { BookingsTable } from "./bookings-table";

export const metadata: Metadata = { title: "Réservations" };

export default async function BookingsPage() {
  await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) {
    return (
      <>
        <PageHeader title="Réservations" />
        <Alert tone="amber">
          Créez d’abord l’édition de cette année dans{" "}
          <Link href="/admin/parametres" className="underline">
            Paramètres
          </Link>
          .
        </Alert>
      </>
    );
  }
  await expireOffers(edition.id);
  const rows = await loadEditionBookings(edition.id);
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const expected = confirmed.reduce((t, r) => t + (r.amountDueCents ?? 0), 0);
  const received = rows.reduce((t, r) => t + r.paidCents, 0);
  const spotsBooked = confirmed.reduce((t, r) => t + r.spots.length, 0);
  const toCollect = confirmed.filter((r) => !isSettled(r.payment) && (r.amountDueCents ?? 0) > 0).length;

  return (
    <>
      <PageHeader
        title={`Réservations ${edition.year}`}
        actions={
          <>
            <LinkButton href="/admin/carte" variant="secondary">
              Voir la carte
            </LinkButton>
            <a
              href={`/api/export/reservations?edition=${edition.id}`}
              className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
            >
              Exporter (Excel)
            </a>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <div className="text-sm text-stone-500">Confirmées</div>
          <div className="text-3xl font-semibold">{confirmed.length}</div>
          <div className="text-xs text-stone-500">{spotsBooked} emplacement(s)</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">Attendu</div>
          <div className="text-3xl font-semibold">{formatEuros(expected)}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">Reçu</div>
          <div className="text-3xl font-semibold">{formatEuros(received)}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">À encaisser</div>
          <div className="text-3xl font-semibold">{toCollect}</div>
          <div className="text-xs text-stone-500">réservation(s)</div>
        </Card>
      </div>
      <BookingsTable
        emailsEnabled={(await getSettings()).emailEnabled}
        rows={rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          status: r.status,
          source: r.source,
          amountDueCents: r.amountDueCents,
          paidCents: r.paidCents,
          payment: r.payment,
          contact: r.contact,
          spots: r.spots,
        }))}
      />
    </>
  );
}
