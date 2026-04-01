import type { ImageAnnotation } from "@annotorious/react";
import {
  getLabelTrack,
  isRectangleAnno,
  isPolygonAnno,
  readPolygonGeometry,
  readRectGeometry,
  VideoImageAnnotation,
} from "./anno-utils";

type UnknownRecord = Record<string, unknown>;

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
  const rect = isRectangleAnno(a) ? readRectGeometry(a) : null;
  const poly = isPolygonAnno(a) ? readPolygonGeometry(a) : null;
  const { className, trackId } = getLabelTrack(a);
  const polySig = poly
    ? poly.points.map(([x, y]) => `${x},${y}`).join(";")
    : "";

  return [
    a.id ?? "",
    sel?.type ?? "",
    source,
    rect?.x ?? "",
    rect?.y ?? "",
    rect?.w ?? "",
    rect?.h ?? "",
    polySig,
    className ?? "",
    trackId ?? "",
  ].join("|");
}

export function sameOverlay(
  a: ImageAnnotation[],
  b: ImageAnnotation[],
): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  const as = a.map(annoSig).sort();
  const bs = b.map(annoSig).sort();
  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
  return true;
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

function clampPoint(
  point: Array<number>,
  nw: number,
  nh: number,
): [number, number] {
  const [x, y] = point;
  return [Math.max(0, Math.min(nw, x)), Math.max(0, Math.min(nh, y))];
}

function samePoint(a: Array<number>, b: Array<number>): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function polygonArea(points: Array<Array<number>>): number {
  let area = 0;

  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

function clampPolygonToImage(
  points: Array<Array<number>>,
  nw: number,
  nh: number,
): Array<Array<number>> | null {
  const clamped = points.map((point) => clampPoint(point, nw, nh));
  const deduped: Array<Array<number>> = [];

  for (const point of clamped) {
    if (
      deduped.length === 0 ||
      !samePoint(deduped[deduped.length - 1], point)
    ) {
      deduped.push(point);
    }
  }

  if (
    deduped.length > 1 &&
    samePoint(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }

  const unique = new Set(deduped.map(([x, y]) => `${x},${y}`));
  if (unique.size < 3) return null;
  if (polygonArea(deduped) <= 0) return null;

  return deduped;
}

function withPolygonGeometry(
  a: ImageAnnotation,
  points: Array<Array<number>>,
): ImageAnnotation {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const geom = a.target.selector.geometry as unknown;
  const base =
    geom && typeof geom === "object"
      ? (geom as UnknownRecord)
      : ({} as UnknownRecord);

  const nextGeom = {
    ...base,
    points,
    bounds: { minX, minY, maxX, maxY },
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
    if (isRectangleAnno(a)) {
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
      continue;
    }

    if (!isPolygonAnno(a)) {
      out.push(a);
      continue;
    }

    const polygon = readPolygonGeometry(a);
    if (!polygon) {
      out.push(a);
      continue;
    }

    const clamped = clampPolygonToImage(polygon.points, natural.w, natural.h);
    if (!clamped) {
      changed = true;
      continue;
    }

    const same =
      clamped.length === polygon.points.length &&
      clamped.every(
        ([x, y], index) =>
          x === polygon.points[index]?.[0] && y === polygon.points[index]?.[1],
      );

    if (same) out.push(a);
    else {
      changed = true;
      out.push(withPolygonGeometry(a, clamped));
    }
  }

  return changed ? out : list;
}
