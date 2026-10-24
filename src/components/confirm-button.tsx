"use client";

import type { ComponentProps } from "react";
import { Button } from "./ui";

/** Submit button that asks for confirmation first. */
export function ConfirmButton({ message, ...props }: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
