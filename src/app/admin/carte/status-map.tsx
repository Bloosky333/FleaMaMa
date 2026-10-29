"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Group, Image as KImage, Layer, Rect, Stage, Text } from "react-konva";
import { fitView, useElementSize, usePlanImage, type View, zoomView } from "@/components/plan-hooks";
import { Alert, Button, Input } from "@/components/ui";
import { formatPhone, normalizeText } from "@/lib/contacts";
import type { MapSpot, MapStatus } from "@/lib/map-server";
import { paymentStateLabels } from "@/lib/payments";
import { formatEuros } from "@/lib/pricing";
import { compareLabels, joinLabels } from "@/lib/spots";
import { assignSpots, quickPay, searchContacts } from "../reservations/actions";

const STYLE: Record<
  MapStatus,
  { fill: string; stroke: string; text: string; dash?: number[]; width?: number }
> = {
  free: { fill: "rgba(34,197,94,0.35)", stroke: "#15803d", text: "#14532d" },
  priority: { fill: "rgba(34,197,94,0.35)", stroke: "#2563eb", text: "#14532d", dash: [5, 3], width: 2 },
  conflict: { fill: "rgba(239,68,68,0.25)", stroke: "#dc2626", text: "#7f1d1d", width: 3 },
  offered: { fill: "rgba(147,197,253,0.7)", stroke: "#2563eb", text: "#1e3a8a" },
  booked: { fill: "rgba(251,146,60,0.7)", stroke: "#c2410c", text: "#431407" },
  paid: { fill: "rgba(29,78,216,0.85)", stroke: "#1e3a8a", text: "#ffffff" },
  inactive: { fill: "rgba(120,113,108,0.25)", stroke: "#78716c", text: "#44403c", dash: [4, 3] },
};

const LEGEND: { status: MapStatus; label: string }[] = [
  { status: "free", label: "Libre" },
  { status: "priority", label: "Priorité à préparer" },
  { status: "conflict", label: "Conflit de priorité" },
  { status: "offered", label: "Offre en attente" },
  { status: "booked", label: "Réservé, non payé" },
  { status: "paid", label: "Réservé et payé" },
  { status: "inactive", label: "Inactif" },
];

const statusText: Record<MapStatus, string> = Object.fromEntries(
  LEGEND.map((l) => [l.status, l.label]),
) as Record<MapStatus, string>;

function describe(s: MapSpot, previousYear: number | null): string[] {
  const lines = [`n°${s.label}${s.street ? ` — ${s.street}` : ""}${s.lengthM ? ` (${s.lengthM} m)` : ""}`];
  if (s.booking) {
    lines.push(`${s.booking.contactName}${s.booking.phone ? ` · ${formatPhone(s.booking.phone)}` : ""}`);
    if (s.booking.status === "offered") {
      lines.push(
        `Offre en attente${s.booking.offerExpiresAt ? ` jusqu’au ${new Date(s.booking.offerExpiresAt).toLocaleDateString("fr-BE")}` : ""}`,
      );
    } else {
      lines.push(
        `${paymentStateLabels[s.booking.payment]} · ${formatEuros(s.booking.paidCents)} / ${formatEuros(s.booking.amountDueCents)}`,
      );
    }
    if (s.booking.spotLabels.length > 1) lines.push(`Réservation : n°${joinLabels(s.booking.spotLabels)}`);
  } else {
    lines.push(statusText[s.status]);
    if (s.status === "conflict") lines.push(`Demandé par : ${s.priority.join(" / ")}`);
    if (s.status === "priority") lines.push(`Priorité : ${s.priority.join(", ")}`);
  }
  if (s.lastYear.length) lines.push(`En ${previousYear ?? "l’an dernier"} : ${s.lastYear.join(", ")}`);
  if (s.residents.length) lines.push(`Riverain : ${s.residents.join(", ")}`);
  if (!s.booking && s.requests.length) lines.push(`Demandé par : ${s.requests.join(", ")}`);
  return lines;
}

