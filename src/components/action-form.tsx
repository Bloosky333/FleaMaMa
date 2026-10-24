"use client";

import { type ReactNode, useActionState } from "react";
import { Alert, Button } from "./ui";

export type FormState = { error?: string; ok?: string } | undefined;

/** A form posting to a server action, showing its error / success message. */
export function ActionForm({
  action,
  children,
  submitLabel = "Enregistrer",
  submitVariant = "primary",
  className = "space-y-4",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel?: string;
  submitVariant?: "primary" | "secondary";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.ok && <Alert tone="green">{state.ok}</Alert>}
      {children}
      <Button type="submit" variant={submitVariant} disabled={pending}>
        {pending ? "…" : submitLabel}
      </Button>
    </form>
  );
}
