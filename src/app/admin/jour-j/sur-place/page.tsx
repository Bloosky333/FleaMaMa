import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayBrussels } from "@/lib/dates";
import { getCurrentEdition, loadTariffGrid } from "@/lib/editions";
import { freeSpotsNow } from "@/lib/market-day-server";
import { pricePerSpot } from "@/lib/pricing";
import { WalkInForm } from "./walk-in-form";

export const metadata: Metadata = { title: "Exposant sur place" };

export default async function WalkInPage() {
  await requireUser();
  const edition = await getCurrentEdition();
  if (!edition) notFound();
  const [free, grid] = await Promise.all([freeSpotsNow(edition), loadTariffGrid(edition.id)]);
  const today = todayBrussels();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Exposant sur place"
        actions={
          <Link href="/admin/jour-j" className="text-brand-700 text-sm underline">
            ← Jour J
          </Link>
        }
      />
      <Card>
        <WalkInForm
          free={free}
          prices={{
            private: pricePerSpot(grid, "private", today, edition.earlyBirdDeadline),
            pro: pricePerSpot(grid, "pro", today, edition.earlyBirdDeadline),
          }}
        />
      </Card>
    </div>
  );
}
