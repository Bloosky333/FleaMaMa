import "server-only";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailCampaigns, emailOutbox, emailTemplates } from "@/db/schema";
import { getSettings, setSettings } from "../editions";
import { DEFAULT_TEMPLATES, renderTemplate, type Template, type TemplateKey } from "./templates";
import { isQuotaError } from "./schedule";
import { createMailer, emailConfig } from "./transport";

/** Transactional emails (a confirmation the exhibitor waits for) go before bulk ones. */
export const PRIORITY_TRANSACTIONAL = 0;
export const PRIORITY_BULK = 10;
const MAX_ATTEMPTS = 3;
const PAUSE_AFTER_QUOTA_MS = 2 * 3600 * 1000;

export async function loadTemplate(key: TemplateKey): Promise<Template> {
  const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key));
  return row ? { subject: row.subject, body: row.body } : DEFAULT_TEMPLATES[key];
}

export type OutgoingEmail = {
  to: string;
  template: TemplateKey;
  vars: Record<string, string>;
  contactId?: number | null;
  bookingId?: number | null;
};

/**
 * Renders and queues emails. Returns the campaign id when `campaign` is set. Does nothing when
 * emails are switched off in Paramètres: no email is created at all.
 */
export async function enqueueEmails(
  emails: OutgoingEmail[],
  opts: {
    priority?: number;
    campaign?: { editionId: number | null; template: TemplateKey; createdBy: number };
  } = {},
): Promise<number | null> {
  if (!emails.length || !(await getSettings()).emailEnabled) return null;
  const templates = new Map<TemplateKey, Template>();
  for (const key of new Set(emails.map((e) => e.template))) templates.set(key, await loadTemplate(key));

  return db.transaction(async (tx) => {
    let campaignId: number | null = null;
    if (opts.campaign) {
      const [c] = await tx
        .insert(emailCampaigns)
        .values({
          editionId: opts.campaign.editionId,
          template: opts.campaign.template,
          createdBy: opts.campaign.createdBy,
        })
        .returning({ id: emailCampaigns.id });
      campaignId = c.id;
    }
    await tx.insert(emailOutbox).values(
      emails.map((e) => {
        const { subject, body } = renderTemplate(templates.get(e.template)!, e.vars);
        return {
          campaignId,
          contactId: e.contactId ?? null,
          bookingId: e.bookingId ?? null,
          template: e.template,
          toAddress: e.to,
          subject,
          body,
          priority: opts.priority ?? PRIORITY_BULK,
        };
      }),
    );
    return campaignId;
  });
}

export async function sentInLast24h(): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .where(
      and(eq(emailOutbox.status, "sent"), gt(emailOutbox.sentAt, new Date(Date.now() - 24 * 3600 * 1000))),
    );
  return n;
}

export type ProcessResult = { sent: number; failed: number; skipped?: string };

/**
 * Sends the next batch, respecting the batch size and the rolling 24 h cap (spec §4.7).
 * Called by the scheduled job, by the "send now" button and right after a confirmation.
 */
export async function processOutbox(): Promise<ProcessResult> {
  const settings = await getSettings();
  if (!settings.emailEnabled) return { sent: 0, failed: 0, skipped: "Envoi des emails désactivé" };
  const config = await emailConfig(settings);
  if (config.mode === "none") return { sent: 0, failed: 0, skipped: config.reason.replace(/\.$/, "") };
  if (settings.outboxPausedUntil && new Date(settings.outboxPausedUntil) > new Date()) {
    return { sent: 0, failed: 0, skipped: "En pause" };
  }

  // Messages stuck in "sending" (crash mid-batch) go back to the queue.
  await db
    .update(emailOutbox)
    .set({ status: "queued" })
    .where(
      and(
        eq(emailOutbox.status, "sending"),
        lt(emailOutbox.scheduledAt, new Date(Date.now() - 15 * 60 * 1000)),
      ),
    );

  const quota = Math.min(settings.outboxBatchSize, settings.outboxDailyCap - (await sentInLast24h()));
  if (quota <= 0) return { sent: 0, failed: 0, skipped: "Limite quotidienne atteinte" };

  const claimed = await db.execute<{
    id: number;
    to_address: string;
    subject: string;
    body: string;
    attempts: number;
  }>(sql`
    update email_outbox set status = 'sending', attempts = attempts + 1, scheduled_at = now()
    where id in (
      select id from email_outbox
      where status = 'queued' and scheduled_at <= now()
      order by priority, scheduled_at, id
      limit ${quota}
      for update skip locked
    )
    returning id, to_address, subject, body, attempts`);

  let sent = 0;
  let failed = 0;
  const sendMail = createMailer(config);
  const rows = [...claimed].sort((a, b) => a.id - b.id);
  for (const [i, m] of rows.entries()) {
    try {
      await sendMail({ to: m.to_address, subject: m.subject, text: m.body });
      await db
        .update(emailOutbox)
        .set({ status: "sent", sentAt: new Date(), lastError: null })
        .where(eq(emailOutbox.id, m.id));
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isQuotaError(err)) {
        // Gmail says "not now": give back this message and the rest of the batch, pause, warn.
        const untouched = rows.slice(i).map((r) => r.id);
        await db
          .update(emailOutbox)
          .set({ status: "queued", attempts: sql`greatest(${emailOutbox.attempts} - 1, 0)` })
          .where(inArray(emailOutbox.id, untouched));
        await setSettings({
          outboxPausedUntil: new Date(Date.now() + PAUSE_AFTER_QUOTA_MS).toISOString(),
          outboxPauseReason: `Gmail a refusé l’envoi : ${message}`,
        });
        break;
      }
      const giveUp = m.attempts >= MAX_ATTEMPTS;
      await db
        .update(emailOutbox)
        .set({
          status: giveUp ? "failed" : "queued",
          lastError: message,
          scheduledAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .where(eq(emailOutbox.id, m.id));
      if (giveUp) failed++;
    }
  }

  // Campaigns with nothing left to send are done.
  await db.execute(sql`
    update email_campaigns c set status = 'done'
    where c.status = 'running'
      and not exists (select 1 from email_outbox o where o.campaign_id = c.id and o.status in ('queued', 'sending'))`);

  return { sent, failed };
}

export async function outboxCounts() {
  const rows = await db
    .select({ status: emailOutbox.status, n: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .groupBy(emailOutbox.status);
  const counts = { queued: 0, sending: 0, sent: 0, failed: 0 } as Record<string, number>;
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

export { estimateDelay } from "./schedule";

export async function resumeOutbox() {
  await setSettings({ outboxPausedUntil: null, outboxPauseReason: null });
}

export async function retryFailed() {
  await db
    .update(emailOutbox)
    .set({ status: "queued", attempts: 0, scheduledAt: new Date() })
    .where(eq(emailOutbox.status, "failed"));
}
