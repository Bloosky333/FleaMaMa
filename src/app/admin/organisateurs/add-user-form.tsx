"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { addUser } from "../../login/actions";

export function AddUserForm() {
  const [state, action, pending] = useActionState(addUser, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="green">{state.ok}</Alert>}
      <Field label="Nom">
        <Input name="name" required />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" required />
      </Field>
      <Field label="Mot de passe provisoire" hint="Au moins 8 caractères. Communiquez-le de vive voix.">
        <Input name="password" type="text" minLength={8} required autoComplete="off" />
      </Field>
      <Button type="submit" disabled={pending}>
        Ajouter
      </Button>
    </form>
  );
}
