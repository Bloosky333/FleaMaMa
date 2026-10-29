import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { bookingSpots, bookings, contacts, editions, residentLinks, spots } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { compareLabels } from "@/lib/spots";
import { addressKey, displayName, formatPhone } from "@/lib/contacts";
import { deleteContact, linkResidentSpot, removeResidentLink } from "../actions";
import { ContactForm } from "../contact-form";
import { ResidentLinkForm } from "./resident-link-form";

export const metadata: Metadata = { title: "Exposant" };

const statusLabels: Record<string, string> = {
  offered: "Offre envoyée",
  requested: "Demande",
  confirmed: "Confirmée",
  declined: "Refusée",
  expired: "Expirée",
  waitlist: "Liste d’attente",
  cancelled: "Annulée",
  historical: "Historique",
};

export default async function ContactPage({ params, searchParams }: PageProps<"/admin/exposants/[id]">) {
  await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) notFound();

  const [links, history, facing] = await Promise.all([
    db
      .select({ spotId: spots.id, label: spots.label, street: spots.street })
      .from(residentLinks)
      .innerJoin(spots, eq(spots.id, residentLinks.spotId))
      .where(eq(residentLinks.contactId, id))
      .orderBy(asc(spots.label)),
    db
      .select({
        id: bookings.id,
        year: editions.year,
        status: bookings.status,
        historicalPaid: bookings.historicalPaid,
        labels: sql<
          string[]
        >`coalesce(array_agg(${spots.label}) filter (where ${spots.id} is not null), '{}')`,
      })
      .from(bookings)
      .innerJoin(editions, eq(editions.id, bookings.editionId))
      .leftJoin(bookingSpots, eq(bookingSpots.bookingId, bookings.id))
      .leftJoin(spots, eq(spots.id, bookingSpots.spotId))
      .where(eq(bookings.contactId, id))
      .groupBy(bookings.id, editions.year)
      .orderBy(desc(editions.year)),
    db.select({ id: spots.id, label: spots.label, facingAddresses: spots.facingAddresses }).from(spots),
  ]);
  links.sort((a, b) => compareLabels(a.label, b.label));

  // Spots whose "facing address" is this contact's address: suggested, the organiser validates.
  const home = contact.street ? addressKey(contact.street, contact.houseNumber) : "";
  const linked = new Set(links.map((l) => l.spotId));
  const suggestions = home
    ? facing
        .filter((s) => !linked.has(s.id) && s.facingAddresses.some((a) => addressKey(a) === home))
        .sort((a, b) => compareLabels(a.label, b.label))
    : [];

  return (
    <>
      <PageHeader
        title={displayName(contact)}
        description={
          <>
            {contact.kind === "pro" ? <Badge tone="blue">Professionnel</Badge> : <Badge>Particulier</Badge>}{" "}
            {formatPhone(contact.phone)} {contact.email && `· ${contact.email}`}
          </>
        }
        actions={
          <Link href="/admin/exposants" className="text-brand-700 text-sm underline">
            ← Tous les exposants
          </Link>
        }
      />
      {sp.enregistre !== undefined && (
        <div className="mb-4">
          <Alert tone="green">Exposant enregistré.</Alert>
        </div>
      )}
      {sp.erreur === "reservations" && (
        <div className="mb-4">
          <Alert>Cet exposant a des réservations : il ne peut pas être supprimé.</Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,42rem)_1fr]">
        <Card>
          <ContactForm
            id={contact.id}
            initial={{
              lastName: contact.lastName,
              firstName: contact.firstName,
              company: contact.company,
              street: contact.street,
              houseNumber: contact.houseNumber,
              postcode: contact.postcode,
              city: contact.city,
              phone: formatPhone(contact.phone),
              email: contact.email,
              kind: contact.kind,
              vatNumber: contact.vatNumber,
              notes: contact.notes,
            }}
          />
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 font-semibold">Riverain</h2>
            <p className="mb-3 text-sm text-slate-600">
              Emplacements situés devant chez lui/elle : priorité chaque année, à son nom uniquement.
            </p>
            {links.length > 0 && (
              <ul className="mb-3 space-y-1">
                {links.map((l) => (
                  <li key={l.spotId} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      n°{l.label} {l.street && <span className="text-slate-500">— {l.street}</span>}
                    </span>
                    <form action={removeResidentLink.bind(null, contact.id, l.spotId)}>
                      <button className="text-xs text-red-700 underline">Retirer</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {suggestions.length > 0 && (
              <div className="mb-3 space-y-1 rounded-md bg-amber-50 p-2 text-sm">
                <div className="font-medium text-amber-900">Suggestion d’après son adresse :</div>
                {suggestions.map((s) => (
                  <form
                    key={s.id}
                    action={linkResidentSpot.bind(null, contact.id, s.id)}
                    className="flex items-center justify-between"
                  >
                    <span>n°{s.label}</span>
                    <button className="text-brand-700 text-xs underline">Confirmer</button>
                  </form>
                ))}
              </div>
            )}
            <ResidentLinkForm contactId={contact.id} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Historique des réservations</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune réservation enregistrée.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="py-1.5 pr-3 font-medium">
                        {b.status === "historical" ? (
                          b.year
                        ) : (
                          <Link href={`/admin/reservations/${b.id}`} className="text-brand-700 underline">
                            {b.year}
                          </Link>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">n° {b.labels.sort(compareLabels).join(", ") || "—"}</td>
                      <td className="py-1.5 pr-3">{statusLabels[b.status] ?? b.status}</td>
                      <td className="py-1.5">
                        {b.historicalPaid === true && <Badge tone="green">Payé</Badge>}
                        {b.historicalPaid === false && <Badge tone="amber">Non payé</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Supprimer</h2>
            <p className="mb-3 text-sm text-slate-600">
              Possible uniquement si l’exposant n’a aucune réservation.
            </p>
            <form action={deleteContact.bind(null, contact.id)}>
              <ConfirmButton
                variant="danger"
                disabled={history.length > 0}
                message={`Supprimer définitivement ${displayName(contact)} ?`}
              >
                Supprimer cet exposant
              </ConfirmButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
