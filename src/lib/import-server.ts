import "server-only";
import { and, asc, eq, isNull, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingSpots,
  bookings,
  contacts,
  editions,
  importBatches,
  importRows,
  residentLinks,
  spots,
} from "@/db/schema";
import { displayName, normalizeEmail, normalizePhone } from "./contacts";
import { type DuplicateCandidate, loadMatchPool, matchCandidates } from "./contacts-server";
import {
  type GridRow,
  type ImportRowData,
  isEmptyRow,
  parseKind,
  parsePaid,
  parseSpotList,
  type RowIssue,
  STRONG_MATCH_SCORE,
  validateRows,
} from "./import";

export type RowAnalysis = {
  key: string;
  issues: RowIssue[];
  candidates: DuplicateCandidate[];
  /** What "auto" resolves to. */
  resolved: { action: "new" | "existing" | "skip"; contactId: number | null };
};

function toContactLike(d: ImportRowData) {
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    email: d.email,
    phone: d.phone,
    street: d.street,
    houseNumber: d.houseNumber,
    postcode: d.postcode,
  };
}

/** Validates the rows of a batch and finds matching existing contacts. */
export async function analyzeRows(batchId: number, year: number, rows: GridRow[]): Promise<RowAnalysis[]> {
  const live = rows.filter((r) => !isEmptyRow(r.data));
  const [spotRows, pool, taken] = await Promise.all([
    db.select({ label: spots.label }).from(spots),
    loadMatchPool(),
    // Spots already held in that year by bookings from elsewhere (another import, manual entry…).
    db
      .select({
        label: spots.label,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        company: contacts.company,
      })
      .from(bookingSpots)
      .innerJoin(editions, eq(editions.id, bookingSpots.editionId))
      .innerJoin(bookings, eq(bookings.id, bookingSpots.bookingId))
      .innerJoin(contacts, eq(contacts.id, bookings.contactId))
      .innerJoin(spots, eq(spots.id, bookingSpots.spotId))
      .where(
        and(
          eq(editions.year, year),
          eq(bookingSpots.released, false),
          sql`${bookings.importBatchId} is distinct from ${batchId}`,
        ),
      ),
  ]);
  const known = new Set(spotRows.map((s) => s.label.toLowerCase()));
  const takenBy = new Map(taken.map((t) => [t.label.toLowerCase(), displayName(t)]));
  const issues = validateRows(
    live.map((r) => r.data),
    known,
  );

  return live.map((row, i) => {
    const rowIssues = [...issues[i]];
    const clash = parseSpotList(row.data.spots).labels.filter((l) => takenBy.has(l.toLowerCase()));
    for (const l of clash) {
      rowIssues.push({
        level: "error",
        message: `N°${l} déjà attribué en ${year} à ${takenBy.get(l.toLowerCase())}`,
      });
    }
    const candidates = matchCandidates(pool, toContactLike(row.data), undefined, 3);
    let resolved: RowAnalysis["resolved"];
    if (row.action === "skip") resolved = { action: "skip", contactId: null };
    else if (row.action === "new") resolved = { action: "new", contactId: null };
    else if (row.action === "existing" && row.matchContactId) {
      resolved = { action: "existing", contactId: row.matchContactId };
    } else if (candidates[0] && candidates[0].score >= STRONG_MATCH_SCORE) {
      resolved = { action: "existing", contactId: candidates[0].id };
    } else {
      resolved = { action: "new", contactId: null };
    }
    if (resolved.action === "new" && candidates.length) {
      rowIssues.push({
        level: "warning",
        message: "Exposant peut-être déjà connu : vérifiez la correspondance",
      });
    }
    return { key: row.key, issues: resolved.action === "skip" ? [] : rowIssues, candidates, resolved };
  });
}

export async function loadBatchRows(batchId: number): Promise<GridRow[]> {
  const rows = await db
    .select()
    .from(importRows)
    .where(eq(importRows.batchId, batchId))
    .orderBy(asc(importRows.position));
  return rows.map((r) => ({
    key: `r${r.id}`,
    data: r.data as ImportRowData,
    uncertain: r.uncertain,
    photoId: r.photoId,
    action: r.action as GridRow["action"],
    matchContactId: r.matchContactId,
  }));
}

const FILLABLE = [
  "firstName",
  "company",
  "street",
  "houseNumber",
  "postcode",
  "city",
  "phone",
  "email",
] as const;

