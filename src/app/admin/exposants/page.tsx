import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { Badge, Card, Input, LinkButton, PageHeader, Select, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { contacts, residentLinks, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { displayName, formatPhone, normalizePhone } from "@/lib/contacts";

export const metadata: Metadata = { title: "Exposants" };

const PAGE_SIZE = 50;

export default async function ContactsPage({ searchParams }: PageProps<"/admin/exposants">) {
  await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const kind = sp.type === "private" || sp.type === "pro" ? sp.type : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const filters: (SQL | undefined)[] = [isNull(contacts.mergedIntoId)];
  if (q) {
    const like = `%${q}%`;
    const phone = normalizePhone(q);
    filters.push(
      or(
        ilike(contacts.lastName, like),
        ilike(contacts.firstName, like),
        ilike(contacts.company, like),
        ilike(contacts.email, like),
        ilike(contacts.city, like),
        ilike(contacts.street, like),
        ilike(contacts.phone, `%${phone}%`),
        ilike(sql`${contacts.firstName} || ' ' || ${contacts.lastName}`, like),
        ilike(sql`${contacts.lastName} || ' ' || ${contacts.firstName}`, like),
      ),
    );
  }
  if (kind) filters.push(eq(contacts.kind, kind));
  const where = and(...filters);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        company: contacts.company,
        city: contacts.city,
        phone: contacts.phone,
        email: contacts.email,
        kind: contacts.kind,
        residentOf: sql<
          string[]
        >`coalesce(array_agg(${spots.label}) filter (where ${spots.id} is not null), '{}')`,
      })
      .from(contacts)
      .leftJoin(residentLinks, eq(residentLinks.contactId, contacts.id))
      .leftJoin(spots, eq(spots.id, residentLinks.spotId))
      .where(where)
      .groupBy(contacts.id)
      .orderBy(
        asc(sql`lower(${contacts.lastName})`),
        asc(sql`lower(${contacts.firstName})`),
        asc(contacts.company),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contacts)
      .where(where),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(kind && { type: kind }), page: String(p) });
    return `/admin/exposants?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Exposants"
        description={`${total} exposant${total > 1 ? "s" : ""}`}
        actions={<LinkButton href="/admin/exposants/nouveau">Nouvel exposant</LinkButton>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <div className="w-full max-w-sm">
          <Input name="q" defaultValue={q} placeholder="Nom, téléphone, email, localité…" />
        </div>
        <div className="w-44">
          <Select name="type" defaultValue={kind}>
            <option value="">Tous les types</option>
            <option value="private">Particuliers</option>
            <option value="pro">Professionnels</option>
          </Select>
        </div>
        <button className={buttonClass("secondary")}>Rechercher</button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500 uppercase">
            <tr>
              <th className="px-4 py-2">Nom</th>
              <th className="px-4 py-2">Localité</th>
              <th className="px-4 py-2">Téléphone</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Riverain de</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/admin/exposants/${c.id}`} className="text-brand-700 hover:underline">
                    {displayName(c)}
                  </Link>
                </td>
                <td className="px-4 py-2">{c.city}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatPhone(c.phone)}</td>
                <td className="px-4 py-2">{c.email}</td>
                <td className="px-4 py-2">
                  {c.kind === "pro" ? <Badge tone="blue">Pro</Badge> : <Badge>Particulier</Badge>}
                </td>
                <td className="px-4 py-2">{c.residentOf.length ? `n° ${c.residentOf.join(", ")}` : ""}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-500">
                  Aucun exposant{q && " ne correspond à cette recherche"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {page > 1 && (
            <LinkButton variant="secondary" href={pageHref(page - 1)}>
              ← Précédent
            </LinkButton>
          )}
          <span>
            Page {page} / {pages}
          </span>
          {page < pages && (
            <LinkButton variant="secondary" href={pageHref(page + 1)}>
              Suivant →
            </LinkButton>
          )}
        </div>
      )}
    </>
  );
}
