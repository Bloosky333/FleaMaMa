import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { bookingStatusLabels } from "@/lib/booking-labels";
import { loadBooking } from "@/lib/bookings-server";
import { getSettings } from "@/lib/editions";
import { formatPhone } from "@/lib/contacts";
import { displayName } from "@/lib/contacts";
import { formatDateFr, todayBrussels } from "@/lib/dates";
import { methodLabels, paymentState, paymentStateLabels } from "@/lib/payments";
import { listPayments } from "@/lib/payments-server";
import { formatEuros } from "@/lib/pricing";
import { joinLabels } from "@/lib/spots";
import { TEMPLATE_INFO, type TemplateKey } from "@/lib/email/templates";
import { addPayment, cancelBooking, removePayment, resendConfirmation } from "../actions";

export const metadata: Metadata = { title: "Réservation" };

export default async function BookingPage({ params }: PageProps<"/admin/reservations/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const b = await loadBooking(id);
  if (!b) notFound();
  const [pays, mails, { emailEnabled }] = await Promise.all([
    listPayments(id),
    db
      .select({
        template: emailOutbox.template,
        status: emailOutbox.status,
        sentAt: emailOutbox.sentAt,
        createdAt: emailOutbox.createdAt,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.bookingId, id))
      .orderBy(desc(emailOutbox.id)),
    getSettings(),
  ]);
  const paid = pays.reduce((t, p) => t + p.amountCents, 0);
  const state = paymentState(b.booking.amountDueCents, paid);
  const left = Math.max(0, (b.booking.amountDueCents ?? 0) - paid);
  const refundable = !b.edition.refundDeadline || todayBrussels() <= b.edition.refundDeadline;
  const live = ["offered", "requested", "confirmed", "waitlist"].includes(b.booking.status);

  return (
    <>
      <PageHeader
        title={`Réservation ${b.booking.reference}`}
        description={
          <>
            <Badge>{bookingStatusLabels[b.booking.status] ?? b.booking.status}</Badge> Brocante{" "}
            {b.edition.year}
          </>
        }
        actions={
          <Link href="/admin/reservations" className="text-brand-700 text-sm underline">
            ← Toutes les réservations
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,40rem)_1fr]">
        <div className="space-y-6">
          <Card>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-slate-500">Exposant</dt>
              <dd>
                <Link
                  href={`/admin/exposants/${b.contact.id}`}
                  className="text-brand-700 font-medium underline"
                >
                  {displayName(b.contact)}
                </Link>{" "}
                {b.contact.kind === "pro" && <Badge tone="blue">Pro</Badge>}
                <div className="text-slate-500">
                  {[formatPhone(b.contact.phone), b.contact.email].filter(Boolean).join(" · ")}
                </div>
              </dd>
              <dt className="text-slate-500">Emplacements</dt>
              <dd className="font-semibold">
                {b.spots.length ? `n°${joinLabels(b.spots.map((s) => s.label))}` : "—"}{" "}
                <span className="font-normal text-slate-500">{b.spots[0]?.street}</span>
              </dd>
              <dt className="text-slate-500">Montant</dt>
              <dd>{formatEuros(b.booking.amountDueCents)}</dd>
              <dt className="text-slate-500">Paiement</dt>
              <dd>
                {paymentStateLabels[state]} — reçu {formatEuros(paid)}
              </dd>
              {b.booking.confirmedAt && (
                <>
                  <dt className="text-slate-500">Confirmée le</dt>
                  <dd>
                    {b.booking.confirmedAt.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" })}
                  </dd>
                </>
              )}
              {b.booking.notes && (
                <>
                  <dt className="text-slate-500">Notes</dt>
                  <dd className="whitespace-pre-line">{b.booking.notes}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Paiements</h2>
            {pays.length === 0 ? (
              <p className="mb-4 text-sm text-slate-500">Aucun paiement enregistré.</p>
            ) : (
              <table className="mb-4 w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {pays.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 pr-3">{formatDateFr(p.paidAt)}</td>
                      <td className={`py-1.5 pr-3 text-right ${p.amountCents < 0 ? "text-red-700" : ""}`}>
                        {p.amountCents < 0 ? "Remboursé " : ""}
                        {formatEuros(Math.abs(p.amountCents))}
                      </td>
                      <td className="py-1.5 pr-3">{methodLabels[p.method]}</td>
                      <td className="py-1.5 pr-3 text-slate-500">
                        {[p.reference, p.recordedBy && `par ${p.recordedBy}`].filter(Boolean).join(" · ")}
                      </td>
                      <td className="py-1.5 text-right">
                        <form action={removePayment.bind(null, p.id)}>
                          <ConfirmButton
                            variant="ghost"
                            className="px-1 py-0 text-xs"
                            message="Supprimer ce paiement ?"
                          >
                            ×
                          </ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <ActionForm
              action={addPayment.bind(null, id)}
              submitLabel="Enregistrer"
              className="space-y-3 border-t border-slate-100 pt-4"
            >
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Type">
                  <Select name="kind" defaultValue="payment">
                    <option value="payment">Paiement</option>
                    <option value="refund">Remboursement</option>
                  </Select>
                </Field>
                <Field label="Montant (€)">
                  <Input
                    name="amount"
                    defaultValue={left ? (left / 100).toFixed(2).replace(".", ",") : ""}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Moyen">
                  <Select name="method" defaultValue="transfer">
                    <option value="transfer">Virement</option>
                    <option value="cash">Liquide</option>
                  </Select>
                </Field>
                <Field label="Date">
                  <Input name="paidAt" type="date" defaultValue={todayBrussels()} />
                </Field>
              </div>
              <Field label="Référence / remarque">
                <Input name="reference" placeholder="Ex. communication du virement" />
              </Field>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-6">
          {live && (
            <Card className="space-y-3">
              <h2 className="font-semibold">Actions</h2>
              {emailEnabled && b.booking.status === "confirmed" && b.contact.email && (
                <form action={resendConfirmation.bind(null, id)}>
                  <Button type="submit" variant="secondary">
                    Renvoyer l’email de confirmation
                  </Button>
                </form>
              )}
              <form action={cancelBooking.bind(null, id)}>
                <ConfirmButton
                  variant="danger"
                  message={`Annuler la réservation ${b.booking.reference} ? Les emplacements seront libérés.${paid > 0 ? " Pensez à enregistrer le remboursement s’il y a lieu." : ""}`}
                >
                  Annuler la réservation
                </ConfirmButton>
              </form>
              {paid > 0 && (
                <Alert tone={refundable ? "green" : "amber"}>
                  {b.edition.refundDeadline
                    ? refundable
                      ? `Remboursement possible jusqu’au ${formatDateFr(b.edition.refundDeadline)}.`
                      : `Date limite de remboursement dépassée (${formatDateFr(b.edition.refundDeadline)}).`
                    : "Aucune date limite de remboursement n’est fixée."}
                </Alert>
              )}
            </Card>
          )}
          <Card>
            <h2 className="mb-2 font-semibold">Emails</h2>
            {mails.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun email envoyé pour cette réservation.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {mails.map((m, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{TEMPLATE_INFO[m.template as TemplateKey]?.label ?? m.template}</span>
                    <span className="text-slate-500">
                      {m.status === "sent" ? `envoyé le ${m.sentAt?.toLocaleDateString("fr-BE")}` : m.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
