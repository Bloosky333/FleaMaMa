"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Input } from "@/components/ui";
import { formatPhone, normalizeText } from "@/lib/contacts";
import { isSettled, type PaymentState } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";
import { joinLabels } from "@/lib/spots";
import { quickPay } from "../reservations/actions";
import { setPresence } from "./actions";

export type CheckInRow = {
  id: number;
  presence: "unknown" | "present" | "no_show";
  amountDueCents: number | null;
  paidCents: number;
  payment: PaymentState;
  contact: { name: string; phone: string };
  spots: { label: string; street: string }[];
};

type Filter = "all" | "waiting" | "to_collect" | "no_show";

export function CheckInList({ rows }: { rows: CheckInRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("waiting");
  const [pending, start] = useTransition();

  const toCollect = (r: CheckInRow) => !isSettled(r.payment) && (r.amountDueCents ?? 0) > r.paidCents;
  const shown = useMemo(() => {
    const t = normalizeText(q);
    return rows.filter(
      (r) =>
        (filter === "all" ||
          (filter === "waiting" && r.presence === "unknown") ||
          (filter === "to_collect" && toCollect(r)) ||
          (filter === "no_show" && r.presence === "no_show")) &&
        (!t ||
          [r.contact.name, ...r.spots.map((s) => s.label), ...r.spots.map((s) => s.street)].some((x) =>
            normalizeText(x).includes(t),
          )),
    );
  }, [rows, q, filter]);

  const byStreet = useMemo(() => {
    const m = new Map<string, CheckInRow[]>();
    for (const r of shown) {
      const street = r.spots[0]?.street || "Sans rue";
      m.set(street, [...(m.get(street) ?? []), r]);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [shown]);

  const counts = {
    all: rows.length,
    waiting: rows.filter((r) => r.presence === "unknown").length,
    to_collect: rows.filter(toCollect).length,
    no_show: rows.filter((r) => r.presence === "no_show").length,
  };
  const labels: Record<Filter, string> = {
    waiting: "Pas encore arrivés",
    to_collect: "À encaisser",
    no_show: "Absents",
    all: "Tous",
  };

  return (
    <div className="space-y-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nom, n° ou rue…"
        aria-label="Chercher"
        className="text-base"
      />
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === f ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700"}`}
          >
            {labels[f]} ({counts[f]})
          </button>
        ))}
      </div>
      {byStreet.length === 0 && (
        <p className="py-6 text-center text-sm text-stone-500">Personne dans cette liste.</p>
      )}
      {byStreet.map(([street, list]) => (
        <section key={street}>
          <h2 className="sticky top-0 z-10 bg-stone-50 py-1.5 text-sm font-semibold text-stone-600">
            {street}
          </h2>
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {list.map((r) => (
              <li
                key={r.id}
                className={`space-y-2 p-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0 ${r.presence === "no_show" ? "opacity-60" : ""}`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-14 text-lg font-bold">{joinLabels(r.spots.map((s) => s.label))}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.contact.name}</div>
                    <div className="text-xs whitespace-nowrap text-stone-500">
                      {r.contact.phone && (
                        <a href={`tel:${r.contact.phone}`} className="underline">
                          {formatPhone(r.contact.phone)}
                        </a>
                      )}{" "}
                      {toCollect(r) ? (
                        <Badge tone="red">à payer {formatEuros((r.amountDueCents ?? 0) - r.paidCents)}</Badge>
                      ) : (
                        <Badge tone="green">payé</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 [&>button]:flex-1 sm:[&>button]:flex-none">
                  {toCollect(r) && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => void (await quickPay(r.id, "cash")))}
                      className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white"
                    >
                      Encaisser
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    aria-pressed={r.presence === "present"}
                    onClick={() =>
                      start(() => setPresence(r.id, r.presence === "present" ? "unknown" : "present"))
                    }
                    className={`rounded-md px-3 py-2 text-sm font-medium ${r.presence === "present" ? "bg-green-600 text-white" : "bg-stone-100 text-stone-700"}`}
                  >
                    ✓ Là
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    aria-pressed={r.presence === "no_show"}
                    onClick={() =>
                      start(() => setPresence(r.id, r.presence === "no_show" ? "unknown" : "no_show"))
                    }
                    className={`rounded-md px-3 py-2 text-sm font-medium ${r.presence === "no_show" ? "bg-red-600 text-white" : "bg-stone-100 text-stone-700"}`}
                  >
                    ✗ Absent
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
