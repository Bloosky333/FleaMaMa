"use client";

import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { SpotPatch } from "./actions";
import type { EditorPlan, EditorSpot } from "./types";

const STREETS_LIST_ID = "plan-streets";

export function StreetsDatalist({ streets }: { streets: string[] }) {
  return (
    <datalist id={STREETS_LIST_ID}>
      {streets.map((s) => (
        <option key={s} value={s} />
      ))}
    </datalist>
  );
}

const parseNumber = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

export function SingleSpotForm({
  spot,
  plan,
  busy,
  onSave,
  onDelete,
  onUseAsDefault,
}: {
  spot: EditorSpot;
  plan: EditorPlan;
  busy: boolean;
  onSave: (patch: SpotPatch) => void;
  onDelete: () => void;
  onUseAsDefault: () => void;
}) {
  const [label, setLabel] = useState(spot.label);
  const [street, setStreet] = useState(spot.street);
  const [side, setSide] = useState(spot.side);
  const [length, setLength] = useState(spot.lengthM?.toString() ?? "");
  const [addresses, setAddresses] = useState(spot.facingAddresses.join("\n"));
  const [notes, setNotes] = useState(spot.notes);
  const [active, setActive] = useState(spot.active);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          id: spot.id,
          label,
          street,
          side,
          lengthM: parseNumber(length),
          facingAddresses: addresses
            .split("\n")
            .map((a) => a.trim())
            .filter(Boolean),
          notes,
          active,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Numéro">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <Field label="Longueur (m)">
          <Input
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder={`${plan.defaultSpotLengthM} (défaut)`}
            inputMode="decimal"
          />
        </Field>
      </div>
      <Field label="Rue">
        <Input value={street} onChange={(e) => setStreet(e.target.value)} list={STREETS_LIST_ID} />
      </Field>
      <Field label="Côté" hint="Ex. : pair / impair, côté église…">
        <Input value={side} onChange={(e) => setSide(e.target.value)} />
      </Field>
      <Field
        label="Adresse(s) en face"
        hint="Une par ligne, ex. « Rue Haute 12 ». Sert pour la priorité riverain."
      >
        <Textarea rows={2} value={addresses} onChange={(e) => setAddresses(e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Emplacement actif
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={onDelete}>
          Supprimer
        </Button>
      </div>
      <button type="button" className="text-brand-700 text-xs underline" onClick={onUseAsDefault}>
        Utiliser sa taille comme taille par défaut
      </button>
    </form>
  );
}

export function MultiSpotForm({
  spots,
  busy,
  onSave,
  onDelete,
}: {
  spots: EditorSpot[];
  busy: boolean;
  onSave: (patches: SpotPatch[]) => void;
  onDelete: () => void;
}) {
  const [street, setStreet] = useState("");
  const [side, setSide] = useState("");
  const [length, setLength] = useState("");
  const [active, setActive] = useState<"" | "on" | "off">("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const lengthM = parseNumber(length);
        onSave(
          spots.map((s) => ({
            id: s.id,
            ...(street.trim() && { street }),
            ...(side.trim() && { side }),
            ...(lengthM !== null && { lengthM }),
            ...(active && { active: active === "on" }),
          })),
        );
      }}
    >
      <p className="text-sm text-slate-600">
        {spots.length} emplacements sélectionnés. Seuls les champs remplis seront modifiés.
      </p>
      <Field label="Rue">
        <Input value={street} onChange={(e) => setStreet(e.target.value)} list={STREETS_LIST_ID} />
      </Field>
      <Field label="Côté">
        <Input value={side} onChange={(e) => setSide(e.target.value)} />
      </Field>
      <Field label="Longueur (m)">
        <Input value={length} onChange={(e) => setLength(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label="État">
        <select
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={active}
          onChange={(e) => setActive(e.target.value as "" | "on" | "off")}
        >
          <option value="">Ne pas changer</option>
          <option value="on">Actifs</option>
          <option value="off">Inactifs</option>
        </select>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          Appliquer
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={onDelete}>
          Supprimer
        </Button>
      </div>
    </form>
  );
}

export function DefaultsForm({
  plan,
  busy,
  onSave,
}: {
  plan: EditorPlan;
  busy: boolean;
  onSave: (v: { defaultSpotWidth: number; defaultSpotHeight: number; defaultSpotLengthM: number }) => void;
}) {
  const [w, setW] = useState(String(Math.round(plan.defaultSpotWidth)));
  const [h, setH] = useState(String(Math.round(plan.defaultSpotHeight)));
  const [len, setLen] = useState(String(plan.defaultSpotLengthM));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const v = {
          defaultSpotWidth: parseNumber(w) ?? plan.defaultSpotWidth,
          defaultSpotHeight: parseNumber(h) ?? plan.defaultSpotHeight,
          defaultSpotLengthM: parseNumber(len) ?? plan.defaultSpotLengthM,
        };
        onSave(v);
      }}
    >
      <h3 className="text-sm font-semibold">Taille par défaut</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Largeur (px)">
          <Input value={w} onChange={(e) => setW(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Profondeur (px)">
          <Input value={h} onChange={(e) => setH(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <Field
        label="Longueur réelle (m)"
        hint="Longueur standard d’un emplacement. Les exceptions se règlent par emplacement."
      >
        <Input value={len} onChange={(e) => setLen(e.target.value)} inputMode="decimal" />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy}>
        Enregistrer
      </Button>
    </form>
  );
}
