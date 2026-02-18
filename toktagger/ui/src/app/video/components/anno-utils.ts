"use client";

import {
  ShapeType,
  type AnnotationBody,
  type ImageAnnotation,
} from "@annotorious/react";
import type { VideoBoundingBox } from "./types";
import { classIdForName } from "./types";

/**
 * Annotorious annotation helpers.
 *
 * We store two string bodies on each annotation:
 * - purpose="tagging"     -> class label
 * - purpose="identifying" -> track id
 *
 * These helpers keep the shape consistent and make conversion to/from backend boxes trivial.
 */

type UnknownRecord = Record<string, unknown>;

// Our app stores a frame key on target.source (not present in upstream Annotorious types).
export type VideoImageAnnotation = ImageAnnotation & {
  target: ImageAnnotation["target"] & {
    source?: string;
  };
};

function withTargetSource(
  a: ImageAnnotation,
  source: string,
): VideoImageAnnotation {
  return {
    ...(a as VideoImageAnnotation),
    target: {
      ...(a.target as VideoImageAnnotation["target"]),
      source,
    },
  };
}

function isImageAnnotationLike(v: unknown): v is ImageAnnotation {
  if (!v || typeof v !== "object") return false;

  const rec = v as UnknownRecord;
  const target = rec["target"];
  if (!target || typeof target !== "object") return false;

  const selector = (target as UnknownRecord)["selector"];
  if (!selector || typeof selector !== "object") return false;

  // Shape.type is a string enum at runtime, so just require a string here.
  const type = (selector as UnknownRecord)["type"];
  return typeof type === "string";
}

export function getBodyValue(
  a: ImageAnnotation,
  purpose: string,
): string | null {
  const v = a?.bodies?.find((b) => b?.purpose === purpose)?.value;
  return typeof v === "string" ? v : null;
}

/** Insert or replace a body by purpose (returns a new array).
 *
 * Annotorious bodies should have a unique `id`. Annotorious may auto-generate
 * missing IDs on load, but we ensure IDs here so our normalized/session state
 * is explicit and stable.
 */
export function upsertBody(
  bodies: AnnotationBody[] | undefined,
  purpose: string,
  value: string,
): AnnotationBody[] {
  const list = Array.isArray(bodies) ? bodies.slice() : [];
  const idx = list.findIndex((b) => b?.purpose === purpose);

  if (idx >= 0) {
    const prev = list[idx] as AnnotationBody;

    // Preserve existing body id if present; otherwise assign one once.
    const existingId = prev.id?.trim() ? prev.id : null;

    list[idx] = {
      ...prev,
      id: existingId ?? newBodyId(),
      purpose,
      value,
    } as AnnotationBody;

    return list;
  }

  // New body: assign an id explicitly.
  list.push({ id: newBodyId(), purpose, value } as AnnotationBody);
  return list;
}

/** Ensure the annotation has a class label body. */
export function stampLabel(
  a: ImageAnnotation,
  className: string,
): ImageAnnotation {
  const bodies = upsertBody(a.bodies, "tagging", className);
  return { ...a, bodies };
}

/** Ensure the annotation has both class label + track id bodies. */
export function stampLabelAndTrack(
  a: ImageAnnotation,
  className: string,
  trackId: string,
): ImageAnnotation {
  const bodies = upsertBody(a.bodies, "tagging", className);
  const bodies2 = upsertBody(bodies, "identifying", trackId);
  return { ...a, bodies: bodies2 };
}

/** Read the class label + track id bodies. */
export function getLabelTrack(a: ImageAnnotation): {
  className: string | null;
  trackId: string | null;
} {
  return {
    className: getBodyValue(a, "tagging"),
    trackId: getBodyValue(a, "identifying"),
  };
}

function newBodyId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `body-${Math.random().toString(36).slice(2)}`
  );
}

/** True if the annotation target is a rectangle selector. */
export function isRectangleAnno(a: ImageAnnotation): boolean {
  // ShapeType.RECTANGLE is already the string literal "RECTANGLE",
  // so we don't need a separate check for the string form.
  return a.target.selector.type === ShapeType.RECTANGLE;
}

function isFiniteNumber(v: unknown): v is number {
  return Number.isFinite(v);
}

/** Rectangle geometry shape we rely on at runtime. */
type RectGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Read rectangle geometry (returns null if missing/invalid). */
export function readRectGeometry(
  a: ImageAnnotation,
): { x: number; y: number; w: number; h: number } | null {
  // Make this function self-contained: only rectangles have x/y/w/h.
  if (!isRectangleAnno(a)) return null;

  const g = a.target.selector.geometry;
  if (!g || typeof g !== "object") return null;

  const rg = g as Partial<RectGeometry>;

  const x = rg.x;
  const y = rg.y;
  const w = rg.w;
  const h = rg.h;

  // TS now narrows x/y/w/h to number after these checks.
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(w) ||
    !isFiniteNumber(h)
  )
    return null;

  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

