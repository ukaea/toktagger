"use client";

import type { ImageAnnotation } from "@annotorious/react";

/**
 * Minimal types for Phase 1/3/4 (no profiles/instances yet).
 */
export type ClassRegistry = Record<string, number>;

export type Profile = {
  key: string;
  class_id: number;
  class_name: string;
  track_id: string;
};

/**
 * Minimal stub: we do not care about classes yet, so just return null.
 */
export function extractClassLabel(
  _a: any
): { class_id?: number; class_name?: string; track_id?: string } | null {
  return null;
}

/**
 * Stubbed track ID normalizer – we will replace with the full version later.
 */
export function canonicalizeTrackId(input: string): string {
  return input.trim();
}

/**
 * Stubbed label writers – for early phases, we do not attach any class metadata.
 * These simply return the annotation unchanged.
 */
export function writeClassAndTrack(
  a: any,
  _cls: { id: number; name: string },
  _track_id: string
): any {
  return a;
}

export function writeClassOnly(a: any, _cls: { id: number; name: string }): any {
  return a;
}

/**
 * Phase 1 normalization: just return the list as-is.
 * No mode-awareness, no class/track propagation.
 *
 * This keeps AnnoBridge happy without pulling in the full label logic yet.
 */
export function normalizeWithMode(
  rawList: ImageAnnotation[],
  _knownById: Record<string, ImageAnnotation>,
  _getSelectedProfile: () => Profile | null,
  _getSelectedClassName: () => string | null,
  _includeTrackIds: boolean,
  _classRegistry: ClassRegistry
): ImageAnnotation[] {
  return rawList;
}

/** ---------- COCO types + converters (ported from old branch) ---------- */

export type CocoBBox = {
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  class_id?: number;
  class_name?: string;
  track_id?: string;
  track_numeric?: number;
  instance?: number;
};

export type CocoPolygon = {
  segmentation: number[][];
  bbox: [number, number, number, number];
  class_id?: number;
  class_name?: string;
  track_id?: string;
  track_numeric?: number;
  instance?: number;
};

export type CocoFrame = {
  frame: number;
  bboxes: CocoBBox[];
  polygons: CocoPolygon[];
};

/** Parse frame from our sourceKey "app://p/<proj>/s/<sample>/f/<n>" */
export function frameFromSourceKey(src?: string): number | null {
  if (!src) return null;
  const match = src.match(/\/f\/(\d+)/);
  return match ? Number(match[1]) : null;
}

export type SelSize = { w: number; h: number };

/**
 * rectangle → CocoBBox (supports:
 *  - W3C selector string "xywh=pixel:x,y,w,h" or "xywh=percent:x,y,w,h"
 *  - Annotorious RECTANGLE geometry/bounds)
 */
export function rectToCoco(a: any, naturalSize?: SelSize): CocoBBox | null {
  const selector = a?.target?.selector;

  // W3C selector string
  if (selector && typeof selector.value === "string") {
    const match = selector.value.match(
      /xywh=(pixel|percent):([\d.]+),([\d.]+),([\d.]+),([\d.]+)/i
    );
    if (match) {
      const unit = match[1].toLowerCase();
      let x = parseFloat(match[2]);
      let y = parseFloat(match[3]);
      let w = parseFloat(match[4]);
      let h = parseFloat(match[5]);

      if (unit === "percent") {
        if (!naturalSize) return null;
        x = (x / 100) * naturalSize.w;
        y = (y / 100) * naturalSize.h;
        w = (w / 100) * naturalSize.w;
        h = (h / 100) * naturalSize.h;
      }

      return {
        x_min: Math.round(x),
        y_min: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
      };
    }
  }

  // Annotorious RECTANGLE geometry/bounds
  if (selector && selector.type === "RECTANGLE") {
    const geometry = selector.geometry || {};
    if (
      [geometry.x, geometry.y, geometry.w, geometry.h].every(
        (n: any) => typeof n === "number"
      )
    ) {
      return {
        x_min: Math.round(geometry.x),
        y_min: Math.round(geometry.y),
        width: Math.round(geometry.w),
        height: Math.round(geometry.h),
      };
    }
    const bounds = geometry.bounds;
    if (
      bounds &&
      ["minX", "minY", "maxX", "maxY"].every(
        (k) => typeof (bounds as any)[k] === "number"
      )
    ) {
      return {
        x_min: Math.round(bounds.minX),
        y_min: Math.round(bounds.minY),
        width: Math.round(bounds.maxX - bounds.minX),
        height: Math.round(bounds.maxY - bounds.minY),
      };
    }
  }

  return null;
}

/**
 * polygon → CocoPolygon (supports:
 *  - Annotorious POLYGON geometry (points + bounds)
 *  - W3C selector value containing an SVG <polygon ... points="x,y ..." />
 */
