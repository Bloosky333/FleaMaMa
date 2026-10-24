import { eq } from "drizzle-orm";
import { db } from "@/db";
import { editions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { bookingStatusLabels } from "@/lib/booking-labels";
import { loadEditionBookings } from "@/lib/edition-bookings-server";
import { formatPhone } from "@/lib/contacts";
import { paymentStateLabels } from "@/lib/payments";
import { joinLabels } from "@/lib/spots";

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const euros = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));

/** CSV for Excel (semicolons, UTF-8 BOM): every booking of an edition. */
export async function GET(request: Request) {
  if (!(await getCurrentUser())) return new Response("Non autorisé", { status: 401 });
  const id = Number(new URL(request.url).searchParams.get("edition"));
  const [edition] = Number.isInteger(id) ? await db.select().from(editions).where(eq(editions.id, id)) : [];
  if (!edition) return new Response("Édition introuvable", { status: 404 });
  const rows = await loadEditionBookings(edition.id);
  const header = [
    "Référence",
    "Emplacements",
    "Rue",
    "Exposant",
    "Type",
    "Téléphone",
    "Email",
    "État",
    "Montant",
    "Reçu",
    "Paiement",
  ];
  const lines = rows.map((r) =>
    [
      r.reference,
      joinLabels(r.spots.map((s) => s.label)),
      r.spots[0]?.street ?? "",
      r.contact.name,
      r.contact.kind === "pro" ? "Professionnel" : "Particulier",
      formatPhone(r.contact.phone),
      r.contact.email,
      bookingStatusLabels[r.status] ?? r.status,
      euros(r.amountDueCents),
      euros(r.paidCents),
      r.status === "confirmed" ? paymentStateLabels[r.payment] : "",
    ]
      .map(cell)
      .join(";"),
  );
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reservations-${edition.year}.csv"`,
    },
  });
}
