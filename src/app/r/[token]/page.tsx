import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { Alert, Card } from "@/components/ui";
import { expireOffers, loadBooking } from "@/lib/bookings-server";
import { formatDateFr, todayBrussels } from "@/lib/dates";
import { getSettings, loadTariffGrid } from "@/lib/editions";
import { resolveMagicLink } from "@/lib/magic-links";
import { formatEuros, pricePerSpot } from "@/lib/pricing";
import { joinLabels } from "@/lib/spots";
import { loadChoices, requestSummary } from "@/lib/requests-server";
import { cancelMyRequest } from "./actions";
import { OfferForm } from "./offer-form";

export const metadata: Metadata = { title: "Ma réservation", robots: { index: false } };

export default async function BookingPage({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const justSent = (await searchParams).nouveau !== undefined;
  const link = await resolveMagicLink(token);
  if (!link) notFound();
  let b = await loadBooking(link.bookingId);
  if (!b || b.contact.id !== link.contactId) notFound();
  if (b.booking.status === "offered" && b.booking.offerExpiresAt && b.booking.offerExpiresAt < new Date()) {
    await expireOffers(b.edition.id);
    b = (await loadBooking(link.bookingId))!;
  }
  const { booking, contact, edition } = b;
  const settings = await getSettings();
  const labels = joinLabels(b.spots.map((s) => s.label));

  let content: React.ReactNode;
  if (booking.status === "offered") {
    const grid = await loadTariffGrid(edition.id);
    content = (
      <>
        <p className="mb-4">
          {booking.priorityReason === "resident"
            ? "Comme vous habitez juste en face, "
            : booking.priorityReason === "last_year"
              ? "Comme vous l’aviez l’an dernier, "
              : booking.source === "request"
                ? "Les emplacements demandés n’étant plus libres, "
                : ""}
          {b.spots.length > 1
            ? `les emplacements n°${labels} vous sont réservés`
            : `l’emplacement n°${labels} vous est réservé`}{" "}
          jusqu’au <strong>{formatDateFr(todayBrussels(booking.offerExpiresAt ?? new Date()))}</strong>.
        </p>
        <OfferForm
          token={token}
          spots={b.spots.map((s) => ({ id: s.id, label: s.label, street: s.street }))}
          unitPriceCents={pricePerSpot(grid, contact.kind, todayBrussels(), edition.earlyBirdDeadline)}
          contact={{
            phone: contact.phone,
            email: contact.email,
            street: contact.street,
            houseNumber: contact.houseNumber,
            postcode: contact.postcode,
            city: contact.city,
          }}
        />
      </>
    );
  } else if (booking.status === "confirmed") {
    content = (
      <div className="space-y-4">
        <Alert tone="green">Votre réservation est confirmée. Merci !</Alert>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Emplacement{b.spots.length > 1 ? "s" : ""}</dt>
          <dd className="font-semibold">n°{labels}</dd>
          <dt className="text-slate-500">Montant</dt>
          <dd className="font-semibold">{formatEuros(booking.amountDueCents)}</dd>
          <dt className="text-slate-500">Référence</dt>
          <dd className="font-mono">{booking.reference}</dd>
        </dl>
        {edition.paymentInstructions && (
          <p className="rounded-md bg-slate-100 p-3 text-sm whitespace-pre-line">
            {edition.paymentInstructions}
          </p>
        )}
        {settings.emailEnabled && (
          <p className="text-sm text-slate-600">Une confirmation vous a aussi été envoyée par email.</p>
        )}
      </div>
    );
  } else if (booking.status === "requested" || booking.status === "waitlist") {
    const choices = await loadChoices(booking.id);
    content = (
      <div className="space-y-4">
        {justSent ? (
          <Alert tone="green">
            Merci ! Votre demande est bien enregistrée.
            {settings.emailEnabled
              ? " Un email de confirmation vous a été envoyé."
              : " Ajoutez cette page à vos favoris : c’est votre lien personnel pour suivre votre demande."}
          </Alert>
        ) : booking.status === "waitlist" ? (
          <Alert tone="amber">
            Votre demande est en liste d’attente : nous vous recontactons dès qu’un emplacement se libère.
          </Alert>
        ) : (
          <Alert tone="amber">Votre demande est en cours de traitement par l’organisateur.</Alert>
        )}
        <p className="text-sm">
          <span className="text-slate-500">Votre demande :</span>{" "}
          {requestSummary(choices.map((c) => c.spots.map((s) => s.label)))}
        </p>
        <p className="text-sm text-slate-600">Gardez ce lien : il vous permet de suivre votre demande.</p>
        <form action={cancelMyRequest.bind(null, token)}>
          <button className="text-sm text-red-700 underline">Annuler ma demande</button>
        </form>
      </div>
    );
  } else if (booking.status === "declined") {
    content = (
      <Alert tone="amber">
        Nous avons bien noté que vous ne venez pas cette année. Merci de nous avoir prévenus !
      </Alert>
    );
  } else {
    content = (
      <Alert tone="amber">
        Cette offre n’est plus valable{booking.status === "expired" ? " : la date limite est dépassée" : ""}.
        Contactez l’organisateur si vous souhaitez quand même un emplacement.
      </Alert>
    );
  }

  return (
    <PublicShell
      name={settings.organizerName}
      width="max-w-2xl"
      eyebrow={`Brocante ${edition.year}`}
      title={`Bonjour ${contact.firstName || contact.lastName || contact.company}`}
      subtitle={edition.marketDate && `La brocante aura lieu le ${formatDateFr(edition.marketDate, true)}.`}
    >
      <Card className="p-6">{content}</Card>
    </PublicShell>
  );
}
