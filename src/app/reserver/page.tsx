import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Brocante {edition?.year ?? ""}</h1>
      {edition?.marketDate && (
        <p className="mb-6 text-stone-600">Le {formatDateFr(edition.marketDate, true)}.</p>
      )}
      {!edition || !open ? (
        <Card>
          <Alert tone="amber">
            {edition?.publicOpeningDate && today < edition.publicOpeningDate
              ? `Les réservations ouvriront le ${formatDateFr(edition.publicOpeningDate)}.`
              : "Les réservations ne sont pas ouvertes pour le moment."}
          </Alert>
          <p className="mt-3 text-sm text-stone-600">
            Vous avez reçu un email avec un lien personnel ? Utilisez ce lien pour confirmer votre
            emplacement.
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
        />
      )}
      <footer className="mt-10 flex justify-between text-xs text-stone-500">
        <span>{settings.organizerName}</span>
        <Link href="/admin" className="underline">
          Espace organisateurs
        </Link>
      </footer>
    </main>
  );
}
