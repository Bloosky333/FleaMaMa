"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { formatPhone } from "@/lib/contacts";
import { reasonLabels } from "@/lib/priorities";
import { formatEuros } from "@/lib/pricing";
import {
  confirmOffer,
  declineOffer,
  extendOfferTo,
  personalLink,
  sendInvitations,
  withdrawOffer,
} from "./actions";

export type OfferRow = {
  id: number;
  status: string;
  priorityReason: string | null;
  offerExpiresAt: string | null;
  amountDueCents: number | null;
  notes: string;
  contact: { id: number; name: string; email: string; phone: string };
  spots: string[];
  releasedSpots: string[];
  invitation: string | null;
  reminders: number;
};

const statusBadge: Record<string, { label: string; tone: "stone" | "green" | "amber" | "blue" | "red" }> = {
  offered: { label: "En attente", tone: "amber" },
  confirmed: { label: "Confirmée", tone: "green" },
  declined: { label: "Ne vient pas", tone: "stone" },
  expired: { label: "Expirée", tone: "red" },
  cancelled: { label: "Retirée", tone: "stone" },
};

const invitationLabel: Record<string, string> = {
  queued: "en file d’envoi",
  sending: "en cours d’envoi",
  sent: "envoyée",
  failed: "échec d’envoi",
};

export function OffersTable({ offers, emailsEnabled }: { offers: OfferRow[]; emailsEnabled: boolean }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState<"all" | "offered" | "confirmed" | "closed">("all");
  const [link, setLink] = useState<{ id: number; url: string } | null>(null);
  const [pending, start] = useTransition();

  const shown = offers.filter((o) =>
    filter === "all"
      ? true
      : filter === "closed"
        ? ["declined", "expired", "cancelled"].includes(o.status)
        : o.status === filter,
  );
  const selectable = shown.filter((o) => o.status === "offered");
  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ["all", "Toutes"],
            ["offered", "En attente"],
            ["confirmed", "Confirmées"],
            ["closed", "Refusées / expirées / retirées"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 ${filter === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            {label} (
            {
              offers.filter((o) =>
                k === "all"
                  ? true
                  : k === "closed"
                    ? ["declined", "expired", "cancelled"].includes(o.status)
                    : o.status === k,
              ).length
            }
            )
          </button>
        ))}
        {emailsEnabled && selected.length > 0 && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => sendInvitations("selected", selected))}
          >
            Inviter la sélection ({selected.length})
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              {emailsEnabled && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={selectable.length > 0 && selectable.every((o) => selected.includes(o.id))}
                    onChange={(e) => setSelected(e.target.checked ? selectable.map((o) => o.id) : [])}
                  />
                </th>
              )}
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Exposant</th>
              <th className="px-3 py-2">Priorité</th>
              <th className="px-3 py-2">État</th>
              {emailsEnabled && <th className="px-3 py-2">Invitation</th>}
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((o) => (
              <tr key={o.id} className="align-top">
                {emailsEnabled && (
                  <td className="px-3 py-2">
                    {o.status === "offered" && (
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${o.contact.name}`}
                        checked={selected.includes(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                    )}
                  </td>
                )}
                <td className="px-3 py-2 font-semibold whitespace-nowrap">
                  {o.spots.join(", ") || "—"}
                  {o.releasedSpots.length > 0 && (
                    <div className="text-xs font-normal text-slate-400">
                      libéré : {o.releasedSpots.join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/exposants/${o.contact.id}`}
                    className="text-brand-700 font-medium hover:underline"
                  >
                    {o.contact.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {o.contact.email || <span className="text-amber-700">pas d’email</span>}
                    {o.contact.phone && ` · ${formatPhone(o.contact.phone)}`}
                  </div>
                  {o.notes && (
                    <div className="mt-1 text-xs whitespace-pre-line text-slate-600">{o.notes}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {reasonLabels[(o.priorityReason ?? "manual") as keyof typeof reasonLabels]}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={statusBadge[o.status]?.tone ?? "stone"}>
                    {statusBadge[o.status]?.label ?? o.status}
                  </Badge>
                  {o.status === "offered" && o.offerExpiresAt && (
                    <div className="text-xs text-slate-500">
                      jusqu’au{" "}
                      {new Date(o.offerExpiresAt).toLocaleDateString("fr-BE", {
                        timeZone: "Europe/Brussels",
                      })}
                    </div>
                  )}
                  {o.status === "confirmed" && (
                    <div className="text-xs text-slate-500">{formatEuros(o.amountDueCents)}</div>
                  )}
                </td>
                {emailsEnabled && (
                  <td className="px-3 py-2 text-xs">
                    {o.invitation ? (
                      invitationLabel[o.invitation]
                    ) : (
                      <span className="text-slate-400">pas envoyée</span>
                    )}
                    {o.reminders > 0 && <div className="text-slate-500">{o.reminders} rappel(s)</div>}
                  </td>
                )}
                <td className="px-3 py-2">
                  {o.status === "offered" && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <button
                        type="button"
                        className="text-brand-700 underline"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Confirmer la réservation de ${o.contact.name} (n° ${o.spots.join(", ")}) ?`,
                            )
                          )
                            run(() => confirmOffer(o.id));
                        }}
                      >
                        Confirmer pour lui/elle
                      </button>
                      <button
                        type="button"
                        className="text-slate-700 underline"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `${o.contact.name} ne vient pas : libérer n° ${o.spots.join(", ")} ?`,
                            )
                          )
                            run(() => declineOffer(o.id));
                        }}
                      >
                        Ne vient pas
                      </button>
                      <button
                        type="button"
                        className="text-slate-700 underline"
                        disabled={pending}
                        onClick={() => {
                          const date = window.prompt(
                            "Prolonger l’offre jusqu’au (AAAA-MM-JJ) :",
                            o.offerExpiresAt?.slice(0, 10) ?? "",
                          );
                          if (date) run(() => extendOfferTo(o.id, date));
                        }}
                      >
                        Prolonger
                      </button>
                      <button
                        type="button"
                        className="text-slate-700 underline"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const url = await personalLink(o.id);
                            if (url) setLink({ id: o.id, url });
                          })
                        }
                      >
                        Lien
                      </button>
                      <button
                        type="button"
                        className="text-red-700 underline"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Retirer l’offre de ${o.contact.name} ? Les emplacements seront libérés et la priorité ne sera plus proposée cette année.`,
                            )
                          )
                            run(() => withdrawOffer(o.id));
                        }}
                      >
                        Retirer
                      </button>
                    </div>
                  )}
                  {link?.id === o.id && (
                    <div className="mt-2 max-w-xs rounded bg-slate-100 p-2 text-xs break-all">
                      {link.url}
                      <button
                        type="button"
                        className="text-brand-700 ml-2 underline"
                        onClick={() => navigator.clipboard?.writeText(link.url)}
                      >
                        Copier
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={emailsEnabled ? 7 : 5} className="px-3 py-6 text-center text-slate-500">
                  Aucune offre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
