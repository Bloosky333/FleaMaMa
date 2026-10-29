import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicShell } from "@/components/public-shell";
import { Alert, Card } from "@/components/ui";
import { formatDateFr, todayBrussels } from "@/lib/dates";
import { getCurrentEdition, getSettings } from "@/lib/editions";
import { isPublicBookingOpen } from "@/lib/requests";
import { loadPublicMap } from "@/lib/requests-server";
import RequestMap from "./request-map-loader";

export const metadata: Metadata = { title: "Réserver un emplacement" };

export default async function PublicRequestPage() {
  await connection(); // live availability, never prerender
  const [edition, settings] = await Promise.all([getCurrentEdition(), getSettings()]);
  const today = todayBrussels();
  const open = edition ? isPublicBookingOpen(edition, today) : false;
  const map = edition && open ? await loadPublicMap(edition) : null;

  return (
    <PublicShell
      name={settings.organizerName}
      eyebrow={
        <>
          <span className={`size-2 rounded-full ${open ? "bg-green-500" : "bg-slate-400"}`} />
          {open ? "Réservations ouvertes" : "Réservations fermées"}
        </>
      }
      title={`Brocante ${edition?.year ?? ""}`}
      subtitle={edition?.marketDate && `Le ${formatDateFr(edition.marketDate, true)}.`}
    >
      {!edition || !open ? (
        <Card>
          <Alert tone="amber">
            {edition?.publicOpeningDate && today < edition.publicOpeningDate
              ? `Les réservations ouvriront le ${formatDateFr(edition.publicOpeningDate)}.`
              : "Les réservations ne sont pas ouvertes pour le moment."}
          </Alert>
          <p className="mt-3 text-sm text-slate-600">
            {settings.emailEnabled
              ? "Vous avez reçu un email avec un lien personnel ?"
              : "Vous avez reçu un lien personnel ?"}{" "}
            Utilisez ce lien pour confirmer votre emplacement.
          </p>
        </Card>
      ) : !map?.plan ? (
        <Alert tone="amber">Le plan n’est pas encore disponible.</Alert>
      ) : (
        <RequestMap
          plan={map.plan}
          spots={map.spots}
          grid={map.grid}
          today={today}
          earlyBirdDeadline={edition.earlyBirdDeadline}
          emailsEnabled={settings.emailEnabled}
        />
      )}
    </PublicShell>
  );
}
