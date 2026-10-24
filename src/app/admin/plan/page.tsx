import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { plans, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import PlanEditor from "./plan-editor-loader";
import { PlanUpload } from "./plan-upload";
import { toEditorSpot } from "./types";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({ searchParams }: PageProps<"/admin/plan">) {
  await requireUser();
  const { remplacer } = await searchParams;
  const [plan] = await db
    .select({
      id: plans.id,
      width: plans.width,
      height: plans.height,
      defaultSpotWidth: plans.defaultSpotWidth,
      defaultSpotHeight: plans.defaultSpotHeight,
      defaultSpotLengthM: plans.defaultSpotLengthM,
    })
    .from(plans)
    .orderBy(desc(plans.id))
    .limit(1);

  if (!plan || remplacer !== undefined) {
    return (
      <>
        <PageHeader
          title={plan ? "Remplacer le plan" : "Plan de la brocante"}
          description="Le plan papier sert de fond de carte ; les emplacements sont dessinés par-dessus."
        />
        <Card className="max-w-3xl">
          <PlanUpload hasPlan={!!plan} />
        </Card>
      </>
    );
  }

  const rows = await db.select().from(spots);
  return (
    <>
      <PageHeader
        title="Plan"
        description="Placez et ajustez les emplacements sur le plan."
        actions={
          <a href="/admin/plan?remplacer" className="text-brand-700 text-sm underline">
            Remplacer l’image du plan
          </a>
        }
      />
      <PlanEditor key={plan.id} plan={plan} initialSpots={rows.map(toEditorSpot)} />
    </>
  );
}
