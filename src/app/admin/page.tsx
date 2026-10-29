import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ArrowRight, Check, ChevronRight, Clock, Euro, Inbox, Mail, type LucideIcon } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";
import { db } from "@/db";
import { bookings, contacts, type Edition, importBatches, plans, residentLinks, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, formatDateFr, todayBrussels } from "@/lib/dates";
import { loadEditionBookings } from "@/lib/edition-bookings-server";
import { getCurrentEdition } from "@/lib/editions";
import { isSettled } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";

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
  const [[offers], live] = edition
    ? await Promise.all([
        db
          .select({
            total: sql<number>`count(*)::int`,
            invited: sql<number>`count(*) filter (where exists (select 1 from email_outbox o where o.booking_id = ${bookings.id} and o.template = 'invitation'))::int`,
          })
          .from(bookings)
          .where(and(eq(bookings.editionId, edition.id), eq(bookings.source, "priority"))),
        loadEditionBookings(edition.id, { liveOnly: true }),
      ])
    : [[{ total: 0, invited: 0 }], []];

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
  const nextStep = steps.find((s) => !s.done);

  // Season figures
  const confirmed = live.filter((b) => b.status === "confirmed");
  const offered = live.filter((b) => b.status === "offered");
  const requested = live.filter((b) => b.status === "requested");
  const unpaid = confirmed.filter((b) => !isSettled(b.payment) && (b.amountDueCents ?? 0) > 0);
  const heldSpots = [...confirmed, ...offered].reduce((n, b) => n + b.spots.length, 0);
  const collected = live.reduce((t, b) => t + b.paidCents, 0);
  const expected = confirmed.reduce((t, b) => t + (b.amountDueCents ?? 0), 0);
  const fill = spotStats.active ? Math.round((heldSpots / spotStats.active) * 100) : 0;

  const todo: { icon: LucideIcon; tone: string; label: string; hint: string; href: string }[] = [];
  if (requested.length)
    todo.push({
      icon: Inbox,
      tone: "bg-blue-50 text-blue-700",
      label: `${requested.length} demande${plural(requested.length)} à traiter`,
      hint: "Demandes faites sur la carte publique",
      href: "/admin/demandes",
    });
  if (offered.length)
    todo.push({
      icon: Mail,
      tone: "bg-amber-50 text-amber-700",
      label: `${offered.length} offre${plural(offered.length)} sans réponse`,
      hint: edition?.priorityDeadline
        ? `Échéance le ${formatDateFr(edition.priorityDeadline)} — relancer si besoin`
        : "Relancer si besoin",
      href: "/admin/priorites",
    });
  if (unpaid.length)
    todo.push({
      icon: Euro,
      tone: "bg-slate-100 text-slate-700",
      label: `${unpaid.length} réservation${plural(unpaid.length)} non payée${plural(unpaid.length)}`,
      hint: "Enregistrer les paiements reçus",
      href: "/admin/reservations",
    });
  if (nextStep)
    todo.push({
      icon: ArrowRight,
      tone: "bg-brand-50 text-brand-700",
      label: nextStep.label,
      hint: "Prochaine étape de la mise en route",
      href: nextStep.href,
    });

  const today = todayBrussels();
  const daysLeft = edition?.marketDate ? daysBetween(today, edition.marketDate) : null;
  const phases = edition ? seasonPhases(edition, today) : [];
  const current = phases.find((p) => p.state === "current");

  return (
    <div className="space-y-6">
      <section className="bg-dots relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_48px_-32px_rgb(15_23_42/0.35)]">
        <div
          aria-hidden
          className="bg-brand-600 absolute -top-16 -right-16 hidden size-64 rounded-full opacity-90 md:block"
        />
        <div
          aria-hidden
          className="bg-brand-100 absolute right-36 -bottom-20 hidden size-40 rounded-full md:block"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6 p-6 md:p-8">
          <div className="max-w-xl">
            {current && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <span className="size-1.5 rounded-full bg-green-500" />
                {current.label} en cours
              </span>
            )}
            <h1 className="font-display mt-3 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
              Bonjour {user.name}
            </h1>
            <p className="mt-2 text-slate-600">
              {edition
                ? `Brocante ${edition.year}${edition.marketDate ? ` — ${formatDateFr(edition.marketDate, true)}` : ""}.`
                : "Préparation de la brocante."}{" "}
              {todo.length
                ? `${todo.length} point${plural(todo.length)} demande${todo.length > 1 ? "nt" : ""} votre attention.`
                : "Tout est à jour."}
            </p>
            {todo[0] && (
              <div className="mt-5">
                <LinkButton href={todo[0].href}>
                  {todo[0].label}
                  <ArrowRight className="size-4" aria-hidden />
                </LinkButton>
              </div>
            )}
          </div>
          {daysLeft !== null && daysLeft >= 0 && (
            <div className="rotate-3 rounded-2xl bg-white px-5 py-3 text-center shadow-xl ring-1 ring-slate-200 md:px-6 md:py-4">
              <div className="text-brand-700 text-[11px] font-bold tracking-widest uppercase">
                {daysLeft === 0 ? "C’est" : "Jour J dans"}
              </div>
              <div className="font-display text-5xl leading-none font-extrabold tracking-tighter text-slate-900 md:text-6xl">
                {daysLeft === 0 ? "J" : daysLeft}
              </div>
              <div className="text-sm font-semibold text-slate-700">
                {daysLeft === 0 ? "aujourd’hui" : `jour${plural(daysLeft)}`}
              </div>
            </div>
          )}
        </div>
        {phases.length > 0 && (
          <ol className="relative mx-4 mb-4 grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-4 md:mx-6 md:mb-6">
            {phases.map((p) => (
              <li key={p.label}>
                <div
                  className={`h-1.5 rounded-full ${
                    p.state === "done"
                      ? "bg-brand-600"
                      : p.state === "current"
                        ? "bg-brand-500"
                        : "bg-slate-200"
                  }`}
                />
                <div
                  className={`mt-2.5 flex items-center gap-1.5 text-sm font-semibold ${
                    p.state === "current" ? "text-brand-700" : "text-slate-900"
                  }`}
                >
                  {p.state === "done" && <Check className="text-brand-600 size-4" aria-hidden />}
                  {p.label}
                  {p.state === "current" && <span className="sr-only">(en cours)</span>}
                </div>
                <div className="text-xs text-slate-500">{p.hint}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {edition && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="flex items-center gap-4">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--color-brand-600) ${fill}%, var(--color-brand-100) ${fill}% 100%)`,
              }}
            >
              <div className="text-brand-700 flex size-12 items-center justify-center rounded-full bg-white text-sm font-bold">
                {fill}%
              </div>
            </div>
            <Stat label="Emplacements attribués" value={heldSpots} total={spotStats.active} />
          </Card>
          <Card>
            <Stat
              label="Payées"
              value={confirmed.length - unpaid.length}
              total={confirmed.length}
              icon={Check}
            />
            <Bar value={confirmed.length - unpaid.length} max={confirmed.length} />
          </Card>
          <Card>
            <Stat label="Encaissé" value={formatEuros(collected)} icon={Euro} />
            <Bar value={collected} max={expected} />
            <div className="mt-1.5 text-xs text-slate-500">sur {formatEuros(expected)} attendus</div>
          </Card>
          <Card>
            <Stat label="Offres en attente" value={offered.length} icon={Clock} />
            <div className="mt-2 text-xs text-slate-500">
              {edition.priorityDeadline
                ? `Échéance le ${formatDateFr(edition.priorityDeadline)}`
                : "Pas d’échéance"}
            </div>
          </Card>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="overflow-hidden p-0">
          <h2 className="font-display px-5 pt-4 pb-3 text-lg font-bold">À faire</h2>
          {todo.length ? (
            <ul>
              {todo.map((t) => (
                <li key={t.label} className="border-t border-slate-100">
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
                  >
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${t.tone}`}>
                      <t.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                      <span className="block text-xs text-slate-500">{t.hint}</span>
                    </span>
                    <ChevronRight className="size-4 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-slate-100 px-5 py-6 text-sm text-slate-500">
              Rien à faire pour le moment.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="font-display mb-3 text-lg font-bold">Référentiel</h2>
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Emplacements", value: spotStats.total, href: "/admin/emplacements" },
                { label: "Exposants", value: contactStats.total, href: "/admin/exposants" },
                { label: "Riverains", value: residentStats.total, href: "/admin/exposants" },
              ].map((s) => (
                <Link
                  key={s.label}
                  href={s.href}
                  className="rounded-xl bg-slate-50 px-2 py-3 hover:bg-slate-100"
                >
                  <dd className="font-display text-2xl font-extrabold">{s.value}</dd>
                  <dt className="text-xs text-slate-500">{s.label}</dt>
                </Link>
              ))}
            </dl>
          </Card>
          <SetupChecklist steps={steps} />
        </div>
      </div>
    </div>
  );
}

