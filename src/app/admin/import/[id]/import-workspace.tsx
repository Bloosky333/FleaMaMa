"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { emptyRowData, type GridRow, IMPORT_FIELDS, type ImportField, isEmptyRow } from "@/lib/import";
import type { RowAnalysis } from "@/lib/import-server";
import {
  analyzeImport,
  commitImport,
  deleteImportPhoto,
  extractImportPhoto,
  saveImportRows,
  uploadImportPhoto,
} from "../actions";
import { focusCell, ImportGrid } from "./import-grid";

export type PhotoInfo = { id: number; status: string; error: string | null };

let keySeq = 0;
const newKey = () => `n${Date.now().toString(36)}${keySeq++}`;
const blankRow = (): GridRow => ({
  key: newKey(),
  data: emptyRowData(),
  uncertain: [],
  photoId: null,
  action: "auto",
  matchContactId: null,
});

/** The grid always ends with one empty line to type into. */
function withTrailingRow(rows: GridRow[]): GridRow[] {
  const kept = rows.filter((r, i) => i === rows.length - 1 || !isEmptyRow(r.data) || r.photoId !== null);
  const last = kept.at(-1);
  return last && isEmptyRow(last.data) ? kept : [...kept, blankRow()];
}

/** Shrinks a phone photo before upload: enough resolution to read, small enough to send. */
async function resizePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85),
  );
}

type SaveState = "saved" | "dirty" | "saving" | "error";

