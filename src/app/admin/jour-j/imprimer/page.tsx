import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { plans, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatPhone } from "@/lib/contacts";
import { formatDateFr } from "@/lib/dates";
import { loadEditionBookings } from "@/lib/edition-bookings-server";
import { getCurrentEdition } from "@/lib/editions";
import { isSettled } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";
import { compareLabels } from "@/lib/spots";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Listes à imprimer" };

const FILL = { free: "#bbf7d0", unpaid: "#fed7aa", paid: "#bfdbfe" };

export default async function PrintPage() {
  await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) notFound();
  const [[plan], allSpots, bookings] = await Promise.all([
    db
      .select({ id: plans.id, width: plans.width, height: plans.height })
      .from(plans)
      .orderBy(desc(plans.id))
      .limit(1),
    db.select().from(spots),
    loadEditionBookings(edition.id, { liveOnly: true }),
  ]);
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const bySpot = new Map(confirmed.flatMap((b) => b.spots.map((s) => [s.id, b] as const)));

  const rows = allSpots
    .filter((s) => s.active)
    .map((s) => ({ spot: s, booking: bySpot.get(s.id) }))
    .sort(
      (a, b) => a.spot.street.localeCompare(b.spot.street, "fr") || compareLabels(a.spot.label, b.spot.label),
    );
  const streets = [...new Set(rows.map((r) => r.spot.street || "Sans rue"))];

  return (
    <div className="mx-auto max-w-4xl bg-white text-black print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Listes à imprimer</h1>
        <PrintButton />
      </div>

      {plan && (
        <section className="break-after-page">
          <h2 className="mb-2 text-lg font-semibold">
            Brocante {edition.year} {edition.marketDate && `— ${formatDateFr(edition.marketDate, true)}`}
          </h2>
          <p className="mb-2 text-xs">
            <span className="mr-1 inline-block h-3 w-3 align-middle" style={{ background: FILL.paid }} />{" "}
            réservé et payé
            <span
              className="mr-1 ml-3 inline-block h-3 w-3 align-middle"
              style={{ background: FILL.unpaid }}
            />{" "}
            réservé, à encaisser
            <span
              className="mr-1 ml-3 inline-block h-3 w-3 align-middle"
              style={{ background: FILL.free }}
            />{" "}
            libre
          </p>
          <svg viewBox={`0 0 ${plan.width} ${plan.height}`} className="h-auto w-full border border-stone-300">
            <image href={`/api/plan/image?v=${plan.id}`} width={plan.width} height={plan.height} />
            {allSpots
              .filter((s) => s.active)
              .map((s) => {
                const b = bySpot.get(s.id);
                const fill = !b ? FILL.free : isSettled(b.payment) ? FILL.paid : FILL.unpaid;
                const font = Math.max(
                  6,
                  Math.min(s.height * 0.7, (s.width / Math.max(s.label.length, 1)) * 1.5),
                );
                return (
                  <g key={s.id} transform={`translate(${s.x} ${s.y}) rotate(${s.rotation})`}>
                    <rect
                      x={-s.width / 2}
                      y={-s.height / 2}
                      width={s.width}
                      height={s.height}
                      fill={fill}
                      stroke="#000"
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={font}
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {s.label}
                    </text>
                  </g>
                );
              })}
          </svg>
        </section>
      )}

      {streets.map((street) => (
        <section key={street} className="mt-6 break-inside-avoid-page">
          <h2 className="mb-1 text-lg font-semibold">{street}</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left">
                {["N°", "Exposant", "Téléphone", "À encaisser", "Présent"].map((h) => (
                  <th key={h} className="border border-stone-400 px-2 py-1">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => (r.spot.street || "Sans rue") === street)
                .map(({ spot, booking }) => {
                  const due =
                    booking && !isSettled(booking.payment)
                      ? (booking.amountDueCents ?? 0) - booking.paidCents
                      : 0;
                  return (
                    <tr key={spot.id}>
                      <td className="border border-stone-400 px-2 py-1 font-semibold">{spot.label}</td>
                      <td className="border border-stone-400 px-2 py-1">
                        {booking?.contact.name ?? <em>libre</em>}
                      </td>
                      <td className="border border-stone-400 px-2 py-1">
                        {booking ? formatPhone(booking.contact.phone) : ""}
                      </td>
                      <td className="border border-stone-400 px-2 py-1">
                        {due > 0 ? formatEuros(due) : booking ? "payé" : ""}
                      </td>
                      <td className="w-16 border border-stone-400 px-2 py-1">{booking ? "☐" : ""}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
