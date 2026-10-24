"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/carte", label: "Carte" },
  { href: "/admin/reservations", label: "Réservations" },
  { href: "/admin/plan", label: "Plan" },
  { href: "/admin/emplacements", label: "Emplacements" },
  { href: "/admin/exposants", label: "Exposants" },
  { href: "/admin/import", label: "Reprise historique" },
  { href: "/admin/priorites", label: "Priorités" },
  { href: "/admin/demandes", label: "Demandes" },
  { href: "/admin/jour-j", label: "Jour J" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/parametres", label: "Paramètres" },
  { href: "/admin/organisateurs", label: "Organisateurs" },
];


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
    </nav>
  );
}