export function ImportWorkspace({
  batchId,
  year,
  initialRows,
  initialPhotos,
  aiEnabled,
}: {
  batchId: number;
  year: number;
  initialRows: GridRow[];
  initialPhotos: PhotoInfo[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() => withTrailingRow(initialRows));
  const [analysis, setAnalysis] = useState<Map<string, RowAnalysis> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [photos, setPhotos] = useState(initialPhotos);
  const [activePhoto, setActivePhoto] = useState<number | null>(null);
  const [busyPhotos, setBusyPhotos] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(false);
  const [message, setMessage] = useState<{ tone: "red" | "green" | "amber"; text: string } | null>(null);
  const [committing, startCommit] = useTransition();

  const pending = useRef<GridRow[] | null>(null);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(rows);

  const runAnalysis = useCallback(
    async (current: GridRow[]) => {
      const res = await analyzeImport(batchId, current);
      if (res.ok) setAnalysis(new Map(res.data.map((a) => [a.key, a])));
    },
    [batchId],
  );

  // Saves are serialized: while one runs, the newest state waits and goes next.
  const flush = useCallback(async () => {
    if (saving.current) return;
    while (pending.current) {
      const toSave = pending.current;
      pending.current = null;
      saving.current = true;
      setSaveState("saving");
      const res = await saveImportRows(batchId, toSave);
      saving.current = false;
      if (!res.ok) {
        setSaveState("error");
        setMessage({ tone: "red", text: res.error });
        return;
      }
    }
    setSaveState("saved");
    await runAnalysis(latest.current);
  }, [batchId, runAnalysis]);

  const changeRows = useCallback(
    (fn: (rows: GridRow[]) => GridRow[]) => {
      const next = withTrailingRow(fn(latest.current));
      latest.current = next;
      pending.current = next;
      setRows(next);
      setSaveState("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  // First analysis of the saved rows.
  useEffect(() => {
    let cancelled = false;
    analyzeImport(batchId, latest.current).then((res) => {
      if (!cancelled && res.ok) setAnalysis(new Map(res.data.map((a) => [a.key, a])));
    });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || saving.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // --- grid edits -------------------------------------------------------------

  const updateCell = (r: number, field: ImportField, value: string) =>
    changeRows((cur) =>
      cur.map((row, i) =>
        i === r
          ? {
              ...row,
              data: { ...row.data, [field]: value },
              uncertain: row.uncertain.filter((f) => f !== field),
            }
          : row,
      ),
    );

  const pasteMatrix = (r: number, c: number, matrix: string[][]) =>
    changeRows((cur) => {
      const next = [...cur];
      matrix.forEach((cells, i) => {
        const base = next[r + i] ?? blankRow();
        const data = { ...base.data };
        cells.forEach((value, j) => {
          const field = IMPORT_FIELDS[c + j];
          if (field) data[field] = value;
        });
        next[r + i] = { ...base, data };
      });
      return next;
    });

  const setAction = (r: number, value: string) =>
    changeRows((cur) =>
      cur.map((row, i) => {
        if (i !== r) return row;
        if (value === "skip") return { ...row, action: "skip", matchContactId: null };
        if (value === "new") return { ...row, action: "new", matchContactId: null };
        return { ...row, action: "existing", matchContactId: Number(value.slice(1)) };
      }),
    );

  const deleteRow = (r: number) => changeRows((cur) => cur.filter((_, i) => i !== r));

  // --- photos -----------------------------------------------------------------

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.set("photo", new File([await resizePhoto(file)], "photo.jpg", { type: "image/jpeg" }));
        const res = await uploadImportPhoto(batchId, fd);
        if (!res.ok) {
          setMessage({ tone: "red", text: res.error });
          continue;
        }
        setPhotos((p) => [...p, { id: res.data.id, status: "pending", error: null }]);
        setActivePhoto(res.data.id);
      } catch {
        setMessage({ tone: "red", text: `Impossible de lire le fichier ${file.name}.` });
      }
    }
  }

  async function extract(photoId: number) {
    const hasRows = latest.current.some((r) => r.photoId === photoId);
    if (hasRows && !window.confirm("Relire cette photo remplacera les lignes déjà lues dessus. Continuer ?"))
      return;
    setBusyPhotos((s) => new Set(s).add(photoId));
    setActivePhoto(photoId);
    const res = await extractImportPhoto(photoId);
    setBusyPhotos((s) => {
      const n = new Set(s);
      n.delete(photoId);
      return n;
    });
    if (!res.ok) {
      setPhotos((p) => p.map((x) => (x.id === photoId ? { ...x, status: "failed", error: res.error } : x)));
      setMessage({ tone: "red", text: res.error });
      return;
    }
    setPhotos((p) => p.map((x) => (x.id === photoId ? { ...x, status: "extracted", error: null } : x)));
    const read: GridRow[] = res.data.rows.map(({ uncertain, ...data }) => ({
      key: newKey(),
      data: { ...emptyRowData(), ...data },
      uncertain,
      photoId,
      action: "auto",
      matchContactId: null,
    }));
    changeRows((cur) => {
      const kept = cur.filter((r) => r.photoId !== photoId && !isEmptyRow(r.data));
      return [...kept, ...read];
    });
    const uncertain = read.filter((r) => r.uncertain.length).length;
    setMessage({
      tone: "green",
      text:
        `${read.length} ligne(s) lue(s) sur la photo.` +
        (uncertain ? ` ${uncertain} ligne(s) ont des cases en jaune à vérifier.` : "") +
        (res.data.comment ? ` Remarque : ${res.data.comment}` : ""),
    });
  }

  async function extractAll() {
    for (const p of photos.filter((p) => p.status !== "extracted")) await extract(p.id);
  }

  async function removePhoto(photoId: number) {
    if (!window.confirm("Supprimer cette photo ? Les lignes déjà lues restent dans le tableau.")) return;
    const res = await deleteImportPhoto(photoId);
    if (!res.ok) return setMessage({ tone: "red", text: res.error });
    setPhotos((p) => p.filter((x) => x.id !== photoId));
    if (activePhoto === photoId) setActivePhoto(null);
    changeRows((cur) => cur.map((r) => (r.photoId === photoId ? { ...r, photoId: null } : r)));
  }

  // --- commit -----------------------------------------------------------------

  const stats = useMemo(() => {
    const live = rows.filter((r) => !isEmptyRow(r.data));
    let errors = 0;
    let warnings = 0;
    let existing = 0;
    for (const r of live) {
      const a = analysis?.get(r.key);
      if (!a) continue;
      if (a.issues.some((i) => i.level === "error")) errors++;
      else if (a.issues.length) warnings++;
      if (a.resolved.action === "existing") existing++;
    }
    return { total: live.length, errors, warnings, existing };
  }, [rows, analysis]);

  const problems = useMemo(
    () =>
      rows.flatMap((r, index) => {
        const a = analysis?.get(r.key);
        if (!a?.issues.length) return [];
        return [
          {
            key: r.key,
            index,
            error: a.issues.some((i) => i.level === "error"),
            messages: a.issues.map((i) => i.message),
          },
        ];
      }),
    [rows, analysis],
  );

  function commit() {
    if (
      !window.confirm(
        `Valider l’import de ${stats.total} ligne(s) pour ${year} ? Les exposants et leurs emplacements ${year} seront créés.`,
      )
    )
      return;
    clearTimeout(timer.current);
    pending.current = null;
    startCommit(async () => {
      const res = await commitImport(batchId, latest.current);
      if (!res.ok) {
        setMessage({ tone: "red", text: res.error });
        await runAnalysis(latest.current);
        return;
      }
      router.refresh();
    });
  }

  const activePhotoInfo = photos.find((p) => p.id === activePhoto);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Photos de l’ancien logiciel</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-medium ring-1 ring-stone-300 hover:bg-stone-100">
              Ajouter des photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            {aiEnabled && photos.some((p) => p.status !== "extracted") && (
              <Button type="button" onClick={extractAll} disabled={busyPhotos.size > 0}>
                Lire les photos non lues
              </Button>
            )}
          </div>
        </div>
        {!aiEnabled && (
          <Alert tone="amber">
            La lecture automatique des photos n’est pas activée (clé ANTHROPIC_API_KEY). Vous pouvez quand
            même ajouter les photos et recopier les lignes à côté, ou coller un tableau Excel.
          </Alert>
        )}
        {photos.length === 0 ? (
          <p className="text-sm text-stone-600">
            Photographiez l’écran de FileMaker en mode liste (± 20 lignes par photo, bien droit, sans reflet).
            Les photos sont lues par une IA (Claude, Anthropic) puis vous vérifiez chaque ligne avant de
            valider.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <li
                key={p.id}
                className={`w-36 rounded-md border p-1.5 text-xs ${
                  activePhoto === p.id ? "border-blue-500 ring-2 ring-blue-200" : "border-stone-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActivePhoto(activePhoto === p.id ? null : p.id)}
                  className="block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
                  <img
                    src={`/api/import/photo/${p.id}`}
                    alt={`Photo ${i + 1}`}
                    className="h-20 w-full rounded object-cover"
                  />
                </button>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span>
                    {busyPhotos.has(p.id)
                      ? "Lecture…"
                      : p.status === "extracted"
                        ? "✓ Lue"
                        : p.status === "failed"
                          ? "⚠ Échec"
                          : "Non lue"}
                  </span>
                  <span className="flex gap-1.5">
                    {aiEnabled && (
                      <button
                        type="button"
                        className="text-brand-700 underline disabled:text-stone-400"
                        disabled={busyPhotos.has(p.id)}
                        onClick={() => extract(p.id)}
                      >
                        {p.status === "extracted" ? "Relire" : "Lire"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-red-700"
                      onClick={() => removePhoto(p.id)}
                      aria-label="Supprimer la photo"
                    >
                      ×
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className={activePhotoInfo ? "grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}>
        {activePhotoInfo && (
          <div className="xl:sticky xl:top-4 xl:self-start">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">Photo {photos.indexOf(activePhotoInfo) + 1}</span>
              <span className="flex gap-3">
                <button type="button" className="text-brand-700 underline" onClick={() => setZoom((z) => !z)}>
                  {zoom ? "Ajuster" : "Agrandir"}
                </button>
                <button
                  type="button"
                  className="text-stone-500 underline"
                  onClick={() => setActivePhoto(null)}
                >
                  Fermer
                </button>
              </span>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-lg border border-stone-200 bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
              <img
                src={`/api/import/photo/${activePhotoInfo.id}`}
                alt="Photo sélectionnée"
                className={zoom ? "max-w-none" : "w-full"}
                style={zoom ? { width: "200%" } : undefined}
              />
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Les lignes lues sur cette photo sont surlignées en bleu.
            </p>
          </div>
        )}
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-stone-500">
            Tapez directement dans le tableau (Entrée : ligne suivante) ou collez des lignes copiées depuis
            Excel. Les cases jaunes sont celles que l’IA a eu du mal à lire. Tout est enregistré
            automatiquement.
          </p>
          <ImportGrid
            rows={rows}
            analysis={analysis}
            readOnly={committing}
            onChange={updateCell}
            onPasteMatrix={pasteMatrix}
            onAction={setAction}
            onDelete={deleteRow}
            onFocusRow={(r) => {
              const photoId = rows[r]?.photoId;
              if (photoId !== null && photoId !== undefined) setActivePhoto(photoId);
            }}
            activePhotoId={activePhoto}
          />
          {problems.length > 0 && (
            <ul className="space-y-0.5 rounded-lg border border-stone-200 bg-white p-3 text-sm">
              {problems.slice(0, 50).map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => focusCell(p.index, 0)}
                  >
                    <span className={p.error ? "text-red-700" : "text-amber-700"}>
                      {p.error ? "⛔" : "⚠"} Ligne {p.index + 1}
                    </span>{" "}
                    : {p.messages.join(" · ")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            <strong>{stats.total}</strong> ligne(s)
          </span>
          <span className={stats.errors ? "text-red-700" : "text-stone-500"}>{stats.errors} à corriger</span>
          <span className={stats.warnings ? "text-amber-700" : "text-stone-500"}>
            {stats.warnings} à vérifier
          </span>
          <span className="text-stone-500">{stats.existing} exposant(s) déjà connu(s)</span>
          <span className="text-xs text-stone-400">
            {saveState === "saving"
              ? "Enregistrement…"
              : saveState === "dirty"
                ? "Modifications non enregistrées"
                : saveState === "error"
                  ? "Erreur d’enregistrement"
                  : "Enregistré"}
          </span>
        </div>
        <Button
          type="button"
          onClick={commit}
          disabled={committing || stats.total === 0 || stats.errors > 0 || !analysis}
        >
          {committing ? "Validation…" : `Valider l’import ${year}`}
        </Button>
      </div>
    </div>
  );
}
