"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { addResidentLink } from "../actions";

export function ResidentLinkForm({ contactId }: { contactId: number }) {
  const [state, action, pending] = useActionState(addResidentLink.bind(null, contactId), undefined);
  return (
    <form action={action} className="space-y-2">
      {state?.error && <Alert>{state.error}</Alert>}
      <div className="flex gap-2">
        <div className="w-40">
          <Input name="label" placeholder="N° d’emplacement" aria-label="Numéro d’emplacement" />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Ajouter
        </Button>
      </div>
    </form>
  );
}
