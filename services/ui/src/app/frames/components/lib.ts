"use client";

import type { ImageAnnotation } from "@annotorious/react";

/**
 * Profiles, Classes, Cross-frame counts
 */

// lib.ts – Profiles, Classes, Cross-frame counts

export const PROFILES_KEY = "ufo::profiles";
export const CLASS_REG_KEY = "ufo::class-registry";
export const LAST_CLASS_KEY = "ufo::last-class-name";

const isBrowser = typeof window !== "undefined";

function getStorage(): Storage | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// ---------- Fixed label map (Phase 7.1) ----------

export const LABEL_MAP = {
  version: "v1.0",
  categories: [
    { id: 1, name: "UFO" },
    { id: 2, name: "Minor UFO" },
    { id: 3, name: "Major UFO" },
    { id: 4, name: "Disruption" },
    { id: 5, name: "Marfe" },
    { id: 6, name: "Other Anomaly" }
  ]
} as const;

export const FIXED_CLASS_REG: Record<string, number> = Object.fromEntries(
  LABEL_MAP.categories.map((c) => [c.name.toLowerCase(), c.id])
);

// ---------- Types ----------

export type ProfileId = string;

export type Profile = {
  id: ProfileId;
  name: string;
};

export type ProfileMap = Record<ProfileId, Profile>;

export type ClassDef = {
  id: string;
  name: string;
  profileId?: ProfileId | null;
  color?: string;
};

export type ClassRegistry = Record<string, ClassDef>;

export type ClassCounts = Record<string, number>;

// ---------- JSON helpers ----------

function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------- Profiles ----------

export function loadProfiles(): ProfileMap {
  const storage = getStorage();
  if (!storage) return {};
  return safeParseJSON<ProfileMap>(storage.getItem(PROFILES_KEY)) ?? {};
}

export function saveProfiles(profiles: ProfileMap): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

// Ensure at least one default profile exists
export function ensureDefaultProfile(
  profiles: ProfileMap
): { profiles: ProfileMap; defaultId: ProfileId } {
  const ids = Object.keys(profiles);
  if (ids.length > 0) {
    return { profiles, defaultId: ids[0] };
  }

  const defaultId: ProfileId = "default";
  const next: ProfileMap = {
    [defaultId]: {
      id: defaultId,
      name: "Default"
    }
  };

  return { profiles: next, defaultId };
}

// ---------- Class Registry ----------

export function loadClassRegistry(): ClassRegistry {
  const storage = getStorage();
  if (!storage) return {};
  return safeParseJSON<ClassRegistry>(storage.getItem(CLASS_REG_KEY)) ?? {};
}

export function saveClassRegistry(registry: ClassRegistry): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(CLASS_REG_KEY, JSON.stringify(registry));
}

// ---------- Last class ----------

export function loadLastClassName(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(LAST_CLASS_KEY);
}

export function saveLastClassName(name: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (!name) {
    storage.removeItem(LAST_CLASS_KEY);
  } else {
    storage.setItem(LAST_CLASS_KEY, name);
  }
}

// ---------- Annotation helpers ----------