/**
 * Normalize an overlay list into a backend-safe shape:
 * - keep rectangles only
 * - stamp target.source with frameKey
 * - ensure class label exists (uses fallback if missing)
 * - ensure track id exists (uses fallback or allocator)
 */
export function normalizeOverlay(
  list: ImageAnnotation[],
  frameKey: string,
  fallback: { className: string | null; trackId: string | null },
  allocTrackId?: (className: string) => string,
  opts?: {
    enforceBothBodies?: boolean;
    dedupeByInstance?: boolean;
  },
): ImageAnnotation[] {
  const enforceBothBodies = opts?.enforceBothBodies ?? true;
  const dedupeByInstance = opts?.dedupeByInstance ?? true;

  // Defensive filter: keep only annotation-ish object.
  const src = list.filter(isImageAnnotationLike);
  const out: ImageAnnotation[] = [];

  for (const a of src) {
    if (!isRectangleAnno(a)) continue;

    const withSource = withTargetSource(a, frameKey);

    const got = getLabelTrack(withSource);
    const className = (got.className ?? fallback.className)?.trim() || null;
    if (!className) continue;

    let trackId = (got.trackId ?? fallback.trackId)?.trim() || null;
    if (!trackId && allocTrackId) {
      trackId = allocTrackId(className);
    }

    if (!trackId) {
      if (enforceBothBodies) continue;
      out.push(stampLabel(withSource, className));
      continue;
    }

    out.push(stampLabelAndTrack(withSource, className, trackId));
  }

  if (!dedupeByInstance) return out;

  const byKey = new Map<string, ImageAnnotation>();
  const order: string[] = [];

  for (const a of out) {
    const { className, trackId } = getLabelTrack(a);
    if (!className || !trackId) continue;
    const k = `${className}::${trackId}`;
    if (!byKey.has(k)) order.push(k);
    byKey.set(k, a);
  }

  return order.map((k) => byKey.get(k)!).filter(Boolean);
}

/** Convert a normalized ImageAnnotation -> backend VideoBoundingBox. */
export function annoToVideoBBox(
  a: ImageAnnotation,
  frame: number,
): VideoBoundingBox | null {
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

/** Convert backend VideoBoundingBox -> Annotorious rectangle annotation. */
export function videoBBoxToAnno(
  b: VideoBoundingBox,
  frameKey: string,
): ImageAnnotation {
  const x = Number(b.x_min);
  const y = Number(b.y_min);
  const w = Number(b.width);
  const h = Number(b.height);

  const id =
    globalThis.crypto?.randomUUID?.() ??
    `anno-${Math.random().toString(36).slice(2)}`;

  // Annotorious Geometry type only guarantees `bounds`, but rectangle geometry
  // includes x/y/w/h at runtime. We keep those fields without using `any`.
  const geometry = {
    x,
    y,
    w,
    h,
    bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
  } as ImageAnnotation["target"]["selector"]["geometry"];

  const selector = {
    type: ShapeType.RECTANGLE,
    geometry,
  } as ImageAnnotation["target"]["selector"];

  const anno: VideoImageAnnotation = {
    id,
    bodies: [],
    target: {
      // Required by the upstream type; links target -> parent annotation id.
      annotation: id,
      source: frameKey,
      selector,
    },
  };

  return stampLabelAndTrack(anno, b.label, String(b.track_id));
}

/**
 * Normalizes a raw overlay list into our session invariants:
 * - rectangles only
 * - stamps the frame source key
 * - ensures class/track bodies exist (allocating track ids when needed)
 * - optional per-instance de-duplication within the frame
 *
 * The caller is responsible for writing the returned list into session state.
 */
export function normalizeOverlayForSession(args: {
  raw: ImageAnnotation[];
  frameKey: string;
  fallback: { className: string | null; trackId: string | null };
  allocTrackId?: (className: string) => string;
  enforceBothBodies?: boolean;
  dedupeByInstance?: boolean;
}): ImageAnnotation[] {
  return normalizeOverlay(
    args.raw,
    args.frameKey,
    args.fallback,
    args.allocTrackId,
    {
      enforceBothBodies: args.enforceBothBodies ?? true,
      dedupeByInstance: args.dedupeByInstance ?? true,
    },
  );
}
