import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { db } from "@/db";
import { editions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getSettings, loadTariffGrid } from "@/lib/editions";
import { emailConfig } from "@/lib/email/transport";
import { createEdition, saveEdition, saveEmailSettings, sendTestEmail } from "./actions";

export const metadata: Metadata = { title: "Paramètres" };

const statusLabels = {
  preparation: "Préparation",
  priority: "Phase des priorités",
  open: "Réservations ouvertes à tous",
  closed: "Terminée",
} as const;

const euros = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export default async function SettingsPage({ searchParams }: PageProps<"/admin/parametres">) {
  await requireUser();
  const sp = await searchParams;
  const all = await db.select().from(editions).orderBy(desc(editions.year));
  const requested = typeof sp.annee === "string" ? Number(sp.annee) : null;
  const edition = all.find((e) => e.year === requested) ?? all.find((e) => e.status !== "closed") ?? null;
  const nextYear = Math.max(new Date().getFullYear(), ...all.map((e) => e.year + 1));
  const [grid, settings] = await Promise.all([edition ? loadTariffGrid(edition.id) : null, getSettings()]);
  const mail = await emailConfig(settings);

  return (
    <>
      <PageHeader title="Paramètres" description="Dates, prix et emails de la brocante." />
      {sp.erreur === "annee" && (
        <div className="mb-4">
          <Alert>Année invalide.</Alert>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,44rem)_1fr]">
        <div className="space-y-6">
          {!edition || edition.status === "closed" ? (
            <Card>
              <h2 className="mb-2 font-semibold">Préparer une nouvelle édition</h2>
              <p className="mb-3 text-sm text-slate-600">
                Les prix et instructions de paiement de la dernière édition sont repris ; vous pourrez les
                modifier.
              </p>
              <form action={createEdition} className="flex items-end gap-2">
                <Field label="Année">
                  <Input name="year" type="number" defaultValue={nextYear} className="w-32" />
                </Field>
                <Button type="submit">Créer l’édition</Button>
              </form>
            </Card>
          ) : null}
          {edition && (
            <Card>
              <h2 className="mb-4 font-semibold">
                Brocante {edition.year} <Badge>{statusLabels[edition.status]}</Badge>
              </h2>
              <ActionForm action={saveEdition.bind(null, edition.id)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date de la brocante">
                    <Input type="date" name="marketDate" defaultValue={edition.marketDate ?? ""} />
                  </Field>
                  <Field label="Étape">
                    <Select name="status" defaultValue={edition.status}>
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Date limite des priorités"
                    hint="Après cette date, les offres non confirmées sont libérées."
                  >
                    <Input
                      type="date"
                      name="priorityDeadline"
                      defaultValue={edition.priorityDeadline ?? ""}
                    />
                  </Field>
                  <Field label="Ouverture des réservations à tous">
                    <Input
                      type="date"
                      name="publicOpeningDate"
                      defaultValue={edition.publicOpeningDate ?? ""}
                    />
                  </Field>
                  <Field
                    label="Tarif réduit jusqu’au"
                    hint="Inclus. Laisser vide s’il n’y a pas de tarif réduit."
                  >
                    <Input
                      type="date"
                      name="earlyBirdDeadline"
                      defaultValue={edition.earlyBirdDeadline ?? ""}
                    />
                  </Field>
                  <Field label="Paiement attendu avant le">
                    <Input type="date" name="paymentDeadline" defaultValue={edition.paymentDeadline ?? ""} />
                  </Field>
                  <Field label="Remboursement possible jusqu’au">
                    <Input type="date" name="refundDeadline" defaultValue={edition.refundDeadline ?? ""} />
                  </Field>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold">Prix par emplacement (€)</h3>
                  <table className="text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="pr-4" />
                        <th className="pr-4 pb-1">Tarif réduit</th>
                        <th className="pb-1">Tarif normal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["private", "pro"] as const).map((kind) => (
                        <tr key={kind}>
                          <td className="py-1 pr-4">
                            {kind === "private" ? "Particulier" : "Professionnel"}
                          </td>
                          <td className="py-1 pr-4">
                            <Input
                              name={`${kind}_early`}
                              defaultValue={euros(grid![kind].early)}
                              inputMode="decimal"
                              className="w-28"
                              aria-label={`Tarif réduit ${kind}`}
                            />
                          </td>
                          <td className="py-1">
                            <Input
                              name={`${kind}_normal`}
                              defaultValue={euros(grid![kind].normal)}
                              inputMode="decimal"
                              className="w-28"
                              aria-label={`Tarif normal ${kind}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Field
                  label="Instructions de paiement"
                  hint="Reprises dans l’email de confirmation, ex. « À payer par virement sur BE.. avec la référence, ou en liquide le jour même. »"
                >
                  <Textarea name="paymentInstructions" rows={3} defaultValue={edition.paymentInstructions} />
                </Field>
                <Field label="IBAN (facultatif)">
                  <Input name="iban" defaultValue={edition.iban ?? ""} />
                </Field>
              </ActionForm>
            </Card>
          )}
          {all.length > 1 && (
            <p className="text-sm text-slate-600">
              Autres éditions :{" "}
              {all
                .filter((e) => e.id !== edition?.id)
                .map((e) => (
                  <Link
                    key={e.id}
                    href={`/admin/parametres?annee=${e.year}`}
                    className="text-brand-700 mr-3 underline"
                  >
                    {e.year}
                  </Link>
                ))}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 font-semibold">Envoi des emails</h2>
            {!settings.emailEnabled ? (
              <Alert tone="amber">
                Emails désactivés : l’application n’en crée aucun et les boutons d’envoi sont masqués.
              </Alert>
            ) : mail.mode === "gmail" ? (
              <Alert tone="green">Emails activés, envoi via Gmail : {mail.user}</Alert>
            ) : mail.mode === "log" ? (
              <Alert tone="amber">Mode test : les emails ne sont pas réellement envoyés.</Alert>
            ) : (
              <Alert tone="amber">{mail.reason} Les emails restent en file d’attente.</Alert>
            )}
            <ActionForm action={saveEmailSettings} className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="emailEnabled" defaultChecked={settings.emailEnabled} />
                Emails activés
              </label>
              <Field
                label="Adresse Gmail"
                hint="Le compte qui envoie les emails ; les réponses des exposants y arrivent."
              >
                <Input name="gmailUser" type="email" autoComplete="off" defaultValue={settings.gmailUser} />
              </Field>
              <Field
                label="Mot de passe d’application"
                hint={
                  settings.gmailUser && settings.gmailAppPasswordSealed
                    ? "Enregistré. Laissez vide pour le garder, ou saisissez-en un nouveau."
                    : "Compte Google → Sécurité → Mots de passe des applications (la validation en 2 étapes doit être activée). 16 lettres."
                }
              >
                <Input
                  name="gmailAppPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    settings.gmailUser && settings.gmailAppPasswordSealed ? "••••••••••••••••" : ""
                  }
                />
              </Field>
              <Field
                label="Nom de l’expéditeur"
                hint="Affiché dans la boîte de réception, ex. « Brocante de Limal »."
              >
                <Input name="emailFromName" defaultValue={settings.emailFromName} />
              </Field>
              <Field label="Signature des emails">
                <Input name="organizerName" defaultValue={settings.organizerName} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Emails par lot" hint="Un lot part toutes les ~10 minutes.">
                  <Input name="outboxBatchSize" type="number" defaultValue={settings.outboxBatchSize} />
                </Field>
                <Field label="Maximum par 24 h" hint="Gmail autorise ± 500 ; gardez de la marge.">
                  <Input name="outboxDailyCap" type="number" defaultValue={settings.outboxDailyCap} />
                </Field>
              </div>
            </ActionForm>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              {settings.emailEnabled && (
                <ActionForm
                  action={sendTestEmail}
                  submitLabel="M’envoyer un email de test"
                  submitVariant="secondary"
                  className="space-y-2"
                />
              )}
              <Link href="/admin/parametres/emails" className="text-brand-700 text-sm underline">
                Modifier les textes des emails
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
