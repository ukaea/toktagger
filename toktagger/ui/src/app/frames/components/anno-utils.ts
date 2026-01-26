"use client";

import {
  ShapeType,
  type AnnotationBody,
  type ImageAnnotation,
} from "@annotorious/react";
import type { VideoBoundingBox } from "./types";
import { classIdForName } from "./types";

/**
 * Bodies convention (v2):
 * - purpose="tagging"      => class name (string)
 * - purpose="identifying"  => track id (string)
 *
 * We keep it DEAD simple (no JSON payloads) because v2 is a refactor/sandbox branch.
 */

export function getBodyValue(a: ImageAnnotation, purpose: string): string | null {
  const v = a?.bodies?.find((b) => b?.purpose === purpose)?.value;
  return typeof v === "string" ? v : null;
}

export function upsertBody(
  bodies: AnnotationBody[] | undefined,
  purpose: string,
  value: string
): AnnotationBody[] {
  const list = Array.isArray(bodies) ? bodies.slice() : [];
  const idx = list.findIndex((b) => b?.purpose === purpose);
  if (idx >= 0) {
    list[idx] = { ...(list[idx] as AnnotationBody), purpose, value } as AnnotationBody;
    return list;
  }
  list.push({ purpose, value } as unknown as AnnotationBody);
  return list;
}

export function stampLabelAndTrack(a: ImageAnnotation, className: string, trackId: string): ImageAnnotation {
  const bodies = upsertBody(a.bodies, "tagging", className);
  const bodies2 = upsertBody(bodies, "identifying", trackId);
  return { ...a, bodies: bodies2 };
}

export function getLabelTrack(a: ImageAnnotation): { className: string | null; trackId: string | null } {
  return {
    className: getBodyValue(a, "tagging"),
    trackId: getBodyValue(a, "identifying"),
  };
}

export function isRectangleAnno(a: ImageAnnotation): boolean {
  const sel = (a as any)?.target?.selector;
  if (!sel || typeof sel !== "object") return false;
  // Native model: selector.type === ShapeType.RECTANGLE
  if ((sel as any).type === ShapeType.RECTANGLE) return true;
  // Some environments have string literal type
  if ((sel as any).type === "RECTANGLE") return true;
  return false;
}

export function readRectGeometry(a: ImageAnnotation): { x: number; y: number; w: number; h: number } | null {
  const sel = (a as any)?.target?.selector;
  const g = sel?.geometry;
  const x = g?.x;
  const y = g?.y;
  const w = g?.w;
  const h = g?.h;
  if (![x, y, w, h].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/**
 * Normalize overlay:
 * - rectangle-only
 * - stamp target.source to frameKey
 * - ensure bodies have class+track (fallbacks if missing)
 * - preserve existing bodies if present
 */
export function normalizeOverlay(
  list: ImageAnnotation[],
  frameKey: string,
  fallback: { className: string; trackId: string }
): ImageAnnotation[] {
  const out: ImageAnnotation[] = [];

  for (const a of list ?? []) {
    if (!a || typeof a !== "object") continue;
    if (!isRectangleAnno(a)) continue;

    const withSource: ImageAnnotation = {
      ...(a as ImageAnnotation),
      target: { ...(a.target as any), source: frameKey } as any,
    };

    const got = getLabelTrack(withSource);
    const className = got.className ?? fallback.className;
    const trackId = got.trackId ?? fallback.trackId;

    out.push(stampLabelAndTrack(withSource, className, trackId));
  }

  return out;
}

/** Convert a normalized ImageAnnotation -> backend VideoBoundingBox */
export function annoToVideoBBox(a: ImageAnnotation, frame: number): VideoBoundingBox | null {
  if (!isRectangleAnno(a)) return null;
  const g = readRectGeometry(a);
  if (!g) return null;

  const { className, trackId } = getLabelTrack(a);
  if (!className || !trackId) return null;

  return {
    type: "video_bounding_box",
    frame,
    track_id: String(trackId),
    label: String(className),
    class_id: classIdForName(className),
    x_min: Math.round(g.x),
    y_min: Math.round(g.y),
    width: Math.round(g.w),
    height: Math.round(g.h),
    created_by: "manual",
  };
}

/** Convert backend VideoBoundingBox -> native ImageAnnotation (rectangle geometry) */
export function videoBBoxToAnno(b: VideoBoundingBox, frameKey: string): ImageAnnotation {
  const x = Number(b.x_min);
  const y = Number(b.y_min);
  const w = Number(b.width);
  const h = Number(b.height);

  const id = (globalThis.crypto?.randomUUID?.() ?? `anno-${Math.random().toString(36).slice(2)}`) as string;

  const anno: ImageAnnotation = {
    id,
    bodies: [],
    target: {
      source: frameKey,
      selector: {
        type: ShapeType.RECTANGLE,
        geometry: {
          x,
          y,
          w,
          h,
          bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
        },
      },
    } as any,
  };

  return stampLabelAndTrack(anno, b.label, String(b.track_id));
}
