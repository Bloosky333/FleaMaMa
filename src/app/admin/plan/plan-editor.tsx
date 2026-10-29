"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { usePlanImage, useElementSize } from "@/components/plan-hooks";
import { Alert, Button, Field, Input } from "@/components/ui";
import { compareLabels, nextLabel, rowLabels, rowShapes, type SpotShape } from "@/lib/spots";
import { createSpots, deleteSpots, type SpotPatch, updatePlanDefaults, updateSpots } from "./actions";
import { DefaultsForm, MultiSpotForm, SingleSpotForm, StreetsDatalist } from "./spot-panel";
import type { EditorPlan, EditorSpot } from "./types";

type Mode = "select" | "place" | "row";
type Point = { x: number; y: number };
type View = { scale: number; x: number; y: number };

const COLORS = {
  fill: "rgba(47,143,107,0.22)",
  stroke: "#1d5e49",
  inactiveFill: "rgba(120,113,108,0.25)",
  inactiveStroke: "#78716c",
  selectedFill: "rgba(37,99,235,0.25)",
  selectedStroke: "#1d4ed8",
  preview: "#d97706",
};

function firstFreeLabel(spots: EditorSpot[]) {
  const labels = spots.map((s) => s.label).sort(compareLabels);
  return nextLabel(labels.at(-1), labels);
}

