"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/plan", label: "Plan" },
  { href: "/admin/emplacements", label: "Emplacements" },
  { href: "/admin/exposants", label: "Exposants" },
  { href: "/admin/organisateurs", label: "Organisateurs" },
];

const upcoming = ["Réservations", "Reprise historique", "Priorités", "Paiements", "Emails", "Paramètres"];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap ${
              active ? "bg-brand-100 text-brand-700" : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      <div className="mt-4 hidden px-3 text-xs font-semibold tracking-wide text-stone-400 uppercase md:block">
        Bientôt
      </div>
      {upcoming.map((label) => (
        <span key={label} className="hidden px-3 py-1 text-sm text-stone-400 md:block">
          {label}
        </span>
      ))}
    </nav>
  );
}