const plural = (n: number) => (n > 1 ? "s" : "");

function Stat({
  label,
  value,
  total,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  total?: number;
  icon?: LucideIcon;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
        {label}
        {Icon && (
          <span className="bg-brand-50 text-brand-700 flex size-8 items-center justify-center rounded-lg">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="font-display text-3xl font-extrabold tracking-tight text-slate-900">
        {value}
        {total !== undefined && <span className="text-base font-semibold text-slate-400"> / {total}</span>}
      </div>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mt-3 h-2 rounded-full bg-slate-100" role="presentation">
      <div className="bg-brand-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SetupChecklist({ steps }: { steps: { done: boolean; label: string; href: string }[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const list = (
    <ol className="mt-3 space-y-2">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-3 text-sm">
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              s.done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {s.done ? <Check className="size-3.5" aria-label="Fait" /> : i + 1}
          </span>
          <Link
            href={s.href}
            className={s.done ? "text-slate-500" : "text-brand-700 font-medium hover:underline"}
          >
            {s.label}
          </Link>
        </li>
      ))}
    </ol>
  );
  const summary = (
    <span className="flex items-center justify-between gap-3">
      <span className="font-display text-lg font-bold">Mise en route</span>
      <span className="text-sm text-slate-500">
        {doneCount} / {steps.length}
      </span>
    </span>
  );
  // Once everything is done the checklist folds away.
  return (
    <Card>
      {doneCount === steps.length ? (
        <details>
          <summary className="cursor-pointer list-none">{summary}</summary>
          {list}
        </details>
      ) : (
        <>
          {summary}
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div
              className="bg-brand-600 h-1.5 rounded-full"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>
          {list}
        </>
      )}
    </Card>
  );
}