export default function PlanEditor({
  plan: initialPlan,
  initialSpots,
}: {
  plan: EditorPlan;
  initialSpots: EditorSpot[];
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [spots, setSpots] = useState(initialSpots);
  const [selected, setSelected] = useState<number[]>([]);
  const [mode, setMode] = useState<Mode>("select");
  const [nextLbl, setNextLbl] = useState(() => firstFreeLabel(initialSpots));
  const [lastRotation, setLastRotation] = useState(0);
  const [rowStart, setRowStart] = useState<Point | null>(null);
  const [rowEnd, setRowEnd] = useState<Point | null>(null);
  const [rowCount, setRowCount] = useState("1");
  const [rowStartLabel, setRowStartLabel] = useState("");
  const [pointer, setPointer] = useState<Point | null>(null);
  // null = fit the whole plan on screen.
  const [manualView, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, startTransition] = useTransition();

  const image = usePlanImage(`/api/plan/image?v=${plan.id}`);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<number, Konva.Group>());

  const byId = useMemo(() => new Map(spots.map((s) => [s.id, s])), [spots]);
  const selectedSpots = selected.map((id) => byId.get(id)).filter((s): s is EditorSpot => !!s);
  const streets = useMemo(
    () =>
      Array.from(new Set(spots.map((s) => s.street).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [spots],
  );

  const fitView = useMemo((): View | null => {
    if (!size.width || !size.height) return null;
    const scale = Math.min(size.width / plan.width, size.height / plan.height) * 0.95;
    return { scale, x: (size.width - plan.width * scale) / 2, y: (size.height - plan.height * scale) / 2 };
  }, [size.width, size.height, plan.width, plan.height]);
  const view = manualView ?? fitView;
  const tmpIds = useRef(-1);

  // Attach the transformer to the selected spots.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selected.map((id) => nodeRefs.current.get(id)).filter((n): n is Konva.Group => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selected, spots]);

  const resetRow = useCallback(() => {
    setRowStart(null);
    setRowEnd(null);
  }, []);

  // --- persistence helpers (optimistic, revert on error) -------------------

  function persistPatches(patches: SpotPatch[]) {
    if (!patches.length) return;
    const before = spots;
    setSpots((cur) =>
      cur.map((s) => {
        const p = patches.find((x) => x.id === s.id);
        return p ? ({ ...s, ...p } as EditorSpot) : s;
      }),
    );
    startTransition(async () => {
      const res = await updateSpots(patches);
      if (!res.ok) {
        setError(res.error);
        setSpots(before);
      } else {
        setError(null);
      }
    });
  }

  function addSpots(items: (SpotShape & { label: string })[], after?: (created: EditorSpot[]) => void) {
    const used = new Set(spots.map((s) => s.label.toLowerCase()));
    const clash = items.find((i) => used.has(i.label.toLowerCase()));
    if (clash) return setError(`Le numéro ${clash.label} existe déjà.`);
    const temps: EditorSpot[] = items.map((i) => ({
      ...i,
      id: tmpIds.current--,
      street: "",
      side: "",
      lengthM: null,
      facingAddresses: [],
      notes: "",
      active: true,
    }));
    const tempIds = new Set(temps.map((t) => t.id));
    setSpots((cur) => [...cur, ...temps]);
    startTransition(async () => {
      const res = await createSpots(items);
      if (!res.ok) {
        setError(res.error);
        setSpots((cur) => cur.filter((s) => !tempIds.has(s.id)));
        return;
      }
      setError(null);
      const created = res.data.map((s): EditorSpot => ({
        id: s.id,
        label: s.label,
        street: s.street,
        side: s.side,
        lengthM: s.lengthM,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        rotation: s.rotation,
        facingAddresses: s.facingAddresses,
        notes: s.notes,
        active: s.active,
      }));
      setSpots((cur) => [...cur.filter((s) => !tempIds.has(s.id)), ...created]);
      after?.(created);
    });
  }

  function removeSelected() {
    const ids = selected.filter((id) => id > 0);
    if (!ids.length) return;
    const labels = ids.map((id) => byId.get(id)?.label).join(", ");
    if (!window.confirm(`Supprimer ${ids.length > 1 ? "les emplacements" : "l’emplacement"} ${labels} ?`))
      return;
    const before = spots;
    setSpots((cur) => cur.filter((s) => !ids.includes(s.id)));
    setSelected([]);
    startTransition(async () => {
      const res = await deleteSpots(ids);
      if (!res.ok) {
        setError(res.error);
        setSpots(before);
      }
    });
  }

  // --- keyboard ----------------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "Escape") {
        resetRow();
        setSelected([]);
        setMode("select");
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected.length) {
        e.preventDefault();
        removeSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- stage interactions ----------------------------------------------------

  function imagePointer(): Point | null {
    return stageRef.current?.getRelativePointerPosition() ?? null;
  }

  function onBackgroundClick() {
    const p = imagePointer();
    if (!p) return;
    if (mode === "select") {
      setSelected([]);
    } else if (mode === "place") {
      const label = nextLbl.trim();
      if (!label) return setError("Indiquez le numéro à placer.");
      addSpots(
        [
          {
            label,
            x: p.x,
            y: p.y,
            width: plan.defaultSpotWidth,
            height: plan.defaultSpotHeight,
            rotation: lastRotation,
          },
        ],
        (created) => {
          setSelected(created.map((c) => c.id));
          setNextLbl(nextLabel(label, [...spots.map((s) => s.label), label]));
        },
      );
    } else if (mode === "row") {
      if (!rowStart || rowEnd) {
        setRowStart(p);
        setRowEnd(null);
      } else {
        setRowEnd(p);
        const len = Math.hypot(p.x - rowStart.x, p.y - rowStart.y);
        setRowCount(String(Math.max(1, Math.round(len / plan.defaultSpotWidth))));
        setRowStartLabel(nextLbl);
      }
    }
  }

  function onStageClick(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    const target = e.target;
    if (target === target.getStage() || target.name() === "plan-bg") onBackgroundClick();
  }

  function onSpotClick(e: KonvaEventObject<MouseEvent | TouchEvent>, id: number) {
    e.cancelBubble = true;
    if (mode === "row") return onBackgroundClick();
    const shift = "shiftKey" in e.evt && (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
    setSelected((cur) => (shift ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    if (!view || !pos) return;
    const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15;
    zoomAt(pos, view.scale * factor);
  }

  function zoomAt(pos: Point, newScale: number) {
    if (!view) return;
    const scale = Math.min(Math.max(newScale, 0.05), 20);
    const imgX = (pos.x - view.x) / view.scale;
    const imgY = (pos.y - view.y) / view.scale;
    setView({ scale, x: pos.x - imgX * scale, y: pos.y - imgY * scale });
  }

  function syncNodes(ids: number[], withSize: boolean) {
    const patches: SpotPatch[] = [];
    for (const id of ids) {
      const node = nodeRefs.current.get(id);
      const spot = byId.get(id);
      if (!node || !spot || id < 0) continue;
      const patch: SpotPatch = { id, x: node.x(), y: node.y() };
      if (withSize) {
        patch.width = Math.max(2, spot.width * node.scaleX());
        patch.height = Math.max(2, spot.height * node.scaleY());
        patch.rotation = node.rotation();
        node.scale({ x: 1, y: 1 });
      }
      patches.push(patch);
    }
    if (withSize && patches[0]?.rotation !== undefined) setLastRotation(patches[0].rotation);
    persistPatches(patches);
  }

  function goToLabel(e: React.FormEvent) {
    e.preventDefault();
    const spot = spots.find((s) => s.label.toLowerCase() === search.trim().toLowerCase());
    if (!spot) return setError(`Aucun emplacement n°${search}.`);
    setError(null);
    setSelected([spot.id]);
    setMode("select");
    const scale = Math.max(view?.scale ?? 1, 1.5);
    setView({ scale, x: size.width / 2 - spot.x * scale, y: size.height / 2 - spot.y * scale });
  }

  // --- row preview -----------------------------------------------------------

  const rowEndPoint = rowEnd ?? (mode === "row" && rowStart ? pointer : null);
  const rowN = Math.min(Math.max(parseInt(rowCount, 10) || 1, 1), 200);
  const rowPreview =
    mode === "row" && rowStart && rowEnd ? rowShapes(rowStart, rowEnd, rowN, plan.defaultSpotHeight) : [];

  function createRow() {
    if (!rowStart || !rowEnd) return;
    let labels: string[];
    try {
      labels = rowLabels(rowStartLabel, rowN);
    } catch (err) {
      return setError((err as Error).message);
    }
    const items = rowPreview.map((shape, i) => ({ ...shape, label: labels[i] }));
    addSpots(items, () => {
      resetRow();
      setLastRotation(items[0].rotation);
      const last = labels.at(-1)!;
      setNextLbl(nextLabel(last, [...spots.map((s) => s.label), ...labels]));
    });
  }

  // --- render ----------------------------------------------------------------

  const strokeWidth = 1.5;
  const modeButton = (m: Mode, label: string) => (
    <Button
      type="button"
      variant={mode === m ? "primary" : "secondary"}
      onClick={() => {
        setMode(m);
        resetRow();
        if (m !== "select") setSelected([]);
      }}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <StreetsDatalist streets={streets} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {modeButton("select", "Sélectionner / déplacer")}
          {modeButton("place", "Placer des numéros")}
          {modeButton("row", "Rangée")}
          <span className="mx-1 h-6 w-px bg-slate-300" />
          <Button
            type="button"
            variant="secondary"
            aria-label="Zoom arrière"
            onClick={() => view && zoomAt({ x: size.width / 2, y: size.height / 2 }, view.scale / 1.3)}
          >
            −
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-label="Zoom avant"
            onClick={() => view && zoomAt({ x: size.width / 2, y: size.height / 2 }, view.scale * 1.3)}
          >
            +
          </Button>
          <Button type="button" variant="secondary" onClick={() => setView(null)}>
            Ajuster
          </Button>
          <form onSubmit={goToLabel} className="w-28">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Aller au n°"
              aria-label="Aller au numéro"
            />
          </form>
          {busy && <span className="text-xs text-slate-500">Enregistrement…</span>}
        </div>
        {error && <Alert>{error}</Alert>}
        <div
          ref={containerRef}
          className={`h-[calc(100vh-13rem)] min-h-[420px] overflow-hidden rounded-lg border border-slate-300 bg-slate-200 ${
            mode === "select" ? "cursor-grab" : "cursor-crosshair"
          }`}
        >
          {size.width > 0 && view && (
            <Stage
              ref={stageRef}
              width={size.width}
              height={size.height}
              scaleX={view.scale}
              scaleY={view.scale}
              x={view.x}
              y={view.y}
              draggable
              dragDistance={4}
              onDragEnd={(e) => {
                if (e.target === e.target.getStage()) setView({ ...view, x: e.target.x(), y: e.target.y() });
              }}
              onWheel={onWheel}
              onClick={onStageClick}
              onTap={onStageClick}
              onMouseMove={() => mode === "row" && rowStart && !rowEnd && setPointer(imagePointer())}
            >
              <Layer>
                {image && <KImage image={image} width={plan.width} height={plan.height} name="plan-bg" />}
              </Layer>
              <Layer>
                {spots.map((s) => {
                  const isSel = selected.includes(s.id);
                  const fontSize = Math.max(
                    6,
                    Math.min(s.height * 0.7, (s.width / Math.max(s.label.length, 1)) * 1.5),
                  );
                  return (
                    <Group
                      key={s.id}
                      ref={(node) => {
                        if (node) nodeRefs.current.set(s.id, node);
                        else nodeRefs.current.delete(s.id);
                      }}
                      x={s.x}
                      y={s.y}
                      rotation={s.rotation}
                      draggable={mode === "select"}
                      onClick={(e) => onSpotClick(e, s.id)}
                      onTap={(e) => onSpotClick(e, s.id)}
                      onDragStart={() => !isSel && setSelected([s.id])}
                      onDragEnd={(e) => {
                        e.cancelBubble = true;
                        syncNodes(isSel ? selected : [s.id], false);
                      }}
                      onTransformEnd={() => syncNodes(selected, true)}
                    >
                      <Rect
                        x={-s.width / 2}
                        y={-s.height / 2}
                        width={s.width}
                        height={s.height}
                        fill={isSel ? COLORS.selectedFill : s.active ? COLORS.fill : COLORS.inactiveFill}
                        stroke={
                          isSel ? COLORS.selectedStroke : s.active ? COLORS.stroke : COLORS.inactiveStroke
                        }
                        strokeWidth={strokeWidth}
                        strokeScaleEnabled={false}
                        dash={s.active ? undefined : [4, 3]}
                      />
                      <Text
                        x={-s.width / 2}
                        y={-s.height / 2}
                        width={s.width}
                        height={s.height}
                        text={s.label}
                        align="center"
                        verticalAlign="middle"
                        fontSize={fontSize}
                        fontStyle="bold"
                        fill={isSel ? COLORS.selectedStroke : "#1c1917"}
                        listening={false}
                      />
                    </Group>
                  );
                })}
                {rowPreview.map((shape, i) => (
                  <Group
                    key={`preview-${i}`}
                    x={shape.x}
                    y={shape.y}
                    rotation={shape.rotation}
                    listening={false}
                  >
                    <Rect
                      x={-shape.width / 2}
                      y={-shape.height / 2}
                      width={shape.width}
                      height={shape.height}
                      stroke={COLORS.preview}
                      strokeWidth={strokeWidth}
                      strokeScaleEnabled={false}
                      dash={[6, 4]}
                    />
                  </Group>
                ))}
                {mode === "row" && rowStart && rowEndPoint && (
                  <Line
                    points={[rowStart.x, rowStart.y, rowEndPoint.x, rowEndPoint.y]}
                    stroke={COLORS.preview}
                    strokeWidth={2}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                )}
                {mode === "row" && rowStart && (
                  <Circle
                    x={rowStart.x}
                    y={rowStart.y}
                    radius={4 / view.scale}
                    fill={COLORS.preview}
                    listening={false}
                  />
                )}
                <Transformer
                  ref={trRef}
                  rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                  rotationSnapTolerance={4}
                  keepRatio={false}
                  ignoreStroke
                  flipEnabled={false}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 4 || newBox.height < 4 ? oldBox : newBox)}
                />
              </Layer>
            </Stage>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {spots.length} emplacements · Molette : zoom · Glisser le fond : déplacer la vue · Maj+clic :
          sélection multiple · Suppr : supprimer · Échap : annuler
        </p>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-80">
        {mode === "place" && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Placer des numéros</h3>
            <p className="text-sm text-slate-600">
              Cliquez sur le plan à l’endroit où est écrit le numéro ci-dessous. Le numéro suivant se remplit
              automatiquement.
            </p>
            <Field label="Prochain numéro">
              <Input value={nextLbl} onChange={(e) => setNextLbl(e.target.value)} />
            </Field>
            <p className="text-xs text-slate-500">
              Les emplacements sont créés à la taille par défaut et avec l’orientation du dernier emplacement
              tourné ({Math.round(lastRotation)}°).
            </p>
          </div>
        )}
        {mode === "row" && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Rangée d’emplacements</h3>
            {!rowEnd ? (
              <p className="text-sm text-slate-600">
                {rowStart
                  ? "Cliquez maintenant sur la fin de la rangée."
                  : "Cliquez sur le début de la rangée (le long du trottoir), puis sur sa fin."}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre">
                    <Input
                      value={rowCount}
                      onChange={(e) => setRowCount(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Premier n°">
                    <Input value={rowStartLabel} onChange={(e) => setRowStartLabel(e.target.value)} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={createRow} disabled={busy}>
                    Créer {rowN} emplacements
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRowStart(rowEnd);
                      setRowEnd(rowStart);
                    }}
                  >
                    Inverser le sens
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetRow}>
                    Annuler
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {selectedSpots.length === 1 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Emplacement n°{selectedSpots[0].label}</h3>
            <SingleSpotForm
              key={selectedSpots[0].id}
              spot={selectedSpots[0]}
              plan={plan}
              busy={busy || selectedSpots[0].id < 0}
              onSave={(patch) => persistPatches([patch])}
              onDelete={removeSelected}
              onUseAsDefault={() => {
                const s = selectedSpots[0];
                const v = {
                  defaultSpotWidth: s.width,
                  defaultSpotHeight: s.height,
                  defaultSpotLengthM: plan.defaultSpotLengthM,
                };
                setPlan({ ...plan, ...v });
                startTransition(async () => {
                  const res = await updatePlanDefaults(v);
                  if (!res.ok) setError(res.error);
                });
              }}
            />
          </div>
        )}
        {selectedSpots.length > 1 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <MultiSpotForm
              key={selected.join(",")}
              spots={selectedSpots}
              busy={busy}
              onSave={persistPatches}
              onDelete={removeSelected}
            />
          </div>
        )}
        {selectedSpots.length === 0 && mode === "select" && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <p>
              <strong>Placer des numéros</strong> : le plus rapide si les numéros sont déjà écrits sur le
              plan.
            </p>
            <p>
              <strong>Rangée</strong> : crée d’un coup plusieurs emplacements le long d’une rue.
            </p>
            <p>Cliquez sur un emplacement pour le modifier, le déplacer, le tourner ou le redimensionner.</p>
          </div>
        )}
        {selectedSpots.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <DefaultsForm
              key={`${plan.defaultSpotWidth}-${plan.defaultSpotHeight}-${plan.defaultSpotLengthM}`}
              plan={plan}
              busy={busy}
              onSave={(v) => {
                setPlan({ ...plan, ...v });
                startTransition(async () => {
                  const res = await updatePlanDefaults(v);
                  if (!res.ok) setError(res.error);
                });
              }}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