/** Creates contacts and historical bookings. Returns the number of blocking errors (nothing written if > 0). */
export async function commitBatch(
  batchId: number,
): Promise<{ errors: number; created: number; linked: number }> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch || batch.status !== "draft") throw new Error("Import introuvable ou déjà validé.");
  const rows = await loadBatchRows(batchId);
  const analysis = await analyzeRows(batchId, batch.year, rows);
  const errors = analysis.filter((a) => a.issues.some((i) => i.level === "error")).length;
  if (errors) return { errors, created: 0, linked: 0 };

  const byKey = new Map(rows.map((r) => [r.key, r]));
  let created = 0;
  let linked = 0;
  await db.transaction(async (tx) => {
    await tx.insert(editions).values({ year: batch.year, status: "closed" }).onConflictDoNothing();
    const [edition] = await tx
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.year, batch.year));
    const spotIds = new Map(
      (await tx.select({ id: spots.id, label: spots.label }).from(spots)).map((s) => [
        s.label.toLowerCase(),
        s.id,
      ]),
    );

    for (const [index, a] of analysis.entries()) {
      if (a.resolved.action === "skip") continue;
      const d = byKey.get(a.key)!.data;
      const values = {
        firstName: d.firstName.trim(),
        lastName: d.lastName.trim(),
        company: d.company.trim(),
        street: d.street.trim(),
        houseNumber: d.houseNumber.trim(),
        postcode: d.postcode.trim(),
        city: d.city.trim(),
        phone: normalizePhone(d.phone),
        email: normalizeEmail(d.email),
      };

      let contactId: number;
      if (a.resolved.action === "existing" && a.resolved.contactId) {
        contactId = a.resolved.contactId;
        const [existing] = await tx.select().from(contacts).where(eq(contacts.id, contactId));
        if (!existing) throw new Error("Exposant lié introuvable.");
        // Only complete what is missing; never overwrite what the organiser already has.
        const fill = Object.fromEntries(
          FILLABLE.filter((f) => !existing[f] && values[f]).map((f) => [f, values[f]]),
        );
        if (Object.keys(fill).length) await tx.update(contacts).set(fill).where(eq(contacts.id, contactId));
        linked++;
      } else {
        const [row] = await tx
          .insert(contacts)
          .values({ ...values, kind: parseKind(d.kind), notes: d.notes.trim(), importBatchId: batchId })
          .returning({ id: contacts.id });
        contactId = row.id;
        created++;
      }

      const labels = parseSpotList(d.spots).labels;
      if (!labels.length) continue;
      const [booking] = await tx
        .insert(bookings)
        .values({
          editionId: edition.id,
          contactId,
          status: "historical",
          source: "history",
          reference: `H${batch.year}-${batchId}-${index + 1}`,
          historicalPaid: parsePaid(d.paid),
          notes: d.notes.trim(),
          importBatchId: batchId,
        })
        .returning({ id: bookings.id });
      await tx.insert(bookingSpots).values(
        labels.map((l) => ({
          bookingId: booking.id,
          spotId: spotIds.get(l.toLowerCase())!,
          editionId: edition.id,
        })),
      );
    }
    await tx
      .update(importBatches)
      .set({ status: "committed", committedAt: new Date() })
      .where(eq(importBatches.id, batchId));
  });
  return { errors: 0, created, linked };
}

/** Undoes a committed batch: its bookings, and the contacts it created that nothing else uses. */
export async function rollbackBatch(batchId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(bookings).where(eq(bookings.importBatchId, batchId));
    const unused = and(
      eq(contacts.importBatchId, batchId),
      notExists(
        tx
          .select({ x: sql`1` })
          .from(bookings)
          .where(eq(bookings.contactId, contacts.id)),
      ),
      notExists(
        tx
          .select({ x: sql`1` })
          .from(residentLinks)
          .where(eq(residentLinks.contactId, contacts.id)),
      ),
    );
    await tx.delete(contacts).where(unused);
    // Contacts kept (now linked to something else) simply stop belonging to the batch.
    await tx.update(contacts).set({ importBatchId: null }).where(eq(contacts.importBatchId, batchId));
    await tx
      .update(importBatches)
      .set({ status: "draft", committedAt: null })
      .where(eq(importBatches.id, batchId));
  });
}

export async function saveBatchRows(batchId: number, rows: GridRow[]) {
  const live = rows.filter((r) => !isEmptyRow(r.data));
  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({ status: importBatches.status })
      .from(importBatches)
      .where(and(eq(importBatches.id, batchId), isNull(importBatches.committedAt)));
    if (!batch) throw new Error("Cet import est validé : annulez-le avant de le modifier.");
    await tx.delete(importRows).where(eq(importRows.batchId, batchId));
    if (live.length) {
      await tx.insert(importRows).values(
        live.map((r, position) => ({
          batchId,
          position,
          data: r.data,
          uncertain: r.uncertain,
          photoId: r.photoId,
          action: r.action,
          matchContactId: r.matchContactId,
        })),
      );
    }
  });
}
