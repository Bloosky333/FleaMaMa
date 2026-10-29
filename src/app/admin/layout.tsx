import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { daysBetween, formatShortDayFr, todayBrussels } from "@/lib/dates";
import { getCurrentEdition } from "@/lib/editions";
import { MobileNav, type NavContext, Sidebar, TopBar } from "./nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [user, edition] = await Promise.all([requireUser(), getCurrentEdition()]);
  const [pending] = edition
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(bookings)
        .where(and(eq(bookings.editionId, edition.id), eq(bookings.status, "requested")))
    : [{ n: 0 }];

  const ctx: NavContext = {
    userName: user.name,
    edition: edition && {
      year: edition.year,
      marketDay: edition.marketDate ? formatShortDayFr(edition.marketDate) : null,
      daysLeft: edition.marketDate ? daysBetween(todayBrussels(), edition.marketDate) : null,
    },
    pendingRequests: pending.n,
  };

  return (
    <div className="min-h-screen md:flex">
      <Sidebar ctx={ctx} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar ctx={ctx} />
        <main className="w-full max-w-7xl flex-1 p-4 pb-24 md:p-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
      <MobileNav ctx={ctx} />
    </div>
  );
}
