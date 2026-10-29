import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { expireOffers } from "@/lib/bookings-server";
import { getCurrentEdition, getSettings } from "@/lib/editions";
import { loadMapData } from "@/lib/map-server";
import StatusMap from "./status-map-loader";

export const metadata: Metadata = { title: "Carte" };

export default async function MapPage() {
  await requireUser();
  const [edition, [plan]] = await Promise.all([
    getCurrentEdition(),
    db
      .select({ id: plans.id, width: plans.width, height: plans.height })
      .from(plans)
      .orderBy(desc(plans.id))
      .limit(1),
  ]);
  if (!edition || !plan) {
    return (
      <>
        <PageHeader title="Carte" />
        <Alert tone="amber">
          {!plan ? (
            <>
              Importez d’abord le{" "}
              <Link href="/admin/plan" className="underline">
                plan
              </Link>
              .
            </>
          ) : (
            <>
              Créez d’abord l’édition de cette année dans{" "}
              <Link href="/admin/parametres" className="underline">
                Paramètres
              </Link>
              .
            </>
          )}
        </Alert>
      </>
    );
  }
  await expireOffers(edition.id);
  const [data, settings] = await Promise.all([loadMapData(edition), getSettings()]);
  return (
    <>
      <PageHeader title={`Carte ${edition.year}`} description="Emplacements libres et réservés, en direct." />
      <StatusMap
        plan={plan}
        spots={data.spots}
        previousYear={data.previousYear}
        emailsEnabled={settings.emailEnabled}
      />
    </>
  );
}
