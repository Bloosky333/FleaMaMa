import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadEditionBookings } from "@/lib/edition-bookings-server";
import { getCurrentEdition } from "@/lib/editions";
import { isSettled } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";
import { CheckInList } from "./check-in-list";

export const metadata: Metadata = { title: "Jour J" };

export default async function MarketDayPage() {
  await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) {
    return (
      <>
        <PageHeader title="Jour J" />
        <Alert tone="amber">
          Aucune édition en cours (
          <Link href="/admin/parametres" className="underline">
            Paramètres
          </Link>
          ).
        </Alert>
      </>
    );
  }
  const rows = (await loadEditionBookings(edition.id, { liveOnly: true })).filter(
    (r) => r.status === "confirmed",
  );
  const present = rows.filter((r) => r.presence === "present").length;
  const due = rows.reduce(
    (t, r) => t + (isSettled(r.payment) ? 0 : Math.max(0, (r.amountDueCents ?? 0) - r.paidCents)),
    0,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Jour J ${edition.year}`}
        actions={
          <>
            <LinkButton href="/admin/jour-j/sur-place">+ Exposant sur place</LinkButton>
            <LinkButton href="/admin/jour-j/imprimer" variant="secondary">
              Imprimer
            </LinkButton>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <div className="text-sm text-stone-500">Arrivés</div>
          <div className="text-2xl font-semibold">
            {present} / {rows.length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">Reste à encaisser</div>
          <div className="text-2xl font-semibold">{formatEuros(due)}</div>
        </Card>
      </div>
      <CheckInList
        rows={rows.map((r) => ({
          id: r.id,
          presence: r.presence,
          amountDueCents: r.amountDueCents,
          paidCents: r.paidCents,
          payment: r.payment,
          contact: { name: r.contact.name, phone: r.contact.phone },
          spots: r.spots,
        }))}
      />
    </div>
  );
}
