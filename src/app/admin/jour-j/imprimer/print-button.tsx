"use client";

import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      Imprimer / enregistrer en PDF
    </Button>
  );
}
