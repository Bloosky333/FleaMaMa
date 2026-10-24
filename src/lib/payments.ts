/** Payment state of a booking (spec §4.6): payments are summed, refunds are negative amounts. */

export type PaymentState = "no_amount" | "unpaid" | "partial" | "paid" | "overpaid";

export function paymentState(amountDueCents: number | null, paidCents: number): PaymentState {
  if (amountDueCents === null) return paidCents > 0 ? "paid" : "no_amount";
  if (paidCents <= 0) return amountDueCents === 0 ? "paid" : "unpaid";
  if (paidCents < amountDueCents) return "partial";
  return paidCents === amountDueCents ? "paid" : "overpaid";
}

export const paymentStateLabels: Record<PaymentState, string> = {
  no_amount: "Montant à fixer",
  unpaid: "Non payé",
  partial: "Payé en partie",
  paid: "Payé",
  overpaid: "Trop payé",
};

export const isSettled = (s: PaymentState) => s === "paid" || s === "overpaid";

export const methodLabels = { cash: "Liquide", transfer: "Virement" } as const;
