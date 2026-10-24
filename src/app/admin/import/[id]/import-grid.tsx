"use client";

import { type ClipboardEvent, Fragment, type KeyboardEvent } from "react";
import { type GridRow, IMPORT_FIELDS, type ImportField, parsePastedTable } from "@/lib/import";
import type { RowAnalysis } from "@/lib/import-server";

const COLUMNS: { field: ImportField; label: string; width: string; hint?: string }[] = [
  { field: "spots", label: "Empl.", width: "min-w-20", hint: "Ex. 12, 41-43" },
  { field: "lastName", label: "Nom", width: "min-w-36" },
  { field: "firstName", label: "Prénom", width: "min-w-28" },
  { field: "company", label: "Société", width: "min-w-28" },
  { field: "street", label: "Rue", width: "min-w-40" },
  { field: "houseNumber", label: "N°", width: "min-w-14" },
  { field: "postcode", label: "CP", width: "min-w-16" },
  { field: "city", label: "Localité", width: "min-w-28" },
  { field: "phone", label: "Téléphone", width: "min-w-32" },
  { field: "email", label: "Email", width: "min-w-44" },
  { field: "kind", label: "Type", width: "min-w-16", hint: "pro ou vide" },
  { field: "paid", label: "Payé", width: "min-w-14", hint: "oui / non" },
  { field: "notes", label: "Notes", width: "min-w-40" },
];

// Same order as IMPORT_FIELDS so pasted columns land where expected.
const FIELD_ORDER = COLUMNS.map((c) => c.field);
if (FIELD_ORDER.join() !== IMPORT_FIELDS.join())
  throw new Error("Grid columns out of sync with IMPORT_FIELDS");

/** The "Exposant" match column sits right after the first name. */
const MATCH_AFTER = FIELD_ORDER.indexOf("firstName");

export function focusCell(row: number, col: number) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(`[data-cell="${row}-${col}"]`);
    el?.focus();
    el?.select();
  });
}

export function ImportGrid({
  rows,
  analysis,
  readOnly,
  onChange,
  onPasteMatrix,
  onAction,
  onDelete,
  onFocusRow,
  activePhotoId,
}: {
  rows: GridRow[];
  analysis: Map<string, RowAnalysis> | null;
  readOnly: boolean;
  onChange: (rowIndex: number, field: ImportField, value: string) => void;
  onPasteMatrix: (rowIndex: number, colIndex: number, matrix: string[][]) => void;
  onAction: (rowIndex: number, value: string) => void;
  onDelete: (rowIndex: number) => void;
  onFocusRow: (rowIndex: number) => void;
  activePhotoId: number | null;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(row + 1, col);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(0, row - 1), col);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>, row: number, col: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\n$/, ""))) return; // a single value: normal paste
    e.preventDefault();
    onPasteMatrix(row, col, parsePastedTable(text));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-stone-50 text-left text-xs text-stone-500">
          <tr>
            <th className="w-8 border-b border-stone-200 px-2 py-2">#</th>
            <th className="w-6 border-b border-stone-200" aria-label="Vérification" />
            {COLUMNS.map((c, col) => (
              <Fragment key={c.field}>
                <th className={`border-b border-stone-200 px-1.5 py-2 ${c.width}`} title={c.hint}>
                  {c.label}
                </th>
                {col === MATCH_AFTER && (
                  <th className="min-w-52 border-b border-stone-200 px-1.5 py-2">Exposant</th>
                )}
              </Fragment>
            ))}
            <th className="w-8 border-b border-stone-200" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const a = analysis?.get(row.key);
            const errors = a?.issues.filter((i) => i.level === "error") ?? [];
            const warnings = a?.issues.filter((i) => i.level === "warning") ?? [];
            const isTrailing = r === rows.length - 1;
            const fromActivePhoto = activePhotoId !== null && row.photoId === activePhotoId;
            return (
              <tr
                key={row.key}
                className={`border-b border-stone-100 ${row.action === "skip" ? "opacity-50" : ""} ${
                  fromActivePhoto ? "bg-blue-50/60" : ""
                }`}
                onFocus={() => onFocusRow(r)}
              >
                <td className="px-2 text-xs whitespace-nowrap text-stone-400">
                  {isTrailing ? "+" : r + 1}
                  {row.photoId !== null && <span title="Ligne lue sur une photo"> 📷</span>}
                </td>
                <td className="text-center text-xs" title={a?.issues.map((i) => i.message).join("\n")}>
                  {!isTrailing &&
                    a &&
                    (errors.length > 0 ? (
                      <span className="text-red-700">⛔</span>
                    ) : warnings.length > 0 ? (
                      <span className="text-amber-600">⚠</span>
                    ) : row.action === "skip" ? (
                      <span className="text-stone-400">–</span>
                    ) : (
                      <span className="text-green-700">✓</span>
                    ))}
                </td>
                {COLUMNS.map((c, col) => (
                  <Fragment key={c.field}>
                    <td className="p-0">
                      <input
                        data-cell={`${r}-${col}`}
                        value={row.data[c.field]}
                        readOnly={readOnly}
                        onChange={(e) => onChange(r, c.field, e.target.value)}
                        onKeyDown={(e) => onKeyDown(e, r, col)}
                        onPaste={(e) => onPaste(e, r, col)}
                        placeholder={isTrailing && col === 0 && !readOnly ? "…" : undefined}
                        aria-label={`${c.label} ligne ${r + 1}`}
                        className={`focus:ring-brand-500 w-full border-0 bg-transparent px-1.5 py-1.5 outline-none focus:bg-white focus:ring-2 ${
                          row.uncertain.includes(c.field) ? "bg-amber-100" : ""
                        }`}
                      />
                    </td>
                    {col === MATCH_AFTER && (
                      <td className="px-1.5">
                        {!isTrailing && (
                          <MatchSelect
                            row={row}
                            analysis={a}
                            disabled={readOnly}
                            onChange={(v) => onAction(r, v)}
                          />
                        )}
                      </td>
                    )}
                  </Fragment>
                ))}
                <td className="px-1">
                  {!isTrailing && !readOnly && (
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      className="text-stone-400 hover:text-red-700"
                      aria-label={`Supprimer la ligne ${r + 1}`}
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchSelect({
  row,
  analysis,
  disabled,
  onChange,
}: {
  row: GridRow;
  analysis: RowAnalysis | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (!analysis) return <span className="text-xs text-stone-400">…</span>;
  const value =
    row.action === "skip"
      ? "skip"
      : analysis.resolved.action === "existing"
        ? `c${analysis.resolved.contactId}`
        : "new";
  const known = new Set(analysis.candidates.map((c) => `c${c.id}`));
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-stone-200 bg-white px-1 py-1 text-xs"
    >
      <option value="new">Nouvel exposant</option>
      {analysis.candidates.map((c) => (
        <option key={c.id} value={`c${c.id}`}>
          = {c.name}
          {c.city && ` (${c.city})`} — {c.reason}
        </option>
      ))}
      {value.startsWith("c") && !known.has(value) && (
        <option value={value}>= exposant n°{value.slice(1)}</option>
      )}
      <option value="skip">Ignorer la ligne</option>
    </select>
  );
}
