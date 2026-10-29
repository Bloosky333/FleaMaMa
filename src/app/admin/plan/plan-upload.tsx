"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { uploadPlan } from "./actions";

const MAX_SIDE = 3000;

type Prepared = { blob: Blob; width: number; height: number; url: string };

/** Rotates, optionally boosts contrast, and downsizes the photo/scan in the browser. */
async function prepareImage(
  img: HTMLImageElement,
  quarterTurns: number,
  contrast: boolean,
): Promise<Prepared> {
  const rotated = quarterTurns % 2 === 1;
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? h : w;
  canvas.height = rotated ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (contrast) ctx.filter = "grayscale(1) contrast(1.6) brightness(1.1)";
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85),
  );
  return { blob, width: canvas.width, height: canvas.height, url: URL.createObjectURL(blob) };
}

export function PlanUpload({ hasPlan }: { hasPlan: boolean }) {
  const router = useRouter();
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [turns, setTurns] = useState(0);
  const [contrast, setContrast] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    prepareImage(source, turns, contrast).then((p) => {
      if (cancelled) return URL.revokeObjectURL(p.url);
      setPrepared((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return p;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [source, turns, contrast]);

  function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    const img = new Image();
    img.onload = () => setSource(img);
    img.onerror = () => setError("Impossible de lire cette image. Utilisez une photo JPEG ou PNG.");
    img.src = URL.createObjectURL(file);
  }

  function submit() {
    if (!prepared) return;
    const fd = new FormData();
    fd.set("image", new File([prepared.blob], "plan.jpg", { type: "image/jpeg" }));
    fd.set("width", String(prepared.width));
    fd.set("height", String(prepared.height));
    startTransition(async () => {
      const res = await uploadPlan(fd);
      if (!res.ok) return setError(res.error);
      setSource(null);
      setPrepared(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">
        Photographiez ou scannez le plan papier (bien à plat, sans reflet), puis choisissez le fichier.
        {hasPlan && " Les emplacements déjà placés sont conservés et suivent le nouveau plan."}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="file:bg-brand-600 block text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-white"
      />
      {error && <Alert>{error}</Alert>}
      {prepared && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setTurns((t) => (t + 3) % 4)}>
              ↺ Tourner à gauche
            </Button>
            <Button type="button" variant="secondary" onClick={() => setTurns((t) => (t + 1) % 4)}>
              ↻ Tourner à droite
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={contrast} onChange={(e) => setContrast(e.target.checked)} />
              Améliorer le contraste
            </label>
            <span className="text-xs text-slate-500">
              {prepared.width}×{prepared.height} px · {(prepared.blob.size / 1024 / 1024).toFixed(1)} Mo
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={prepared.url}
            alt="Aperçu du plan"
            className="max-h-[60vh] border border-slate-200 bg-white"
          />
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Envoi…" : hasPlan ? "Remplacer le plan" : "Utiliser ce plan"}
          </Button>
        </div>
      )}
    </div>
  );
}
