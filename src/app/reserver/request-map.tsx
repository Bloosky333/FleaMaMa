"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useActionState, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KImage, Layer, Rect, Stage, Text } from "react-konva";
import { fitView, useElementSize, usePlanImage, type View, zoomView } from "@/components/plan-hooks";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { formatEuros, pricePerSpot, type TariffGrid } from "@/lib/pricing";
import type { PublicSpot } from "@/lib/requests-server";
import { compareLabels, joinLabels } from "@/lib/spots";
import { submitRequest } from "./actions";

const CHOICE_COLORS = ["#2563eb", "#9333ea", "#d97706"];
const ordinal = (i: number) => (i === 0 ? "1er" : `${i + 1}e`);

export default function RequestMap({
  plan,
  spots,
  grid,
  today,
  earlyBirdDeadline,
  emailsEnabled,
}: {
  plan: { id: number; width: number; height: number };
  spots: PublicSpot[];
  grid: TariffGrid;
  today: string;
  earlyBirdDeadline: string | null;
  emailsEnabled: boolean;
}) {
  const image = usePlanImage(`/api/plan/image?v=${plan.id}`);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const stageRef = useRef<Konva.Stage>(null);
  const [manualView, setView] = useState<View | null>(null);
  const view = manualView ?? fitView(size, plan);
  const [choices, setChoices] = useState<number[][]>([[], [], []]);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<{ spot: PublicSpot; x: number; y: number } | null>(null);
  const [kind, setKind] = useState<"private" | "pro">("private");
  const [state, action, pending] = useActionState(submitRequest, undefined);

  const byId = useMemo(() => new Map(spots.map((s) => [s.id, s])), [spots]);
  const choiceOf = (id: number) => choices.findIndex((c) => c.includes(id));
  const labels = (ids: number[]) => ids.map((id) => byId.get(id)!.label).sort(compareLabels);
  const unit = pricePerSpot(grid, kind, today, earlyBirdDeadline);
  const freeCount = spots.filter((s) => s.available).length;

  function toggle(s: PublicSpot) {
    if (!s.available) return;
    setChoices((cur) => {
      const inActive = cur[active].includes(s.id);
      return cur.map((c, i) =>
        i === active
          ? inActive
            ? c.filter((x) => x !== s.id)
            : [...c, s.id].slice(0, 6)
          : c.filter((x) => x !== s.id),
      );
    });
  }

  function onWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const pos = stageRef.current?.getPointerPosition();
    if (view && pos) setView(zoomView(view, pos, view.scale * (e.evt.deltaY > 0 ? 1 / 1.15 : 1.15)));
  }

  const filled = choices.filter((c) => c.length);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Choisissez vos emplacements</h2>
        <p className="text-sm text-stone-600">
          Touchez un emplacement vert pour l’ajouter à votre 1er choix. Vous pouvez aussi indiquer un 2e et un
          3e choix au cas où le premier serait déjà attribué. {freeCount} emplacement(s) libre(s).
        </p>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-md border-2 px-3 py-2 text-left text-sm ${active === i ? "bg-white shadow" : "border-transparent bg-stone-100"}`}
              style={{ borderColor: active === i ? CHOICE_COLORS[i] : undefined }}
            >
              <span className="font-semibold" style={{ color: CHOICE_COLORS[i] }}>
                {ordinal(i)} choix
              </span>
              <span className="block text-xs text-stone-600">
                {choices[i].length
                  ? `n°${joinLabels(labels(choices[i]))}`
                  : i === 0
                    ? "à choisir"
                    : "facultatif"}
              </span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
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
          </div>
        </div>
        <div
          ref={containerRef}
          className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-lg border border-stone-300 bg-stone-200"
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
            >
              <Layer>{image && <KImage image={image} width={plan.width} height={plan.height} />}</Layer>
              <Layer>
                {spots.map((s) => {
                  const c = choiceOf(s.id);
                  const fill =
                    c >= 0
                      ? CHOICE_COLORS[c]
                      : s.available
                        ? "rgba(34,197,94,0.45)"
                        : "rgba(120,113,108,0.45)";
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
                      onClick={() => toggle(s)}
                      onTap={() => toggle(s)}
                      onMouseEnter={(e) => {
                        const p = e.target.getStage()?.getPointerPosition();
                        if (p) setHover({ spot: s, x: p.x, y: p.y });
                        const ct = e.target.getStage()?.container();
                        if (ct) ct.style.cursor = s.available ? "pointer" : "not-allowed";
                      }}
                      onMouseLeave={(e) => {
                        setHover(null);
                        const ct = e.target.getStage()?.container();
                        if (ct) ct.style.cursor = "";
                      }}
                    >
                      <Rect
                        x={-s.width / 2}
                        y={-s.height / 2}
                        width={s.width}
                        height={s.height}
                        fill={fill}
                        stroke={c >= 0 ? "#111827" : s.available ? "#15803d" : "#78716c"}
                        strokeWidth={c >= 0 ? 2 : 1}
                        strokeScaleEnabled={false}
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
                        fill={c >= 0 ? "#fff" : "#1c1917"}
                        listening={false}
                      />
                      {s.available && s.requests > 0 && c < 0 && (
                        <Circle
                          x={s.width / 2}
                          y={-s.height / 2}
                          radius={Math.min(s.height, s.width) * 0.18}
                          fill="#d97706"
                          listening={false}
                        />
                      )}
                    </Group>
                  );
                })}
              </Layer>
            </Stage>
          )}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 rounded-md bg-stone-900/90 px-3 py-2 text-xs text-white"
              style={{
                left: Math.min(hover.x + 14, size.width - 220),
                top: Math.min(hover.y + 14, size.height - 70),
              }}
            >
              <div className="font-semibold">
                n°{hover.spot.label}
                {hover.spot.street && ` — ${hover.spot.street}`}
              </div>
              <div>{hover.spot.available ? "Libre" : "Déjà attribué"}</div>
              {hover.spot.available && hover.spot.requests > 0 && (
                <div className="text-amber-300">{hover.spot.requests} demande(s) en cours</div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-stone-500">
          <span className="mr-3 inline-block h-3 w-3 rounded-sm bg-green-500/60 align-middle" /> libre
          <span className="mx-3 inline-block h-3 w-3 rounded-sm bg-stone-500/60 align-middle" /> déjà attribué
          <span className="mx-3 inline-block h-3 w-3 rounded-full bg-amber-600 align-middle" /> d’autres
          personnes l’ont déjà demandé (l’organisateur choisira)
        </p>
      </section>

      <form action={action} className="space-y-4">
        <h2 className="text-lg font-semibold">2. Vos coordonnées</h2>
        {state?.error && <Alert>{state.error}</Alert>}
        <input type="hidden" name="choices" value={JSON.stringify(filled)} />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom *">
            <Input name="lastName" required autoComplete="family-name" />
          </Field>
          <Field label="Prénom">
            <Input name="firstName" autoComplete="given-name" />
          </Field>
          <Field label="Vous êtes">
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "private" | "pro")}>
              <option value="private">Particulier</option>
              <option value="pro">Professionnel</option>
            </Select>
          </Field>
          {kind === "pro" ? (
            <Field label="N° d’entreprise (BCE / TVA) *">
              <Input name="vatNumber" required />
            </Field>
          ) : (
            <input type="hidden" name="vatNumber" value="" />
          )}
          <Field label="Société" className={kind === "pro" ? "" : "sm:col-span-2"}>
            <Input name="company" autoComplete="organization" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
          <Field label="Rue *">
            <Input name="street" required autoComplete="address-line1" />
          </Field>
          <Field label="N°">
            <Input name="houseNumber" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Code postal *">
            <Input name="postcode" required inputMode="numeric" autoComplete="postal-code" />
          </Field>
          <Field label="Localité *">
            <Input name="city" required autoComplete="address-level2" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone *">
            <Input name="phone" type="tel" required autoComplete="tel" />
          </Field>
          <Field
            label="Email *"
            hint={
              emailsEnabled
                ? "Pour recevoir la réponse et votre lien personnel."
                : "Pour que l’organisateur puisse vous recontacter."
            }
          >
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
        </div>
        <Field label="Message (facultatif)" hint="Ex. : ce que vous vendez, une préférence…">
          <Textarea name="message" rows={2} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-1" />
          <span>
            J’accepte que mes coordonnées soient utilisées par l’organisation pour gérer ma réservation et me
            recontacter pour les prochaines brocantes.
          </span>
        </label>
        {choices[0].length > 0 && unit !== null && (
          <p className="text-sm">
            Prix pour votre 1er choix : <strong>{formatEuros(unit * choices[0].length)}</strong> (
            {choices[0].length} × {formatEuros(unit)})
          </p>
        )}
        <Button type="submit" disabled={pending || !choices[0].length} className="w-full py-3 sm:w-auto">
          {pending
            ? "Envoi…"
            : choices[0].length
              ? "Envoyer ma demande"
              : "Choisissez d’abord un emplacement"}
        </Button>
        <p className="text-xs text-stone-500">
          Votre demande n’est pas encore une réservation : l’organisateur vous répondra
          {emailsEnabled ? " par email." : "."}
        </p>
      </form>
    </div>
  );
}
