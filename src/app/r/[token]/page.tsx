import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { expireOffers, loadBooking } from "@/lib/bookings-server";
import { formatDateFr, todayBrussels } from "@/lib/dates";
import { getSettings, loadTariffGrid } from "@/lib/editions";
import { resolveMagicLink } from "@/lib/magic-links";
import { formatEuros, pricePerSpot } from "@/lib/pricing";
import { joinLabels } from "@/lib/spots";
import { OfferForm } from "./offer-form";

export const metadata: Metadata = { title: "Ma réservation", robots: { index: false } };

export default async function BookingPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
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
          <dt className="text-stone-500">Emplacement{b.spots.length > 1 ? "s" : ""}</dt>
          <dd className="font-semibold">n°{labels}</dd>
          <dt className="text-stone-500">Montant</dt>
          <dd className="font-semibold">{formatEuros(booking.amountDueCents)}</dd>
          <dt className="text-stone-500">Référence</dt>
          <dd className="font-mono">{booking.reference}</dd>
        </dl>
        {edition.paymentInstructions && (
          <p className="rounded-md bg-stone-100 p-3 text-sm whitespace-pre-line">
            {edition.paymentInstructions}
          </p>
        )}
        <p className="text-sm text-stone-600">Une confirmation vous a aussi été envoyée par email.</p>
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
    <main className="mx-auto max-w-xl px-4 py-8">
      <p className="text-sm text-stone-500">Brocante {edition.year}</p>
      <h1 className="mb-1 text-2xl font-semibold">
        Bonjour {contact.firstName || contact.lastName || contact.company}
      </h1>
      {edition.marketDate && (
        <p className="mb-6 text-stone-600">
          La brocante aura lieu le {formatDateFr(edition.marketDate, true)}.
        </p>
      )}
      <Card className="p-5">{content}</Card>
      <p className="mt-6 text-center text-xs text-stone-500">{settings.organizerName}</p>
    </main>
  );
}
