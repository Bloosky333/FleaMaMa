"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Ellipsis,
  House,
  Inbox,
  LayoutGrid,
  LogOut,
  Map as MapIcon,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "../login/actions";

export type NavContext = {
  userName: string;
  /** Current edition, if any: year and a short market-day label ("dim. 6 juin"). */
  edition: { year: number; marketDay: string | null; daysLeft: number | null } | null;
  /** Requests waiting for the organisers. */
  pendingRequests: number;
};

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other URL prefixes that belong to this entry (merged pages, sub-pages). */
  also?: string[];
  exact?: boolean;
  badge?: "pendingRequests";
};

const home: Item = { href: "/admin", label: "Tableau de bord", icon: House, exact: true };
const priorities: Item = { href: "/admin/priorites", label: "Priorités", icon: Star };
const requests: Item = { href: "/admin/demandes", label: "Demandes", icon: Inbox, badge: "pendingRequests" };
const bookings: Item = { href: "/admin/reservations", label: "Réservations", icon: ClipboardList };
const statusMap: Item = { href: "/admin/carte", label: "Carte des statuts", icon: MapIcon };
const marketDay: Item = { href: "/admin/jour-j", label: "Jour J", icon: CalendarCheck };
const plan: Item = {
  href: "/admin/plan",
  label: "Plan & emplacements",
  icon: LayoutGrid,
  also: ["/admin/emplacements"],
};
const contacts: Item = { href: "/admin/exposants", label: "Exposants", icon: Users, also: ["/admin/import"] };
const settings: Item = {
  href: "/admin/parametres",
  label: "Paramètres",
  icon: SlidersHorizontal,
  also: ["/admin/emails", "/admin/organisateurs"],
};

function sections(ctx: NavContext): { title?: string; items: Item[] }[] {
  return [
    { items: [home] },
    {
      title: ctx.edition ? `Saison ${ctx.edition.year}` : "Saison",
      items: [priorities, requests, bookings, statusMap],
    },
    { title: "Jour J", items: [marketDay] },
    { title: "Référentiel", items: [plan, contacts] },
  ];
}
const allItems = [home, priorities, requests, bookings, statusMap, marketDay, plan, contacts, settings];

/** Pages merged under one menu entry, shown as tabs above the page. */
type Tab = { href: string; label: string; exact?: boolean };
const tabGroups: Tab[][] = [
  [
    { href: "/admin/plan", label: "Plan" },
    { href: "/admin/emplacements", label: "Liste des emplacements" },
  ],
  [
    { href: "/admin/exposants", label: "Exposants" },
    { href: "/admin/import", label: "Reprise de l’historique" },
  ],
  [
    { href: "/admin/jour-j", label: "Pointage", exact: true },
    { href: "/admin/jour-j/sur-place", label: "Exposant sur place" },
    { href: "/admin/jour-j/imprimer", label: "Listes à imprimer" },
  ],
  [
    { href: "/admin/parametres", label: "Édition & tarifs", exact: true },
    { href: "/admin/parametres/emails", label: "Textes des emails" },
    { href: "/admin/emails", label: "File d’envoi" },
    { href: "/admin/organisateurs", label: "Organisateurs" },
  ],
];

/** Last breadcrumb for pages below a menu entry. */
const detailLabels: [RegExp, string][] = [
  [/^\/admin\/exposants\/nouveau/, "Nouvel exposant"],
  [/^\/admin\/exposants\/\d+/, "Fiche exposant"],
  [/^\/admin\/reservations\/\d+/, "Réservation"],
  [/^\/admin\/import\/\d+/, "Reprise"],
];

const under = (path: string, href: string) => path === href || path.startsWith(href + "/");
const isActive = (path: string, item: Item) =>
  item.exact ? path === item.href : [item.href, ...(item.also ?? [])].some((h) => under(path, h));
const tabActive = (path: string, tab: Tab) => (tab.exact ? path === tab.href : under(path, tab.href));

function NavLink({
  item,
  path,
  ctx,
  onNavigate,
}: {
  item: Item;
  path: string;
  ctx: NavContext;
  onNavigate?: () => void;
}) {
  const active = isActive(path, item);
  const count = item.badge ? ctx[item.badge] : 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-100 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="truncate">{item.label}</span>
      {count > 0 && (
        <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
          {count}
        </span>
      )}
    </Link>
  );
}

function Logo() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-2.5">
      <span className="bg-brand-600 shadow-brand-600/30 flex size-8 items-center justify-center rounded-[10px] text-white shadow-md">
        <Store className="size-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">FleaMaMa</span>
    </Link>
  );
}

