import type { ImageAnnotation } from "@annotorious/react";
import { getLabelTrack, readRectGeometry } from "./anno-utils";

type UnknownRecord = Record<string, unknown>;

// Our app stores a frame key on target.source (not present in upstream Annotorious types).
type VideoImageAnnotation = ImageAnnotation & {
  target: ImageAnnotation["target"] & {
    source?: string;
  };
};

function getTargetSource(a: ImageAnnotation): string {
  return (a as VideoImageAnnotation).target.source ?? "";
}

/**
 * Stable signature for comparing overlays by content (not by reference).
 * Used to avoid feedback loops when we programmatically call `setAnnotations`.
 */
function annoSig(a: ImageAnnotation): string {
  const sel = a.target.selector;
  const source = getTargetSource(a);
  const g = readRectGeometry(a);
  const { className, trackId } = getLabelTrack(a);

  return [
    a.id ?? "",
    sel?.type ?? "",
    source,
    g?.x ?? "",
    g?.y ?? "",
    g?.w ?? "",
    g?.h ?? "",
    className ?? "",
    trackId ?? "",
  ].join("|");
}

export function sameOverlay(a: ImageAnnotation[], b: ImageAnnotation[]): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const as = a.map(annoSig).sort();
  const bs = b.map(annoSig).sort();
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
  return true;
}

export async function doubleRAF() {
  await new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );
}

export function clampRectToImage(
  g: { x: number; y: number; w: number; h: number },
  nw: number,
  nh: number,
): { x: number; y: number; w: number; h: number } | null {
  const x1 = Math.min(g.x, g.x + g.w);
  const y1 = Math.min(g.y, g.y + g.h);
  const x2 = Math.max(g.x, g.x + g.w);
  const y2 = Math.max(g.y, g.y + g.h);

  const cx1 = Math.max(0, Math.min(nw, x1));
  const cy1 = Math.max(0, Math.min(nh, y1));
  const cx2 = Math.max(0, Math.min(nw, x2));
  const cy2 = Math.max(0, Math.min(nh, y2));

  const w = cx2 - cx1;
  const h = cy2 - cy1;

  if (!(w > 0 && h > 0)) return null;
  return { x: cx1, y: cy1, w, h };
}

function withRectGeometry(
  a: ImageAnnotation,
  g: { x: number; y: number; w: number; h: number },
): ImageAnnotation {
  const geom = a.target.selector.geometry as unknown;
  const base =
    geom && typeof geom === "object"
      ? (geom as UnknownRecord)
      : ({} as UnknownRecord);

  const nextGeom = {
    ...base,
    x: g.x,
    y: g.y,
    w: g.w,
    h: g.h,
    bounds: { minX: g.x, minY: g.y, maxX: g.x + g.w, maxY: g.y + g.h },
  } as unknown as ImageAnnotation["target"]["selector"]["geometry"];

  return {
    ...a,
    target: {
      ...a.target,
      selector: {
        ...a.target.selector,
        geometry: nextGeom,
      },
    },
  };
}

export function clampOverlayToNaturalImage(
  list: ImageAnnotation[],
  natural: { w: number; h: number } | null,
): ImageAnnotation[] {
  if (!natural?.w || !natural?.h) return list;

  let changed = false;
  const out: ImageAnnotation[] = [];

  for (const a of list) {
    const g = readRectGeometry(a);
    if (!g) {
      out.push(a);
      continue;
    }

    const clamped = clampRectToImage(g, natural.w, natural.h);
    if (!clamped) {
      changed = true;
      continue;
    }

    const same =
      clamped.x === g.x &&
      clamped.y === g.y &&
      clamped.w === g.w &&
      clamped.h === g.h;

    if (same) out.push(a);
    else {
      changed = true;
      out.push(withRectGeometry(a, clamped));
    }
  }

  return changed ? out : list;
}
