"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Alert, Badge, Button, Input, Select } from "@/components/ui";
import { bookingStatusLabels } from "@/lib/booking-labels";
import { formatPhone, normalizeText } from "@/lib/contacts";
import { isSettled, type PaymentState, paymentStateLabels } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";
import { joinLabels } from "@/lib/spots";
import { markPaidBulk, quickPay, sendPaymentReminders } from "./actions";

export type BookingRow = {
  id: number;
  reference: string;
  status: string;
  source: string;
  amountDueCents: number | null;
  paidCents: number;
  payment: PaymentState;
  contact: { id: number; name: string; email: string; phone: string; kind: string };
  spots: { label: string; street: string }[];
};

const paymentTone: Record<PaymentState, "green" | "amber" | "red" | "stone" | "blue"> = {
  paid: "green",
  overpaid: "blue",
  partial: "amber",
  unpaid: "red",
  no_amount: "stone",
};

export function BookingsTable({ rows, emailsEnabled }: { rows: BookingRow[]; emailsEnabled: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState("confirmed");
  const [payment, setPayment] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const term = normalizeText(q);
    return rows.filter(
      (r) =>
        (!status || r.status === status) &&
        (!payment || (payment === "todo" ? !isSettled(r.payment) : r.payment === payment)) &&
        (!term ||
          [r.reference, r.contact.name, ...r.spots.map((s) => s.label), ...r.spots.map((s) => s.street)].some(
            (t) => normalizeText(t).includes(term),
          )),
    );
  }, [rows, status, payment, q]);

  const run = (fn: () => Promise<string>) =>
    start(async () => {
      setMessage(await fn());
      setSelected([]);
      router.refresh();
    });

  const unpaidSelected = selected.filter((id) => {
    const r = rows.find((x) => x.id === id);
    return r && r.status === "confirmed" && !isSettled(r.payment);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, n°, rue, référence…"
          className="w-64"
          aria-label="Chercher"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48" aria-label="État">
          <option value="">Tous les états</option>
          {Object.entries(bookingStatusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          className="w-48"
          aria-label="Paiement"
        >
          <option value="">Tous les paiements</option>
          <option value="todo">À encaisser</option>
          {Object.entries(paymentStateLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <span className="text-sm text-slate-500">{shown.length} réservation(s)</span>
      </div>
      {message && <Alert tone="green">{message}</Alert>}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-100 p-2 text-sm">
          <span>{selected.length} sélectionnée(s)</span>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !unpaidSelected.length}
            onClick={() =>
              run(
                async () =>
                  `${(await markPaidBulk(unpaidSelected, "transfer")).count} réservation(s) marquée(s) payée(s) par virement.`,
              )
            }
          >
            Marquer payé (virement)
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !unpaidSelected.length}
            onClick={() =>
              run(
                async () =>
                  `${(await markPaidBulk(unpaidSelected, "cash")).count} réservation(s) marquée(s) payée(s) en liquide.`,
              )
            }
          >
            Marquer payé (liquide)
          </Button>
          {emailsEnabled && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !unpaidSelected.length}
              onClick={() =>
                run(async () => {
                  const r = await sendPaymentReminders(unpaidSelected);
                  return `${r.queued} rappel(s) ajouté(s) à la file d’envoi.${r.noEmail ? ` ${r.noEmail} sans email.` : ""}`;
                })
              }
            >
              Envoyer un rappel de paiement
            </Button>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={shown.length > 0 && shown.every((r) => selected.includes(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? shown.map((r) => r.id) : [])}
                />
              </th>
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Exposant</th>
              <th className="px-3 py-2">État</th>
              <th className="px-3 py-2 text-right">Montant</th>
              <th className="px-3 py-2">Paiement</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner ${r.reference}`}
                    checked={selected.includes(r.id)}
                    onChange={() =>
                      setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))
                    }
                  />
                </td>
                <td className="px-3 py-2 font-semibold whitespace-nowrap">
                  {joinLabels(r.spots.map((s) => s.label)) || "—"}
                  <div className="text-xs font-normal text-slate-500">{r.spots[0]?.street}</div>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/reservations/${r.id}`}
                    className="text-brand-700 font-medium hover:underline"
                  >
                    {r.contact.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {r.reference}
                    {r.contact.phone && ` · ${formatPhone(r.contact.phone)}`}
                    {r.contact.kind === "pro" && " · pro"}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">{bookingStatusLabels[r.status] ?? r.status}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatEuros(r.amountDueCents)}</td>
                <td className="px-3 py-2">
                  {r.status === "confirmed" && (
                    <Badge tone={paymentTone[r.payment]}>{paymentStateLabels[r.payment]}</Badge>
                  )}
                  {r.paidCents !== 0 && (
                    <div className="text-xs text-slate-500">reçu {formatEuros(r.paidCents)}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {r.status === "confirmed" && !isSettled(r.payment) && (r.amountDueCents ?? 0) > 0 && (
                    <span className="flex gap-2">
                      {(["cash", "transfer"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          disabled={pending}
                          className="text-brand-700 underline"
                          onClick={() =>
                            run(async () => {
                              const res = await quickPay(r.id, m);
                              return (
                                res.error ??
                                `${r.contact.name} : payé ${m === "cash" ? "en liquide" : "par virement"}.`
                              );
                            })
                          }
                        >
                          {m === "cash" ? "Liquide" : "Virement"}
                        </button>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Aucune réservation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
