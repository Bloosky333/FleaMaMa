/** Pure helpers for the history import ("reprise de l'historique"). */

import { normalizeText } from "./contacts";

export const IMPORT_FIELDS = [
  "spots",
  "lastName",
  "firstName",
  "company",
  "street",
  "houseNumber",
  "postcode",
  "city",
  "phone",
  "email",
  "kind",
  "paid",
  "notes",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportRowData = Record<ImportField, string>;

export const emptyRowData = (): ImportRowData =>
  Object.fromEntries(IMPORT_FIELDS.map((f) => [f, ""])) as ImportRowData;

export function isEmptyRow(d: Partial<ImportRowData>): boolean {
  return IMPORT_FIELDS.every((f) => !(d[f] ?? "").trim());
}

/**
 * "41-43, 45bis; 50" → ["41", "42", "43", "45bis", "50"].
 * Ranges only between plain numbers, at most 20 spots per range.
 */
export function parseSpotList(input: string): { labels: string[]; error?: string } {
  const labels: string[] = [];
  const compact = input.replace(/(\d)\s*(?:-|–|à)\s*(\d)/gi, "$1-$2");
  for (const part of compact.split(/(?:[,;/+&\s]|\bet\b)+/i).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from || to - from >= 20) return { labels, error: `Plage invalide : ${part}` };
      for (let n = from; n <= to; n++) labels.push(String(n));
    } else if (/^[a-z0-9]+$/i.test(part)) {
      labels.push(part);
    } else {
      return { labels, error: `Numéro illisible : ${part}` };
    }
  }
  return { labels: Array.from(new Set(labels)) };
}

/** Interprets what was typed in the "payé" column. */
export function parsePaid(input: string): boolean | null {
  const v = normalizeText(input);
  if (!v) return null;
  if (["oui", "o", "x", "y", "yes", "1", "ok", "paye", "payee", "v", "p"].includes(v)) return true;
  if (["non", "n", "no", "0", "pas paye", "impaye"].includes(v)) return false;
  return null;
}

/** Interprets the "type" column: anything that looks like "pro" is a professional. */
export function parseKind(input: string): "private" | "pro" {
  const v = normalizeText(input);
  return ["pro", "p", "professionnel", "professionnelle", "commercant", "marchand"].includes(v)
    ? "pro"
    : "private";
}

/**
 * Splits text pasted from Excel / Google Sheets / a CSV into cells.
 * Tabs win; otherwise semicolons (European CSV), otherwise one column.
 */
export function parsePastedTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const sep = text.includes("\t") ? "\t" : text.includes(";") ? ";" : null;
  return lines.map((line) => (sep ? line.split(sep) : [line]).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
}

export type RowIssue = { level: "error" | "warning"; message: string };

/**
 * Problems that block (errors) or deserve a look (warnings) before committing.
 * `knownSpots` are lower-cased existing labels; `rows` are the non-empty rows of the batch.
 */
export function validateRows(rows: ImportRowData[], knownSpots: Set<string>): RowIssue[][] {
  const owners = new Map<string, number[]>();
  const parsed = rows.map((r, i) => {
    const res = parseSpotList(r.spots);
    for (const l of res.labels) {
      const key = l.toLowerCase();
      owners.set(key, [...(owners.get(key) ?? []), i]);
    }
    return res;
  });
  return rows.map((r, i) => {
    const issues: RowIssue[] = [];
    if (!r.lastName.trim() && !r.company.trim()) issues.push({ level: "error", message: "Nom manquant" });
    const { labels, error } = parsed[i];
    if (error) issues.push({ level: "error", message: error });
    const unknown = labels.filter((l) => !knownSpots.has(l.toLowerCase()));
    if (unknown.length) {
      issues.push({ level: "error", message: `Emplacement inconnu : ${unknown.join(", ")}` });
    }
    const shared = labels.filter((l) => (owners.get(l.toLowerCase())?.length ?? 0) > 1);
    if (shared.length) {
      issues.push({ level: "error", message: `Emplacement en double dans l’import : ${shared.join(", ")}` });
    }
    if (!labels.length && !error) issues.push({ level: "warning", message: "Aucun emplacement" });
    if (r.paid.trim() && parsePaid(r.paid) === null) {
      issues.push({ level: "warning", message: `« ${r.paid} » : payé ? (oui/non)` });
    }
    return issues;
  });
}

export type RowAction = "auto" | "new" | "existing" | "skip";

/** A line of the review grid as exchanged between the browser and the server. */
export type GridRow = {
  key: string;
  data: ImportRowData;
  uncertain: string[];
  photoId: number | null;
  action: RowAction;
  matchContactId: number | null;
};

/** A duplicate this strong (same email or phone, or name + address) is linked automatically. */
export const STRONG_MATCH_SCORE = 3;
