import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { Badge, Card, Input, LinkButton, PageHeader, Select, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { contacts, plans, residentLinks, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { displayName } from "@/lib/contacts";
import { compareLabels } from "@/lib/spots";

export const metadata: Metadata = { title: "Emplacements" };

const NO_STREET = "__none__";

export default async function SpotsPage({ searchParams }: PageProps<"/admin/emplacements">) {
  await requireUser();
  const sp = await searchParams;
  const street = typeof sp.rue === "string" ? sp.rue : "";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const [rows, [plan]] = await Promise.all([
    db
      .select({
        id: spots.id,
        label: spots.label,
        street: spots.street,
        side: spots.side,
        lengthM: spots.lengthM,
        active: spots.active,
        notes: spots.notes,
        facingAddresses: spots.facingAddresses,
        residents: sql<
          { id: number; firstName: string; lastName: string; company: string }[]
        >`coalesce(json_agg(json_build_object('id', ${contacts.id}, 'firstName', ${contacts.firstName}, 'lastName', ${contacts.lastName}, 'company', ${contacts.company})) filter (where ${contacts.id} is not null), '[]')`,
      })
      .from(spots)
      .leftJoin(residentLinks, eq(residentLinks.spotId, spots.id))
      .leftJoin(contacts, eq(contacts.id, residentLinks.contactId))
      .groupBy(spots.id),
    db.select({ defaultLength: plans.defaultSpotLengthM }).from(plans).limit(1),
  ]);

  const streets = Array.from(new Set(rows.map((r) => r.street).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const withoutStreet = rows.filter((r) => !r.street).length;
  const filtered = rows
    .filter((r) => !street || (street === NO_STREET ? !r.street : r.street === street))
    .filter(
      (r) =>
        !q ||
        r.label.toLowerCase() === q ||
        r.notes.toLowerCase().includes(q) ||
        r.facingAddresses.some((a) => a.toLowerCase().includes(q)),
    )
    .sort((a, b) => compareLabels(a.label, b.label));

  return (
    <>
      <PageHeader
        title="Emplacements"
        description={`${rows.length} emplacements, ${rows.filter((r) => r.active).length} actifs${
          withoutStreet ? ` · ${withoutStreet} sans rue` : ""
        }`}
        actions={<LinkButton href="/admin/plan">Modifier sur le plan</LinkButton>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <div className="w-full max-w-xs">
          <Input name="q" defaultValue={q} placeholder="N°, adresse, note…" />
        </div>
        <div className="w-60">
          <Select name="rue" defaultValue={street}>
            <option value="">Toutes les rues</option>
            {streets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {withoutStreet > 0 && <option value={NO_STREET}>— Sans rue —</option>}
          </Select>
        </div>
        <button className={buttonClass("secondary")}>Filtrer</button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2">N°</th>
              <th className="px-4 py-2">Rue</th>
              <th className="px-4 py-2">Côté</th>
              <th className="px-4 py-2">Longueur</th>
              <th className="px-4 py-2">Adresses en face</th>
              <th className="px-4 py-2">Riverains</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <tr key={s.id} className={s.active ? "" : "text-slate-400"}>
                <td className="px-4 py-2 font-semibold">
                  {s.label} {!s.active && <Badge>inactif</Badge>}
                </td>
                <td className="px-4 py-2">
                  {s.street || <span className="text-amber-700">à compléter</span>}
                </td>
                <td className="px-4 py-2">{s.side}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {s.lengthM ?? plan?.defaultLength ?? "—"} m
                  {s.lengthM !== null && s.lengthM !== plan?.defaultLength && (
                    <span className="ml-1">
                      <Badge tone="amber">exception</Badge>
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{s.facingAddresses.join(", ")}</td>
                <td className="px-4 py-2">
                  {s.residents.map((r) => (
                    <Link
                      key={r.id}
                      href={`/admin/exposants/${r.id}`}
                      className="text-brand-700 mr-2 hover:underline"
                    >
                      {displayName(r)}
                    </Link>
                  ))}
                </td>
                <td className="px-4 py-2">{s.notes}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {rows.length === 0 ? (
                    <>
                      Aucun emplacement. Commencez par{" "}
                      <Link href="/admin/plan" className="text-brand-700 underline">
                        le plan
                      </Link>
                      .
                    </>
                  ) : (
                    "Aucun emplacement ne correspond."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
