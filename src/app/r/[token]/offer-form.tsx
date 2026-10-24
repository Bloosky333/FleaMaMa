"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { formatEuros } from "@/lib/pricing";
import { respondToOffer } from "./actions";

export function OfferForm({
  token,
  spots,
  unitPriceCents,
  contact,
}: {
  token: string;
  spots: { id: number; label: string; street: string }[];
  unitPriceCents: number | null;
  contact: {
    phone: string;
    email: string;
    street: string;
    houseNumber: string;
    postcode: string;
    city: string;
  };
}) {
  const [state, action, pending] = useActionState(respondToOffer.bind(null, token), undefined);
  const [kept, setKept] = useState(spots.map((s) => s.id));

  return (
    <form action={action} className="space-y-5">
      {state?.error && <Alert>{state.error}</Alert>}
      {spots.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Emplacements que vous gardez</legend>
          <div className="space-y-1">
            {spots.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="spot"
                  value={s.id}
                  checked={kept.includes(s.id)}
                  onChange={(e) =>
                    setKept((k) => (e.target.checked ? [...k, s.id] : k.filter((x) => x !== s.id)))
                  }
                />
                n°{s.label} {s.street && <span className="text-stone-500">— {s.street}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        spots.map((s) => <input key={s.id} type="hidden" name="spot" value={s.id} />)
      )}
      {unitPriceCents !== null && (
        <p className="text-sm">
          Prix : <strong>{formatEuros(unitPriceCents * kept.length)}</strong>
          {kept.length > 1 && ` (${kept.length} × ${formatEuros(unitPriceCents)})`}
        </p>
      )}

      <details className="rounded-md border border-stone-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">Vérifier mes coordonnées</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone">
            <Input name="phone" type="tel" defaultValue={contact.phone} />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={contact.email} />
          </Field>
          <Field label="Rue">
            <Input name="street" defaultValue={contact.street} />
          </Field>
          <Field label="N°">
            <Input name="houseNumber" defaultValue={contact.houseNumber} />
          </Field>
          <Field label="Code postal">
            <Input name="postcode" defaultValue={contact.postcode} />
          </Field>
          <Field label="Localité">
            <Input name="city" defaultValue={contact.city} />
          </Field>
        </div>
      </details>

      <Field
        label="Un message pour l’organisateur ? (facultatif)"
        hint="Ex. : je voudrais aussi l’emplacement voisin."
      >
        <Textarea name="message" rows={2} />
      </Field>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          name="decision"
          value="confirm"
          disabled={pending || kept.length === 0}
          className="py-3"
        >
          Je confirme {kept.length > 1 ? `mes ${kept.length} emplacements` : "mon emplacement"}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="decline"
          variant="secondary"
          disabled={pending}
          className="py-3"
          onClick={(e) => {
            if (
              !window.confirm(
                "Vous ne venez pas cette année ? L’emplacement sera proposé à quelqu’un d’autre.",
              )
            )
              e.preventDefault();
          }}
        >
          Je ne viens pas cette année
        </Button>
      </div>
    </form>
  );
}