function SidebarContent({ ctx, onNavigate }: { ctx: NavContext; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="pt-1 pb-4">
        <Logo />
      </div>
      <Link
        href="/admin/parametres"
        onNavigate={onNavigate}
        className="mb-2 flex items-center justify-between rounded-xl px-3 py-2 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        <span>
          <span className="block text-[11px] font-medium text-slate-500">Édition</span>
          <span className="block text-sm font-semibold text-slate-900">
            {ctx.edition
              ? `${ctx.edition.year}${ctx.edition.marketDay ? ` · ${ctx.edition.marketDay}` : ""}`
              : "À créer"}
          </span>
        </span>
        <ChevronRight className="size-4 text-slate-400" aria-hidden />
      </Link>
      <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
        {sections(ctx).map((section, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {section.title && (
              <div className="flex items-center justify-between px-2.5 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                {section.title}
                {section.title === "Jour J" && ctx.edition?.daysLeft != null && ctx.edition.daysLeft >= 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tracking-normal text-slate-700 normal-case">
                    J-{ctx.edition.daysLeft}
                  </span>
                )}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} path={path} ctx={ctx} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-slate-200 pt-3">
        <NavLink item={settings} path={path} ctx={ctx} onNavigate={onNavigate} />
        <form action={logout} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
          <span className="bg-brand-100 text-brand-700 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
            {initials(ctx.userName)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{ctx.userName}</span>
          <button
            aria-label="Se déconnecter"
            title="Se déconnecter"
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          >
            <LogOut className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Sidebar({ ctx }: { ctx: NavContext }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white md:block print:hidden">
      <SidebarContent ctx={ctx} />
    </aside>
  );
}

/** Breadcrumbs, quick search and the tabs of merged pages. */
export function TopBar({ ctx }: { ctx: NavContext }) {
  const path = usePathname();
  const item = allItems.find((i) => isActive(path, i));
  const section = sections(ctx).find((s) => item && s.items.includes(item));
  const tabs = tabGroups.find((g) => g.some((t) => tabActive(path, t)));
  const detail = detailLabels.find(([re]) => re.test(path))?.[1];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur print:hidden">
      <div className="flex min-h-14 items-center gap-3 px-4 md:px-8">
        <div className="md:hidden">
          <Logo />
        </div>
        <nav
          aria-label="Fil d’Ariane"
          className="hidden min-w-0 items-center gap-1.5 text-sm text-slate-500 md:flex"
        >
          {section?.title && (
            <>
              <span>{section.title}</span>
              <ChevronRight className="size-3.5" aria-hidden />
            </>
          )}
          {item &&
            (detail ? (
              <Link href={item.href} className="hover:text-slate-900">
                {item.label}
              </Link>
            ) : (
              <span className="font-semibold text-slate-900">{item.label}</span>
            ))}
          {detail && (
            <>
              <ChevronRight className="size-3.5" aria-hidden />
              <span className="truncate font-semibold text-slate-900">{detail}</span>
            </>
          )}
        </nav>
        <form action="/admin/exposants" role="search" className="relative ml-auto hidden w-72 sm:block">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            name="q"
            aria-label="Rechercher un exposant"
            placeholder="Rechercher un exposant…"
            className="focus:border-brand-500 focus:ring-brand-100 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:bg-white focus:ring-3 focus:outline-none"
          />
        </form>
      </div>
      {tabs && (
        <nav aria-label="Sous-sections" className="-mb-px flex gap-6 overflow-x-auto px-4 md:px-8">
          {tabs.map((t) => {
            const active = tabActive(path, t);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`border-b-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

const mobileTabs = [home, requests, bookings, marketDay];

/** Bottom tab bar on phones; "Plus" opens the full menu. */
export function MobileNav({ ctx }: { ctx: NavContext }) {
  const path = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const inMenu = !mobileTabs.some((t) => isActive(path, t));

  return (
    <div className="md:hidden print:hidden">
      <nav
        aria-label="Navigation rapide"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        {mobileTabs.map((item) => {
          const active = isActive(path, item);
          const count = item.badge ? ctx[item.badge] : 0;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? "text-brand-700" : "text-slate-500"
              }`}
            >
              <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {item.label === "Tableau de bord" ? "Accueil" : item.label}
              {count > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenOn(path)}
          aria-expanded={open}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            inMenu ? "text-brand-700" : "text-slate-500"
          }`}
        >
          <Ellipsis className="size-5" aria-hidden />
          Plus
        </button>
      </nav>
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={() => setOpenOn(null)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white shadow-2xl">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setOpenOn(null)}
              className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="size-5" aria-hidden />
            </button>
            <SidebarContent ctx={ctx} onNavigate={() => setOpenOn(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
