"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { login, setupFirstUser } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Mot de passe">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupFirstUser, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="Votre nom">
        <Input name="name" required autoFocus />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Mot de passe" hint="Au moins 8 caractères.">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création…" : "Créer le compte"}
      </Button>
    </form>
  );
}