export default function StatusMap({
  plan,
  spots,
  previousYear,
  emailsEnabled,
}: {
  plan: { id: number; width: number; height: number };
  spots: MapSpot[];
  emailsEnabled: boolean;
  previousYear: number | null;
}) {
  const router = useRouter();
  const image = usePlanImage(`/api/plan/image?v=${plan.id}`);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const [manualView, setView] = useState<View | null>(null);
  const view = manualView ?? fitView(size, plan);
  const [hover, setHover] = useState<{ spot: MapSpot; x: number; y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [hidden, setHidden] = useState<Set<MapStatus>>(new Set());
  const [query, setQuery] = useState("");

  const byId = useMemo(() => new Map(spots.map((s) => [s.id, s])), [spots]);
  const selected = selectedIds.map((id) => byId.get(id)).filter((s): s is MapSpot => !!s);
  const counts = useMemo(() => {
    const c = Object.fromEntries(LEGEND.map((l) => [l.status, 0])) as Record<MapStatus, number>;
    for (const s of spots) c[s.status]++;
    return c;
  }, [spots]);

  const q = normalizeText(query);
  const matches = useMemo(() => {
    if (!q) return null;
    return new Set(
      spots
        .filter((s) =>
          [
            s.label,
            s.street,
            s.booking?.contactName ?? "",
            ...s.lastYear,
            ...s.residents,
            ...s.priority,
          ].some((t) => normalizeText(t).includes(q)),
        )
        .map((s) => s.id),
    );
  }, [q, spots]);

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const pos = stageRef.current?.getPointerPosition();
    if (view && pos) setView(zoomView(view, pos, view.scale * (e.evt.deltaY > 0 ? 1 / 1.15 : 1.15)));
  }

  function onSpotClick(e: KonvaEventObject<MouseEvent | TouchEvent>, s: MapSpot) {
    e.cancelBubble = true;
    const shift = "shiftKey" in e.evt && (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
    setSelectedIds((cur) =>
      shift
        ? cur.includes(s.id)
          ? cur.filter((x) => x !== s.id)
          : [...cur, s.id]
        : cur.length === 1 && cur[0] === s.id
          ? []
          : [s.id],
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un nom, un n°, une rue…"
            className="w-72"
            aria-label="Chercher sur la carte"
          />
          {matches && <span className="text-sm text-slate-600">{matches.size} résultat(s)</span>}
          <span className="mx-1 h-6 w-px bg-slate-300" />
          <Button
            type="button"
            variant="secondary"
            aria-label="Zoom arrière"
            onClick={() =>
              view && setView(zoomView(view, { x: size.width / 2, y: size.height / 2 }, view.scale / 1.3))
            }
          >
            −
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-label="Zoom avant"
            onClick={() =>
              view && setView(zoomView(view, { x: size.width / 2, y: size.height / 2 }, view.scale * 1.3))
            }
          >
            +
          </Button>
          <Button type="button" variant="secondary" onClick={() => setView(null)}>
            Ajuster
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {LEGEND.map((l) => {
            const st = STYLE[l.status];
            const off = hidden.has(l.status);
            return (
              <button
                key={l.status}
                type="button"
                title={off ? "Afficher" : "Masquer"}
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h);
                    if (n.has(l.status)) n.delete(l.status);
                    else n.add(l.status);
                    return n;
                  })
                }
                className={`flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 ${off ? "opacity-40" : ""}`}
              >
                <span
                  className="inline-block h-3 w-4 rounded-sm"
                  style={{ background: st.fill, border: `2px ${st.dash ? "dashed" : "solid"} ${st.stroke}` }}
                />
                {l.label} ({counts[l.status]})
              </button>
            );
          })}
        </div>
        <div
          ref={containerRef}
          className="relative h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden rounded-lg border border-slate-300 bg-slate-200"
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
              onClick={(e) =>
                e.target === e.target.getStage() || e.target.name() === "plan-bg"
                  ? setSelectedIds([])
                  : undefined
              }
            >
              <Layer>
                {image && <KImage image={image} width={plan.width} height={plan.height} name="plan-bg" />}
              </Layer>
              <Layer>
                {spots
                  .filter((s) => !hidden.has(s.status))
                  .map((s) => {
                    const st = STYLE[s.status];
                    const isSel = selectedIds.includes(s.id);
                    const dim = matches !== null && !matches.has(s.id);
                    const fontSize = Math.max(
                      6,
                      Math.min(s.height * 0.7, (s.width / Math.max(s.label.length, 1)) * 1.5),
                    );
                    return (
                      <Group
                        key={s.id}
                        x={s.x}
                        y={s.y}
                        rotation={s.rotation}
                        opacity={dim ? 0.25 : 1}
                        onClick={(e) => onSpotClick(e, s)}
                        onTap={(e) => onSpotClick(e, s)}
                        onMouseEnter={(e) => {
                          const p = e.target.getStage()?.getPointerPosition();
                          if (p) setHover({ spot: s, x: p.x, y: p.y });
                          const c = e.target.getStage()?.container();
                          if (c) c.style.cursor = "pointer";
                        }}
                        onMouseMove={(e) => {
                          const p = e.target.getStage()?.getPointerPosition();
                          if (p) setHover({ spot: s, x: p.x, y: p.y });
                        }}
                        onMouseLeave={(e) => {
                          setHover(null);
                          const c = e.target.getStage()?.container();
                          if (c) c.style.cursor = "";
                        }}
                      >
                        <Rect
                          x={-s.width / 2}
                          y={-s.height / 2}
                          width={s.width}
                          height={s.height}
                          fill={st.fill}
                          stroke={isSel ? "#111827" : st.stroke}
                          strokeWidth={isSel ? 3 : (st.width ?? 1.5)}
                          strokeScaleEnabled={false}
                          dash={isSel ? undefined : st.dash}
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
                          fill={st.text}
                          listening={false}
                        />
                      </Group>
                    );
                  })}
              </Layer>
            </Stage>
          )}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 max-w-xs rounded-md bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg"
              style={{
                left: Math.min(hover.x + 14, size.width - 260),
                top: Math.min(hover.y + 14, size.height - 120),
              }}
            >
              {describe(hover.spot, previousYear).map((line, i) => (
                <div key={i} className={i === 0 ? "font-semibold" : ""}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Survolez un emplacement pour voir le détail · clic : sélectionner · Maj+clic : sélectionner
          plusieurs emplacements libres · cliquez la légende pour masquer une catégorie.
        </p>
      </div>
      <aside className="w-full shrink-0 lg:w-80">
        <SpotPanel
          key={selectedIds.join(",")}
          selected={selected}
          previousYear={previousYear}
          emailsEnabled={emailsEnabled}
          onDone={() => router.refresh()}
        />
      </aside>
    </div>
  );
}

function SpotPanel({
  selected,
  previousYear,
  emailsEnabled,
  onDone,
}: {
  selected: MapSpot[];
  previousYear: number | null;
  emailsEnabled: boolean;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!selected.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Cliquez sur un emplacement pour voir le détail, enregistrer un paiement ou l’attribuer.
      </div>
    );
  }
  const free = selected.every((s) => !s.booking && s.status !== "inactive");
  const bookingIds = new Set(selected.map((s) => s.booking?.id));
  const single = selected.length === 1 || (bookingIds.size === 1 && !bookingIds.has(undefined));
  const s = selected[0];

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      {error && <Alert>{error}</Alert>}
      {single ? (
        <div className="space-y-0.5">
          {describe(s, previousYear).map((line, i) => (
            <div key={i} className={i === 0 ? "text-base font-semibold" : "text-slate-700"}>
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="font-semibold">
          n°{joinLabels(selected.map((x) => x.label).sort(compareLabels))} ({selected.length} emplacements)
        </div>
      )}

      {single && s.booking && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <Link href={`/admin/reservations/${s.booking.id}`} className="text-brand-700 font-medium underline">
            Ouvrir la réservation {s.booking.reference}
          </Link>
          {s.booking.status === "confirmed" && (s.booking.amountDueCents ?? 0) > s.booking.paidCents && (
            <div className="flex flex-wrap gap-2">
              {(["cash", "transfer"] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await quickPay(s.booking!.id, m);
                      if (res.error) setError(res.error);
                      else onDone();
                    })
                  }
                >
                  Payé {m === "cash" ? "en liquide" : "par virement"} (
                  {formatEuros((s.booking!.amountDueCents ?? 0) - s.booking!.paidCents)})
                </Button>
              ))}
            </div>
          )}
          {s.booking.status === "offered" && (
            <Link href="/admin/priorites" className="text-brand-700 block underline">
              Gérer l’offre dans Priorités
            </Link>
          )}
        </div>
      )}

      {free && <AssignForm spots={selected} emailsEnabled={emailsEnabled} onDone={onDone} />}
      {!free && !single && (
        <p className="text-slate-500">
          Pour attribuer plusieurs emplacements, sélectionnez uniquement des emplacements libres.
        </p>
      )}
    </div>
  );
}

