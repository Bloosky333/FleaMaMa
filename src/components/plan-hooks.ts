"use client";

import { useEffect, useRef, useState } from "react";

export function usePlanImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
    return () => {
      i.onload = null;
    };
  }, [src]);
  return img;
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export type View = { scale: number; x: number; y: number };

/** Scale and offset that fit the whole plan in the container. */
export function fitView(
  container: { width: number; height: number },
  plan: { width: number; height: number },
): View | null {
  if (!container.width || !container.height) return null;
  const scale = Math.min(container.width / plan.width, container.height / plan.height) * 0.95;
  return {
    scale,
    x: (container.width - plan.width * scale) / 2,
    y: (container.height - plan.height * scale) / 2,
  };
}

/** New view after zooming to `newScale` around a screen point. */
export function zoomView(view: View, pos: { x: number; y: number }, newScale: number): View {
  const scale = Math.min(Math.max(newScale, 0.05), 20);
  const imgX = (pos.x - view.x) / view.scale;
  const imgY = (pos.y - view.y) / view.scale;
  return { scale, x: pos.x - imgX * scale, y: pos.y - imgY * scale };
}