export function polyToCoco(a: any): CocoPolygon | null {
  const selector = a?.target?.selector;
  if (!selector) return null;

  // Annotorious POLYGON
  if (selector.type === "POLYGON" && selector.geometry?.points?.length) {
    const points: number[][] = selector.geometry.points as number[][];
    const flat = points.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);
    const bounds = selector.geometry.bounds;
    const bbox: [number, number, number, number] = bounds
      ? [
          Math.round(bounds.minX),
          Math.round(bounds.minY),
          Math.round(bounds.maxX - bounds.minX),
          Math.round(bounds.maxY - bounds.minY),
        ]
      : ([
          Math.round(Math.min(...points.map((p) => p[0]))),
          Math.round(Math.min(...points.map((p) => p[1]))),
          Math.round(
            Math.max(...points.map((p) => p[0])) -
              Math.min(...points.map((p) => p[0]))
          ),
          Math.round(
            Math.max(...points.map((p) => p[1])) -
              Math.min(...points.map((p) => p[1]))
          ),
        ] as [number, number, number, number]);
    return { segmentation: [flat], bbox };
  }

  // SVG <polygon> selector string
  if (typeof selector.value === "string" && /<polygon/i.test(selector.value)) {
    const match = selector.value.match(
      /points\s*=\s*["']([^"']+)["']/i
    );
    if (match) {
      const coords = match[1]
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(/[,\s]+/).map(Number))
        .filter(
          (p) =>
            p.length === 2 &&
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1])
        ) as number[][];
      if (coords.length >= 3) {
        const flat = coords.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);
        const xs = coords.map((p) => p[0]);
        const ys = coords.map((p) => p[1]);
        const bbox: [number, number, number, number] = [
          Math.round(Math.min(...xs)),
          Math.round(Math.min(...ys)),
          Math.round(Math.max(...xs) - Math.min(...xs)),
          Math.round(Math.max(...ys) - Math.min(...ys)),
        ];
        return { segmentation: [flat], bbox };
      }
    }
  }

  return null;
}

/** Track id → numeric version (only if it's literally an integer string) */
export function numericFromTrackId(track_id?: string): number | null {
  if (!track_id) return null;
  const n = Number(track_id);
  return Number.isFinite(n) && String(n) === track_id ? n : null;
}

/**
 * Add track/class info to the exported label.
 *
 * NOTE: extractClassLabel is still a stub, so for now this will
 * usually return just `{ class_id, class_name }` as `undefined`,
 * and downstream we fall back to "unknown".
 */
export function augmentLabelForExport(a: any, includeTracks: boolean) {
  const label = extractClassLabel(a) || {};
  if (!includeTracks) {
    const { class_id, class_name } = label as any;
    return { class_id, class_name };
  }
  const track_numeric = numericFromTrackId((label as any).track_id);
  return {
    ...label,
    track_numeric: track_numeric ?? undefined,
    instance: track_numeric ?? undefined,
  };
}

/**
 * W3C list → grouped per-frame COCO payload (rectangles + polygons)
 * Shape: CocoFrame[] = { frame, bboxes: CocoBBox[], polygons: CocoPolygon[] }[]
 */
export function w3cToCocoFrames(
  list: ImageAnnotation[],
  includeTracks = true
): CocoFrame[] {
  const byFrame: Record<number, CocoFrame> = {};

  for (const a of Array.isArray(list) ? list : []) {
    const src = a?.target?.source;
    const frame = frameFromSourceKey(typeof src === "string" ? src : "");
    if (frame == null) continue;

    if (!byFrame[frame]) {
      byFrame[frame] = { frame, bboxes: [], polygons: [] };
    }

    const labelBits = augmentLabelForExport(a, includeTracks);
    const rectBox = rectToCoco(a);
    if (rectBox) {
      byFrame[frame].bboxes.push({ ...rectBox, ...labelBits });
      continue;
    }

    const poly = polyToCoco(a);
    if (poly) {
      byFrame[frame].polygons.push({ ...poly, ...labelBits });
    }
  }

  // stable order by frame id
  return Object.values(byFrame).sort((a, b) => a.frame - b.frame);
}

/** ---------- Rectangles-only adapter to backend VideoBoundingBox format ---------- */

export type VideoBoundingBox = {
  validated: boolean;
  uncertainty: number;
  label: string;
  height: number;
  width: number;
  x_min: number;
  y_min: number;
  frame: number;
  track_id?: string;
};

// Rectangles-only: ignore polygons entirely
export function cocoFramesToVideoBBoxes(coco: any[]): VideoBoundingBox[] {
  const out: VideoBoundingBox[] = [];

  for (const frameEntry of Array.isArray(coco) ? coco : []) {
    const frameIndex = Number(frameEntry?.frame) | 0;

    for (const b of (Array.isArray(frameEntry?.bboxes)
      ? frameEntry.bboxes
      : []) as any[]) {
      const x = Math.round(b.x_min ?? 0);
      const y = Math.round(b.y_min ?? 0);
      const width = Math.round(b.width ?? 0);
      const height = Math.round(b.height ?? 0);
      if (width <= 0 || height <= 0) continue;

      const labelValue =
        b.class_name ??
        (typeof b.class_id === "number" ? String(b.class_id) : "unknown");

      out.push({
        validated: true,
        uncertainty: 0,
        label: labelValue.toString(),
        height,
        width,
        x_min: x,
        y_min: y,
        frame: frameIndex,
        track_id: b.track_id || undefined,
      });
    }
  }

  return out;
}
