"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { formatEuros } from "@/lib/pricing";
import { registerWalkIn } from "../actions";

export function WalkInForm({
  free,
  prices,
}: {
  free: { id: number; label: string; street: string }[];
  prices: { private: number | null; pro: number | null };
}) {
  const [state, action, pending] = useActionState(registerWalkIn, undefined);
  const [kind, setKind] = useState<"private" | "pro">("private");
  const [chosen, setChosen] = useState<number[]>([]);
  const streets = [...new Set(free.map((s) => s.street || "Sans rue"))];
  const unit = prices[kind];

  return (
    <form action={action} className="space-y-4" key={state?.ok}>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="green">{state.ok}</Alert>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Emplacement(s) libre(s)</legend>
        {free.length === 0 && <p className="text-sm text-stone-500">Plus aucun emplacement libre.</p>}
        {streets.map((street) => (
          <div key={street} className="mb-2">
            <div className="text-xs text-stone-500">{street}</div>
            <div className="flex flex-wrap gap-1.5">
              {free
                .filter((s) => (s.street || "Sans rue") === street)
                .map((s) => (
                  <label
                    key={s.id}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold ${chosen.includes(s.id) ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      name="spot"
                      value={s.id}
                      className="sr-only"
                      checked={chosen.includes(s.id)}
                      onChange={(e) =>
                        setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))
                      }
                    />
                    {s.label}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *">
          <Input name="lastName" required className="text-base" />
        </Field>
        <Field label="Prénom">
          <Input name="firstName" className="text-base" />
        </Field>
        <Field label="Téléphone" hint="Si le numéro est connu, l’exposant existant est réutilisé.">
          <Input name="phone" type="tel" className="text-base" />
        </Field>
        <Field label="Type">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "private" | "pro")}>
            <option value="private">Particulier</option>
            <option value="pro">Professionnel</option>
          </Select>
        </Field>
        {kind === "pro" && (
          <Field label="N° d’entreprise">
            <Input name="vatNumber" />
          </Field>
        )}
      </div>
      {kind === "private" && <input type="hidden" name="vatNumber" value="" />}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="paidCash" defaultChecked /> Payé en liquide
        {unit !== null && chosen.length > 0 && <strong>({formatEuros(unit * chosen.length)})</strong>}
      </label>
      <Button type="submit" disabled={pending || !chosen.length} className="w-full py-3">
        {pending ? "…" : "Installer l’exposant"}
      </Button>
    </form>
  );
}
