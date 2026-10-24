import "server-only";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, type Edition, editions, tariffs, users } from "@/db/schema";
import { tariffGrid, type TariffGrid } from "./pricing";

/** The edition being prepared or run: the latest one that is not closed. */
export async function getCurrentEdition(): Promise<Edition | null> {
  const [edition] = await db
    .select()
    .from(editions)
    .where(ne(editions.status, "closed"))
    .orderBy(desc(editions.year))
    .limit(1);
  return edition ?? null;
}

export async function getPreviousEdition(year: number): Promise<Edition | null> {
  const [edition] = await db
    .select()
    .from(editions)
    .where(lt(editions.year, year))
    .orderBy(desc(editions.year))
    .limit(1);
  return edition ?? null;
}

export async function loadTariffGrid(editionId: number): Promise<TariffGrid> {
  const rows = await db
    .select({
      kind: tariffs.kind,
      earlyBird: tariffs.earlyBird,
      pricePerSpotCents: tariffs.pricePerSpotCents,
    })
    .from(tariffs)
    .where(eq(tariffs.editionId, editionId));
  return tariffGrid(rows);
}

export async function saveTariffGrid(editionId: number, grid: TariffGrid) {
  await db.transaction(async (tx) => {
    await tx.delete(tariffs).where(eq(tariffs.editionId, editionId));
    const rows = (["private", "pro"] as const).flatMap((kind) =>
      ([true, false] as const).flatMap((earlyBird) => {
        const price = grid[kind][earlyBird ? "early" : "normal"];
        return price === null ? [] : [{ editionId, kind, earlyBird, pricePerSpotCents: price }];
      }),
    );
    if (rows.length) await tx.insert(tariffs).values(rows);
  });
}

// --- app settings ------------------------------------------------------------

export type Settings = {
  /** Signature at the bottom of emails. */
  organizerName: string;
  /** Outbox batching (spec §4.7). */
  outboxBatchSize: number;
  outboxDailyCap: number;
  /** ISO date until which sending is paused (after a Gmail error), or null. */
  outboxPausedUntil: string | null;
  outboxPauseReason: string | null;
};

const DEFAULTS: Settings = {
  organizerName: "",
  outboxBatchSize: 20,
  outboxDailyCap: 300,
  outboxPausedUntil: null,
  outboxPauseReason: null,
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings = { ...DEFAULTS, ...stored } as Settings;
  if (!settings.organizerName) {
    const [first] = await db.select({ name: users.name }).from(users).orderBy(users.id).limit(1);
    settings.organizerName = first
      ? `${first.name} – organisation de la brocante`
      : "L’organisation de la brocante";
  }
  return settings;
}

export async function setSettings(values: Partial<Settings>) {
  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }
}

export async function editionByYear(year: number) {
  const [edition] = await db
    .select()
    .from(editions)
    .where(and(eq(editions.year, year)));
  return edition ?? null;
}
