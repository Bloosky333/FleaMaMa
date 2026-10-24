"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { saveContact } from "./actions";

export type ContactValues = {
  lastName: string;
  firstName: string;
  company: string;
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  phone: string;
  email: string;
  kind: string;
  vatNumber: string;
  notes: string;
};

export const emptyContact: ContactValues = {
  lastName: "",
  firstName: "",
  company: "",
  street: "",
  houseNumber: "",
  postcode: "",
  city: "",
  phone: "",
  email: "",
  kind: "private",
  vatNumber: "",
  notes: "",
};

export function ContactForm({ id, initial }: { id?: number; initial: ContactValues }) {
  const [state, action, pending] = useActionState(saveContact, undefined);
  const v = { ...initial, ...state?.values };
  const [kind, setKind] = useState(v.kind);

  return (
    <form
      action={action}
      className="space-y-4"
      key={state?.values ? JSON.stringify(state.values) : "initial"}
    >
      {id && <input type="hidden" name="id" value={id} />}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.duplicates && (
        <Alert tone="amber">
          <p className="font-medium">Cet exposant existe peut-être déjà :</p>
          <ul className="my-2 list-disc pl-5">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/exposants/${d.id}`} className="underline" target="_blank">
                  {d.name}
                </Link>
                {d.city && ` (${d.city})`} — {d.reason}
              </li>
            ))}
          </ul>
          <Button type="submit" name="force" value="1" variant="secondary" disabled={pending}>
            Ce n’est pas la même personne, enregistrer quand même
          </Button>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom">
          <Input name="lastName" defaultValue={v.lastName} autoFocus={!id} />
        </Field>
        <Field label="Prénom">
          <Input name="firstName" defaultValue={v.firstName} />
        </Field>
        <Field label="Type">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="private">Particulier</option>
            <option value="pro">Professionnel</option>
          </Select>
        </Field>
        <Field label="Société" hint="Facultatif">
          <Input name="company" defaultValue={v.company} />
        </Field>
        {kind === "pro" && (
          <Field label="N° TVA / BCE" className="sm:col-span-2">
            <Input name="vatNumber" defaultValue={v.vatNumber} placeholder="BE0123.456.789" />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <Field label="Rue">
          <Input name="street" defaultValue={v.street} autoComplete="address-line1" />
        </Field>
        <Field label="N°">
          <Input name="houseNumber" defaultValue={v.houseNumber} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Code postal">
          <Input name="postcode" defaultValue={v.postcode} inputMode="numeric" autoComplete="postal-code" />
        </Field>
        <Field label="Localité">
          <Input name="city" defaultValue={v.city} autoComplete="address-level2" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Téléphone">
          <Input name="phone" defaultValue={v.phone} type="tel" />
        </Field>
        <Field label="Email">
          <Input name="email" defaultValue={v.email} type="email" />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={v.notes} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