type Phase = { label: string; hint: string; state: "done" | "current" | "todo" };

/** The season's four phases (spec §4.5) and where today falls. */
function seasonPhases(edition: Edition, today: string): Phase[] {
  const order = ["preparation", "priority", "open", "day"] as const;
  const now =
    edition.status === "closed" || (edition.marketDate && today >= edition.marketDate)
      ? "day"
      : edition.status === "preparation"
        ? "preparation"
        : edition.status === "priority"
          ? "priority"
          : "open";
  const at = order.indexOf(now);
  const state = (i: number): Phase["state"] => (i < at ? "done" : i === at ? "current" : "todo");
  return [
    { label: "Préparation", hint: "Plan, historique, tarifs", state: state(0) },
    {
      label: "Priorités",
      hint: edition.priorityDeadline ? `Jusqu’au ${formatDateFr(edition.priorityDeadline)}` : "Date à fixer",
      state: state(1),
    },
    {
      label: "Ouverture au public",
      hint: edition.publicOpeningDate
        ? `À partir du ${formatDateFr(edition.publicOpeningDate)}`
        : "Date à fixer",
      state: state(2),
    },
    {
      label: "Jour J",
      hint: edition.marketDate ? formatDateFr(edition.marketDate, true) : "Date à fixer",
      state: state(3),
    },
  ];
}
