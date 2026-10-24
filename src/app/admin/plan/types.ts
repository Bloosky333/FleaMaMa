import type { Spot } from "@/db/schema";

export type EditorSpot = {
  id: number;
  label: string;
  street: string;
  side: string;
  lengthM: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  facingAddresses: string[];
  notes: string;
  active: boolean;
};

export type EditorPlan = {
  id: number;
  width: number;
  height: number;
  defaultSpotWidth: number;
  defaultSpotHeight: number;
  defaultSpotLengthM: number;
};

/** Strips DB-only fields before sending spots to the browser. */
export function toEditorSpot(s: Spot): EditorSpot {
  return {
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
  };
}