// Try to pull a class label from a W3C-style annotation.
export function extractClassLabelFromAnnotation(
  annotation: any
): string | null {
  if (!annotation) return null;

  const body = (annotation as any).body;
  if (!body) return null;

  const bodies = Array.isArray(body) ? body : [body];

  for (const b of bodies) {
    if (!b) continue;
    if (typeof b === "string" && b.trim()) {
      return b.trim();
    }
    if (typeof b === "object") {
      const value = (b as any).value ?? (b as any).label;
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  // Fallbacks: some structures store a label in properties
  const props = (annotation as any).properties;
  if (props) {
    const fromClass =
      typeof props.class === "string" ? props.class : undefined;
    const fromLabel =
      typeof props.label === "string" ? props.label : undefined;
    const candidate = fromClass ?? fromLabel;
    if (candidate && candidate.trim()) return candidate.trim();
  }

  return null;
}

// ---------- Cross-frame counts (chunked scanning) ----------

export function scanCrossFrameCountsChunked(options: {
  onUpdate: (counts: ClassCounts) => void;
  chunkSize?: number;
}): () => void {
  const storage = getStorage();
  if (!storage) return () => {};

  const keys = Object.keys(storage);
  const counts: ClassCounts = {};
  const chunkSize = options.chunkSize ?? 16;

  let index = 0;
  let cancelled = false;

  const step = () => {
    if (cancelled) return;

    const end = Math.min(index + chunkSize, keys.length);

    for (; index < end; index++) {
      const key = keys[index];
      const raw = storage.getItem(key);
      if (!raw) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      if (!Array.isArray(parsed)) continue;

      for (const ann of parsed as any[]) {
        const label = extractClassLabelFromAnnotation(ann);
        if (!label) continue;
        counts[label] = (counts[label] ?? 0) + 1;
      }
    }

    // Emit a copy – keeps React state updates cheap-ish
    options.onUpdate({ ...counts });

    if (index < keys.length) {
      // Yield back to the scheduler – avoids long blocking loops
      window.setTimeout(step, 0);
    }
  };

  // Kick off async scan
  window.setTimeout(step, 0);

  return () => {
    cancelled = true;
  };
}

/**
 * Class + track extractor for COCO export.
 *
 * Looks in annotation.body / annotation.bodies for:
 *   { purpose: "tagging" | "classifying",
 *     value: { type: "class", id, name, track_id?, instance? } }
 * and falls back to a plain string value as { class_name }.
 */
export function extractClassLabel(
  a: any
): { class_id?: number; class_name?: string; track_id?: string } | null {
  const collect = (src: any) => (Array.isArray(src) ? src : src ? [src] : []);
  const candidates = [...collect(a?.bodies), ...collect(a?.body)];

  for (const b of candidates) {
    if (b?.purpose && (b.purpose === "tagging" || b.purpose === "classifying")) {
      if (b?.value && typeof b.value === "object" && b.value.type === "class") {
        const trk =
          typeof b.value.track_id === "string" && b.value.track_id.length > 0
            ? b.value.track_id
            : typeof b.value.instance === "number"
            ? String(b.value.instance)
            : undefined;

        return {
          class_id: b.value.id,
          class_name: b.value.name,
          track_id: trk
        };
      }

      if (typeof b?.value === "string") {
        return { class_name: b.value };
      }
    }
  }

  return null;
}

/** -------------------- Track id helpers (Phase 8.1) -------------------- */

const ADJECTIVES = [
  "bright",
  "calm",
  "curious",
  "distant",
  "eager",
  "faint",
  "fast",
  "gentle",
  "ghostly",
  "glowing",
  "hidden",
  "icy",
  "lively",
  "lucky",
  "mellow",
  "mystic",
  "nimble",
  "quiet",
  "rapid",
  "shiny",
  "silent",
  "sly",
  "stealthy",
  "swift",
  "tiny",
  "wild",
  "young",
  "zealous",
  "ancient",
  "brave"
];

const NOUNS = [
  "comet",
  "signal",
  "flare",
  "shadow",
  "spark",
  "meteor",
  "photon",
  "plume",
  "echo",
  "nebula",
  "pattern",
  "speck",
  "glint",
  "trace",
  "whisper",
  "streak",
  "drift",
  "halo",
  "vortex",
  "wave",
  "pulse",
  "arc",
  "beam",
  "glow",
  "ripple",
  "stream",
  "trail",
  "blip",
  "sparkle",
  "cluster"
];

function randomReadableId(): string {
  const adjective =
    ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const digit = Math.floor(Math.random() * 9) + 1;
  return `${adjective} ${noun}-${digit}`;
}

/**
 * Track ID normalizer – slug-style:
 * - trim
 * - collapse whitespace to "-"
 * - replace non [a-zA-Z0-9._-] with "-"
 * - lowercase
 */
export function canonicalizeTrackId(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

/**
 * Generate a readable, unique track_id like "silent comet-3" that does not
 * collide (after canonicalization) with any of the existing track IDs.
 *
 * Pure string helper: callers pass an array of existing track_id strings.
 */
export function uniqueReadableId(existingTrackIds: string[]): string {
  const used = new Set(existingTrackIds.map((id) => canonicalizeTrackId(id)));
  let candidate = randomReadableId();
  let guard = 0;

  while (used.has(canonicalizeTrackId(candidate)) && guard++ < 50) {
    candidate = randomReadableId();
  }

  return candidate;
}

/**
 * Write / update a W3C class body including track_id on both body & bodies.
 */
export function writeClassAndTrack(
  a: any,
  cls: { id: number; name: string },
  track_id: string
): any {
  const classBody = () => ({
    purpose: "tagging",
    value: { type: "class", id: cls.id, name: cls.name, track_id }
  });

  const arr = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);

  const patch = (list: any[]) => {
    let found = false;

    const mapped = list.map((b) => {
      if (b?.purpose && (b.purpose === "tagging" || b.purpose === "classifying")) {
        if (b?.value && typeof b.value === "object" && b.value.type === "class") {
          found = true;
          return {
            ...b,
            value: {
              ...b.value,
              id: cls.id,
              name: cls.name,
              track_id
            }
          };
        }

        if (typeof b?.value === "string") {
          found = true;
          return {
            ...b,
            value: {
              type: "class",
              id: cls.id,
              name: cls.name,
              track_id
            }
          };
        }
      }
      return b;
    });

    return { mapped, found };
  };

  const bodiesIn = arr(a?.bodies);
  const bodyIn = arr(a?.body);

  const pb = patch(bodiesIn);
  const p = patch(bodyIn);

  const bodiesOut = [...pb.mapped];
  const bodyOut = [...p.mapped];

  // If no existing class body was found, append one to both body & bodies
  if (!pb.found && !p.found) {
    const cb = classBody();
    bodiesOut.push(cb);
    bodyOut.push(cb);
  }

  return {
    ...a,
    bodies: bodiesOut,
    body: bodyOut
  };
}

/**
 * Write / update a W3C class body without track_id (detection mode).
 */
export function writeClassOnly(a: any, cls: { id: number; name: string }): any {
  const classBody = () => ({
    purpose: "tagging",
    value: { type: "class", id: cls.id, name: cls.name }
  });

  const arr = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);

  let found = false;

  const patch = (list: any[]) =>
    list.map((b) => {
      if (b?.purpose && (b.purpose === "tagging" || b.purpose === "classifying")) {
        if (b?.value && typeof b.value === "object" && b.value.type === "class") {
          found = true;
          const { id, name } = b.value;
          return {
            ...b,
            value: {
              type: "class",
              id: cls.id ?? id,
              name: cls.name ?? name
            }
          };
        }

        if (typeof b?.value === "string") {
          found = true;
          return {
            ...b,
            value: { type: "class", id: cls.id, name: cls.name }
          };
        }
      }
      return b;
    });

  const bodiesOut = patch(arr(a?.bodies));
  const bodyOut = patch(arr(a?.body));

  if (!found) {
    const cb = classBody();
    bodiesOut.push(cb);
    bodyOut.push(cb);
  }

  return {
    ...a,
    bodies: bodiesOut,
    body: bodyOut
  };
}

/**
 * Mode-aware normalization.
 *
 * For now we only support **detection mode** (includeTrackIds = false):
 *
 * - If an annotation ID already exists in knownById, we copy its previous
 *   class label forward (class_id + class_name) via writeClassOnly.
 * - Else, if getSelectedClassName() returns a class name, we look up its
 *   numeric ID from the classRegistry (if present) or FIXED_CLASS_REG,
 *   and stamp that onto the annotation via writeClassOnly.
 *
 * This gives:
 * - New rectangles inherit whatever class you have selected in the toolbar.
 * - Edits keep their existing class label, even if you change the toolbar.
 */
export function normalizeWithMode(
  rawList: ImageAnnotation[],
  knownById: Record<string, ImageAnnotation>,
  _getSelectedProfile: () => string | null,
  getSelectedClassName: () => string | null,
  includeTrackIds: boolean,
  classRegistry: ClassRegistry
): ImageAnnotation[] {
  // Tracking mode not wired up in this branch yet – just passthrough.
  // FrameView always calls this with includeTrackIds = false for now.
  if (includeTrackIds) {
    return rawList;
  }

  const out: ImageAnnotation[] = [];

  for (const a of rawList) {
    const id = (a as any).id as string | undefined;
    const seen = id ? knownById[id] : undefined;
    let next = a;

    // --- 1) Existing annotation: keep its previous class label stable ---
    if (seen) {
      const prev = extractClassLabel(seen);
      if (prev?.class_name && typeof prev.class_id === "number") {
        next = writeClassOnly(next, {
          id: prev.class_id,
          name: prev.class_name
        });
      }
      out.push(next);
      continue;
    }

    // --- 2) New annotation: inherit current toolbar class, if any ---
    const selected = getSelectedClassName();
    if (selected) {
      const keyLower = selected.toLowerCase();

      // Our new ClassRegistry stores defs like { id: string, name: string, ... }
      const fromRegistryLower = classRegistry[keyLower];
      const fromRegistryExact = classRegistry[selected];

      const regIdStr =
        fromRegistryLower?.id ??
        fromRegistryExact?.id ??
        undefined;

      const regId =
        regIdStr !== undefined ? Number(regIdStr) : undefined;

      // Fallback to fixed map if registry doesn't have it
      const fixedId =
        FIXED_CLASS_REG[selected] ?? FIXED_CLASS_REG[keyLower];

      const finalId =
        (typeof regId === "number" && !Number.isNaN(regId)
          ? regId
          : undefined) ??
        (typeof fixedId === "number" ? fixedId : undefined) ??
        1;

      // Stamp the selected class onto the new rectangle
      next = writeClassOnly(next, {
        id: finalId,
        // Keep the human-facing label as selected (e.g. "UFO", "Minor UFO", "Marfe")
        name: selected
      });
    }

    out.push(next);
  }

  return out;
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
        height: Math.round(h)
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
        height: Math.round(geometry.h)
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
        height: Math.round(bounds.maxY - bounds.minY)
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
          Math.round(bounds.maxY - bounds.minY)
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
          )
        ] as [number, number, number, number]);
    return { segmentation: [flat], bbox };
  }

  // SVG <polygon> selector string
  if (typeof selector.value === "string" && /<polygon/i.test(selector.value)) {
    const match = selector.value.match(/points\s*=\s*["']([^"']+)["']/i);
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
          Math.round(Math.max(...ys) - Math.min(...ys))
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
    instance: track_numeric ?? undefined
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
        track_id: b.track_id || undefined
      });
    }
  }

  return out;
}
