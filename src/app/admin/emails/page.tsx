import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { emailCampaigns, emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/editions";
import { estimateDelay, outboxCounts, sentInLast24h } from "@/lib/email/outbox";
import { TEMPLATE_INFO, type TemplateKey } from "@/lib/email/templates";
import { emailConfig } from "@/lib/email/transport";
import { resumeSending, retryFailedEmails, sendBatchNow } from "./actions";

export const metadata: Metadata = { title: "Emails" };

const statusLabel: Record<string, string> = {
  queued: "En file",
  sending: "Envoi…",
  sent: "Envoyé",
  failed: "Échec",
};

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  await requireUser();
  const sp = await searchParams;
  const [counts, sentToday, settings, campaigns, recent] = await Promise.all([
    outboxCounts(),
    sentInLast24h(),
    getSettings(),
    db
      .select({
        id: emailCampaigns.id,
        template: emailCampaigns.template,
        status: emailCampaigns.status,
        createdAt: emailCampaigns.createdAt,
        total: sql<number>`count(${emailOutbox.id})::int`,
        sent: sql<number>`count(*) filter (where ${emailOutbox.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${emailOutbox.status} = 'failed')::int`,
      })
      .from(emailCampaigns)
      .leftJoin(emailOutbox, eq(emailOutbox.campaignId, emailCampaigns.id))
      .groupBy(emailCampaigns.id)
      .orderBy(desc(emailCampaigns.id))
      .limit(20),
    db
      .select({
        id: emailOutbox.id,
        to: emailOutbox.toAddress,
        subject: emailOutbox.subject,
        status: emailOutbox.status,
        sentAt: emailOutbox.sentAt,
        lastError: emailOutbox.lastError,
        createdAt: emailOutbox.createdAt,
      })
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.id))
      .limit(50),
  ]);
  const mail = await emailConfig(settings);
  const enabled = settings.emailEnabled;
  const paused = settings.outboxPausedUntil && new Date(settings.outboxPausedUntil) > new Date();
  const eta = estimateDelay(counts.queued, sentToday, settings.outboxBatchSize, settings.outboxDailyCap);

  return (
    <>
      <PageHeader
        title="Emails"
        description={`Envoi par lots de ${settings.outboxBatchSize}, au maximum ${settings.outboxDailyCap} par 24 h, pour rester sous les limites de Gmail.`}
        actions={
          enabled && (
            <form action={sendBatchNow}>
              <Button type="submit" disabled={counts.queued === 0}>
                Envoyer un lot maintenant
              </Button>
            </form>
          )
        }
      />
      <div className="mb-4 space-y-2">
        {typeof sp.info === "string" && <Alert tone="green">{sp.info}</Alert>}
        {!enabled && (
          <Alert tone="amber">
            Les emails sont désactivés (
            <Link href="/admin/parametres" className="underline">
              Paramètres
            </Link>
            ) : aucun nouvel email n’est créé ni envoyé.
          </Alert>
        )}
        {enabled && mail.mode === "none" && (
          <Alert tone="amber">{mail.reason} Les emails attendent dans la file.</Alert>
        )}
        {enabled && mail.mode === "log" && (
          <Alert tone="amber">Mode test : les emails sont marqués envoyés sans partir.</Alert>
        )}
        {paused && (
          <Alert tone="red">
            Envoi en pause jusqu’à{" "}
            {new Date(settings.outboxPausedUntil!).toLocaleTimeString("fr-BE", {
              timeZone: "Europe/Brussels",
              hour: "2-digit",
              minute: "2-digit",
            })}
            . {settings.outboxPauseReason}
            <form action={resumeSending} className="mt-2">
              <Button type="submit" variant="secondary">
                Reprendre maintenant
              </Button>
            </form>
          </Alert>
        )}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <div className="text-sm text-stone-500">En file</div>
          <div className="text-3xl font-semibold">{counts.queued + counts.sending}</div>
          <div className="text-xs text-stone-500">{eta}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">Envoyés (24 h)</div>
          <div className="text-3xl font-semibold">{sentToday}</div>
          <div className="text-xs text-stone-500">sur {settings.outboxDailyCap} max</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">Envoyés au total</div>
          <div className="text-3xl font-semibold">{counts.sent}</div>
        </Card>
        <Card>
          <div className="text-sm text-stone-500">En échec</div>
          <div className="text-3xl font-semibold">{counts.failed}</div>
          {enabled && counts.failed > 0 && (
            <form action={retryFailedEmails}>
              <button className="text-brand-700 text-xs underline">Réessayer</button>
            </form>
          )}
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Envois groupés</h2>
          {campaigns.length === 0 ? (
            <p className="text-sm text-stone-500">Aucun envoi groupé.</p>
          ) : (
            <ul className="space-y-3">
              {campaigns.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {TEMPLATE_INFO[c.template as TemplateKey]?.label ?? c.template}
                    </span>
                    <span className="text-stone-500">{c.createdAt.toLocaleDateString("fr-BE")}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-stone-100">
                    <div
                      className="bg-brand-500 h-2"
                      style={{ width: `${c.total ? (100 * c.sent) / c.total : 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-stone-500">
                    {c.sent} / {c.total} envoyés{c.failed ? `, ${c.failed} en échec` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-x-auto">
          <h2 className="mb-3 font-semibold">Derniers emails</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {recent.map((m) => (
                <tr key={m.id}>
                  <td className="py-1.5 pr-3">{m.to}</td>
                  <td className="py-1.5 pr-3 text-stone-600">{m.subject}</td>
                  <td className="py-1.5 text-xs whitespace-nowrap" title={m.lastError ?? undefined}>
                    <span
                      className={
                        m.status === "failed"
                          ? "text-red-700"
                          : m.status === "sent"
                            ? "text-green-700"
                            : "text-amber-700"
                      }
                    >
                      {statusLabel[m.status] ?? m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