function AssignForm({
  spots,
  emailsEnabled,
  onDone,
}: {
  spots: MapSpot[];
  emailsEnabled: boolean;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; city: string; hasEmail: boolean }[]>([]);
  const [chosen, setChosen] = useState<{ id: number; name: string; hasEmail: boolean } | null>(null);
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const withPriority = spots.filter((s) => s.status === "priority" || s.status === "conflict");

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="font-medium">Attribuer à un exposant</div>
      {withPriority.length > 0 && (
        <Alert tone="amber">
          Attention : priorité en cours sur n°{withPriority.map((s) => s.label).join(", ")} (voir Priorités).
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {chosen ? (
        <div className="flex items-center justify-between rounded-md bg-slate-100 px-2 py-1.5">
          <span>{chosen.name}</span>
          <button type="button" className="text-xs underline" onClick={() => setChosen(null)}>
            changer
          </button>
        </div>
      ) : (
        <>
          <Input
            value={q}
            placeholder="Nom, téléphone ou email…"
            aria-label="Chercher un exposant"
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              clearTimeout(timer.current);
              timer.current = setTimeout(async () => setResults(await searchContacts(v)), 250);
            }}
          />
          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1.5 text-left hover:bg-slate-100"
                    onClick={() => setChosen(r)}
                  >
                    {r.name} {r.city && <span className="text-slate-500">({r.city})</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/exposants/nouveau"
            target="_blank"
            className="text-brand-700 block text-xs underline"
          >
            Nouvel exposant (nouvel onglet)
          </Link>
        </>
      )}
      {chosen && (
        <>
          {emailsEnabled && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notify && chosen.hasEmail}
                disabled={!chosen.hasEmail}
                onChange={(e) => setNotify(e.target.checked)}
              />
              Envoyer la confirmation par email{!chosen.hasEmail && " (pas d’email)"}
            </label>
          )}
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await assignSpots(
                  spots.map((s) => s.id),
                  chosen.id,
                  emailsEnabled && notify && chosen.hasEmail,
                );
                if (res.error) setError(res.error);
                else onDone();
              })
            }
          >
            Attribuer n°{joinLabels(spots.map((s) => s.label).sort(compareLabels))}
          </Button>
        </>
      )}
    </div>
  );
}
