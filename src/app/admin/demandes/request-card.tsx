"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Badge, Button, Input } from "@/components/ui";
import { formatPhone } from "@/lib/contacts";
import { joinLabels } from "@/lib/spots";
import { handleRequest, putOnWaitlist, refuse } from "./actions";

type SpotChip = { id: number; label: string; street: string; available: boolean; others: string[] };

export type RequestCardData = {
  id: number;
  status: string;
  requestedAt: string | null;
  notes: string;
  position: number;
  alreadyBooked: boolean;
  contact: { id: number; name: string; email: string; phone: string; kind: string; city: string };
  choices: { rank: number; spots: SpotChip[] }[];
  firstFreeRank: number | null;
  suggestions: { id: number; label: string; street: string }[][];
};

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

export function RequestCard({ r }: { r: RequestCardData }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const run = (fn: () => Promise<{ error?: string } | void>) =>
    start(async () => {
      const res = await fn();
      setError(res && res.error ? res.error : null);
    });

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="mr-2 text-xs text-stone-400">#{r.position}</span>
          <Link
            href={`/admin/exposants/${r.contact.id}`}
            className="text-brand-700 font-semibold hover:underline"
          >
            {r.contact.name}
          </Link>{" "}
          {r.contact.kind === "pro" && <Badge tone="blue">Pro</Badge>}{" "}
          {r.status === "waitlist" && <Badge tone="amber">Liste d’attente</Badge>}{" "}
          {r.alreadyBooked && <Badge tone="red">a déjà une réservation</Badge>}
          <div className="text-xs text-stone-500">
            {[r.contact.city, formatPhone(r.contact.phone), r.contact.email].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="text-xs text-stone-500">
          {r.requestedAt &&
            `demandé le ${new Date(r.requestedAt).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", dateStyle: "short", timeStyle: "short" })}`}
        </div>
      </div>
      {r.notes && (
        <p className="mb-2 rounded bg-stone-50 p-2 text-xs whitespace-pre-line text-stone-700">{r.notes}</p>
      )}
      {error && <Alert>{error}</Alert>}

      <ul className="space-y-2">
        {r.choices.map((c) => {
          const allFree = c.spots.length > 0 && c.spots.every((s) => s.available);
          return (
            <li key={c.rank} className="flex flex-wrap items-center gap-2">
              <span className="w-16 text-xs font-medium text-stone-500">{ordinal(c.rank)} choix</span>
              {c.spots.map((s) => (
                <span
                  key={s.id}
                  title={s.others.length ? `Aussi demandé par : ${s.others.join(", ")}` : undefined}
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${s.available ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-500 line-through"}`}
                >
                  n°{s.label}
                  {s.others.length > 0 && s.available && (
                    <span className="ml-1 text-amber-700">+{s.others.length}</span>
                  )}
                </span>
              ))}
              {allFree && (
                <Button
                  type="button"
                  variant={c.rank === r.firstFreeRank ? "primary" : "secondary"}
                  className="px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      handleRequest(
                        r.id,
                        "accept",
                        c.spots.map((s) => s.id),
                      ),
                    )
                  }
                >
                  Attribuer
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {r.suggestions.length > 0 && (
        <div className="mt-3 rounded-md bg-amber-50 p-2">
          <div className="mb-1 text-xs font-medium text-amber-900">
            Aucun choix n’est libre. Emplacements proches libres :
          </div>
          <div className="flex flex-wrap gap-2">
            {r.suggestions.map((g) => (
              <Button
                key={g.map((s) => s.id).join("-")}
                type="button"
                variant="secondary"
                className="px-2 py-1 text-xs"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    handleRequest(
                      r.id,
                      "propose",
                      g.map((s) => s.id),
                    ),
                  )
                }
              >
                Proposer n°{joinLabels(g.map((s) => s.label))}
                {g[0].street && ` (${g[0].street})`}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Autres n°, ex. 21-22"
          className="w-40"
          aria-label="Autres emplacements"
        />
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={pending || !manual.trim()}
          onClick={() => run(() => handleRequest(r.id, "accept", manual))}
        >
          Attribuer
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={pending || !manual.trim()}
          onClick={() => run(() => handleRequest(r.id, "propose", manual))}
        >
          Proposer (7 jours)
        </Button>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        {r.status === "requested" && (
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-xs"
            disabled={pending}
            onClick={() => run(() => putOnWaitlist(r.id))}
          >
            Liste d’attente
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="px-2 py-1 text-xs text-red-700"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Refuser la demande de ${r.contact.name} ?`)) run(() => refuse(r.id));
          }}
        >
          Refuser
        </Button>
      </div>
    </div>
  );
}
