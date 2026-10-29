import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { bookings, contacts, importBatches, plans, residentLinks, spots } from "@/db/schema";
import { getCurrentEdition } from "@/lib/editions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function Dashboard() {
  const user = await requireUser();
  const [[plan], [spotStats], [contactStats], [residentStats], [imported], edition] = await Promise.all([
    db.select({ id: plans.id }).from(plans).limit(1),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${spots.active})::int`,
        noStreet: sql<number>`count(*) filter (where ${spots.street} = '')::int`,
      })
      .from(spots),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contacts)
      .where(isNull(contacts.mergedIntoId)),
    db.select({ total: sql<number>`count(distinct ${residentLinks.contactId})::int` }).from(residentLinks),
    db
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(eq(importBatches.status, "committed"))
      .limit(1),
    getCurrentEdition(),
  ]);
  const [offers] = edition
    ? await db
        .select({
          total: sql<number>`count(*)::int`,
          invited: sql<number>`count(*) filter (where exists (select 1 from email_outbox o where o.booking_id = ${bookings.id} and o.template = 'invitation'))::int`,
        })
        .from(bookings)
        .where(and(eq(bookings.editionId, edition.id), eq(bookings.source, "priority")))
    : [{ total: 0, invited: 0 }];

  const steps = [
    { done: !!plan, label: "Importer le plan papier", href: "/admin/plan" },
    { done: spotStats.total > 0, label: "Placer les emplacements sur le plan", href: "/admin/plan" },
    {
      done: spotStats.total > 0 && spotStats.noStreet === 0,
      label: "Indiquer la rue de chaque emplacement",
      href: "/admin/emplacements?rue=__none__",
    },
    { done: !!imported, label: "Reprendre l’historique de l’an dernier", href: "/admin/import" },
    {
      done: residentStats.total > 0,
      label: "Lier les riverains à leurs emplacements",
      href: "/admin/exposants",
    },
    {
      done: !!edition?.priorityDeadline,
      label: edition ? `Fixer les dates et les prix ${edition.year}` : "Créer l’édition de cette année",
      href: "/admin/parametres",
    },
    { done: offers.total > 0, label: "Préparer les offres prioritaires", href: "/admin/priorites" },
    { done: offers.invited > 0, label: "Envoyer les invitations", href: "/admin/priorites" },
  ];

  const stats = [
    { label: "Emplacements", value: spotStats.total, sub: `${spotStats.active} actifs` },
    { label: "Exposants", value: contactStats.total, sub: "dans le fichier" },
    { label: "Riverains", value: residentStats.total, sub: "liés à un emplacement" },
  ];

  return (
    <>
      <PageHeader title={`Bonjour ${user.name}`} description="Préparation de la brocante" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="text-sm text-slate-500">{s.label}</div>
            <div className="text-3xl font-semibold">{s.value}</div>
            <div className="text-xs text-slate-500">{s.sub}</div>
          </Card>
        ))}
      </div>
      <Card className="max-w-2xl">
        <h2 className="mb-3 font-semibold">Mise en route</h2>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <Link
                href={s.href}
                className={s.done ? "text-slate-500 line-through" : "text-brand-700 hover:underline"}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          Prochaines étapes (en développement) : carte des réservations, paiements, demandes ouvertes à tous,
          jour J.
        </p>
      </Card>
    </>
  );
}
