import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { expireOffers } from "@/lib/bookings-server";
import { formatDateFr } from "@/lib/dates";
import { getCurrentEdition, getSettings } from "@/lib/editions";
import { reasonLabels } from "@/lib/priorities";
import { loadPriorityOverview } from "@/lib/priorities-server";
import { prepareOffers, sendInvitations, settleConflict } from "./actions";
import { OffersTable } from "./offers-table";

export const metadata: Metadata = { title: "Priorités" };

export default async function PrioritiesPage({ searchParams }: PageProps<"/admin/priorites">) {
  await requireUser();
  const sp = await searchParams;
  const edition = await getCurrentEdition();
  if (!edition) {
    return (
      <>
        <PageHeader title="Priorités" />
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
  const expired = await expireOffers(edition.id);
  const o = await loadPriorityOverview(edition);
  const { emailEnabled } = await getSettings();
  const waiting = o.offers.filter((x) => x.status === "offered");
  const notInvited = waiting.filter((x) => !x.invitation && x.contact.email).length;
  const invitedWaiting = waiting.filter((x) => x.invitation).length;

  return (
    <>
      <PageHeader
        title={`Priorités ${edition.year}`}
        description={
          <>
            Riverains et exposants {o.previousYear ?? "de l’an dernier"} : leur emplacement leur est réservé
            {edition.priorityDeadline ? (
              <>
                {" "}
                jusqu’au <strong>{formatDateFr(edition.priorityDeadline)}</strong>
              </>
            ) : (
              " jusqu’à la date limite"
            )}
            .
          </>
        }
      />
      {typeof sp.ok === "string" && (
        <div className="mb-4">
          <Alert tone="green">{sp.ok}</Alert>
        </div>
      )}
      {typeof sp.erreur === "string" && (
        <div className="mb-4">
          <Alert>{sp.erreur}</Alert>
        </div>
      )}
      {expired > 0 && (
        <div className="mb-4">
          <Alert tone="amber">{expired} offre(s) ont expiré : leurs emplacements sont libérés.</Alert>
        </div>
      )}
      {!edition.priorityDeadline && (
        <div className="mb-4">
          <Alert tone="amber">
            Indiquez la date limite des priorités dans{" "}
            <Link href="/admin/parametres" className="underline">
              Paramètres
            </Link>{" "}
            avant de préparer les offres.
          </Alert>
        </div>
      )}
      {!o.previousYear && (
        <div className="mb-4">
          <Alert tone="amber">
            Aucune édition précédente : seuls les riverains ont une priorité. Pensez à la{" "}
            <Link href="/admin/import" className="underline">
              reprise de l’historique
            </Link>
            .
          </Alert>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          ["À préparer", o.planned.length, "offres"],
          ["Conflits", o.conflicts.length, "à trancher"],
          ["En attente", waiting.length, `dont ${notInvited} pas encore invité(s)`],
          ["Confirmées", o.offers.filter((x) => x.status === "confirmed").length, "réservations"],
        ].map(([label, value, sub]) => (
          <Card key={label as string}>
            <div className="text-sm text-stone-500">{label}</div>
            <div className="text-3xl font-semibold">{value}</div>
            <div className="text-xs text-stone-500">{sub}</div>
          </Card>
        ))}
      </div>

      {o.conflicts.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-1 font-semibold">Conflits à trancher</h2>
          <p className="mb-3 text-sm text-stone-600">
            Ces emplacements sont demandés par plusieurs personnes. Choisissez à qui proposer chaque
            emplacement.
          </p>
          <ul className="divide-y divide-stone-100">
            {o.conflicts.map((c) => (
              <li key={c.spotId} className="flex flex-wrap items-start gap-4 py-3">
                <div className="w-16 text-lg font-semibold">n°{c.label}</div>
                <div className="flex flex-1 flex-wrap gap-3">
                  {c.claims.map((claim) => (
                    <form
                      key={claim.contact.id}
                      action={settleConflict.bind(null, c.spotId, claim.contact.id, claim.reasons)}
                      className="min-w-56 flex-1 rounded-md border border-stone-200 p-3 text-sm"
                    >
                      <Link
                        href={`/admin/exposants/${claim.contact.id}`}
                        className="text-brand-700 font-medium hover:underline"
                      >
                        {claim.contact.name}
                      </Link>
                      <div className="text-xs text-stone-600">
                        {claim.reasons.map((r) => reasonLabels[r]).join(" + ")}
                      </div>
                      {claim.contact.warnings.length > 0 && (
                        <div className="text-xs text-amber-700">⚠ {claim.contact.warnings.join(", ")}</div>
                      )}
                      <Button type="submit" variant="secondary" className="mt-2">
                        Proposer à {claim.contact.firstName || claim.contact.name}
                      </Button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {o.planned.length > 0 && (
        <Card className="mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Offres à préparer ({o.planned.length})</h2>
              <p className="text-sm text-stone-600">
                Calculées d’après l’édition {o.previousYear ?? "précédente"} et les riverains. Rien n’est
                envoyé à cette étape.
              </p>
            </div>
            <form action={prepareOffers}>
              <Button type="submit" disabled={!edition.priorityDeadline}>
                Préparer ces {o.planned.length} offres
              </Button>
            </form>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {o.planned.map((p) => (
                  <tr key={p.contact.id}>
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">
                      {p.spots.map((s) => s.label).join(", ")}
                    </td>
                    <td className="py-1.5 pr-3">{p.contact.name}</td>
                    <td className="py-1.5 pr-3 text-xs text-stone-600">
                      {p.reasons.map((r) => reasonLabels[r]).join(" + ")}
                    </td>
                    <td className="py-1.5 text-xs text-amber-700">{p.contact.warnings.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Offres {edition.year}</h2>
            <p className="text-sm text-stone-600">
              {emailEnabled ? (
                <>
                  Les invitations partent par petits lots via Gmail (voir{" "}
                  <Link href="/admin/emails" className="underline">
                    Emails
                  </Link>
                  ).
                </>
              ) : (
                <>
                  Emails désactivés : donnez à chacun son lien personnel (bouton « Lien », par SMS) ou
                  confirmez pour lui après un appel.
                </>
              )}
            </p>
          </div>
          {emailEnabled && (
            <div className="flex flex-wrap gap-2">
              <form action={sendInvitations.bind(null, "new", [])}>
                <Button type="submit" disabled={notInvited === 0}>
                  Inviter ceux pas encore invités ({notInvited})
                </Button>
              </form>
              <form action={sendInvitations.bind(null, "reminder", [])}>
                <Button type="submit" variant="secondary" disabled={invitedWaiting === 0}>
                  Relancer ceux qui n’ont pas répondu ({invitedWaiting})
                </Button>
              </form>
            </div>
          )}
        </div>
        {o.offers.length === 0 ? (
          <p className="text-sm text-stone-500">Aucune offre préparée pour l’instant.</p>
        ) : (
          <OffersTable
            emailsEnabled={emailEnabled}
            offers={o.offers.map((x) => ({
              ...x,
              offerExpiresAt: x.offerExpiresAt?.toISOString() ?? null,
              confirmedAt: undefined,
            }))}
          />
        )}
      </Card>
      <p className="mt-3 text-xs text-stone-500">
        <Badge>Astuce</Badge> Pour un exposant sans email, utilisez « Lien » et envoyez-le par SMS, ou
        confirmez pour lui/elle après un appel.
      </p>
    </>
  );
}
