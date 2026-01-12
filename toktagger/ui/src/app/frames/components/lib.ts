"use client";

import type { ImageAnnotation } from "@annotorious/react";
import { buildSourceKey } from "./adapters";

/**
 * Shared helpers for:
 * - Profiles & class registry (toolbar state)
 * - Cross-frame / per-instance usage counts
 * - Track ID utilities
 * - W3C ↔ COCO / backend format conversions
 */

// lib.ts – Profiles, Classes, Cross-frame counts

export const PROFILES_KEY = "ufo::profiles";
export const CLASS_REG_KEY = "ufo::class-registry";
export const LAST_CLASS_KEY = "ufo::last-class-name";

export const INSTANCE_SEED_PREFIX = "anno::instance-seed::";

const isBrowser = typeof window !== "undefined";

function getStorage(): Storage | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

function getString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function getNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---------- Fixed label map for UFO categories ----------

export const LABEL_MAP = {
  version: "v1.0",
  categories: [
    { id: 1, name: "UFO" },
    { id: 2, name: "Minor UFO" },
    { id: 3, name: "Major UFO" },
    { id: 4, name: "Disruption" },
    { id: 5, name: "Marfe" },
    { id: 6, name: "Other Anomaly" },
  ],
} as const;

export const FIXED_CLASS_REG: Record<string, number> = Object.fromEntries(
  LABEL_MAP.categories.map((c) => [c.name.toLowerCase(), c.id]),
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

// Per-instance usage counts, keyed as
// `${class_name.toLowerCase()}:${canonicalizeTrackId(track_id)}`
export type InstanceCounts = Record<string, number>;

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
export function ensureDefaultProfile(profiles: ProfileMap): {
  profiles: ProfileMap;
  defaultId: ProfileId;
} {
  const ids = Object.keys(profiles);
  if (ids.length > 0) {
    return { profiles, defaultId: ids[0] };
  }

  const defaultId: ProfileId = "default";
  const next: ProfileMap = {
    [defaultId]: {
      id: defaultId,
      name: "Default",
    },
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

// Try to pull a human-readable class label from a W3C-style annotation.
export function extractClassLabelFromAnnotation(
  annotation: unknown,
): string | null {
  if (!annotation || !isRecord(annotation)) return null;

  const body = annotation.body;
  if (!body) return null;

  const bodies = asArray(body);

  for (const b of bodies) {
    if (!b) continue;

    if (typeof b === "string") {
      const s = b.trim();
      if (s) return s;
      continue;
    }

    if (isRecord(b)) {
      const value = b.value ?? b.label;
      if (typeof value === "string") {
        const s = value.trim();
        if (s) return s;
      }
    }
  }

  // Fallbacks: some structures store a label in properties
  const props = annotation.properties;
  if (isRecord(props)) {
    const fromClass = typeof props.class === "string" ? props.class : undefined;
    const fromLabel = typeof props.label === "string" ? props.label : undefined;
    const candidate = fromClass ?? fromLabel;
    if (candidate && candidate.trim()) return candidate.trim();
  }

  return null;
}

// ---------- Cross-frame counts (chunked scanning) ----------

/**
 * Scan all localStorage keys in small chunks and compute class usage counts,
 * calling onUpdate(counts) after each chunk.
 *
 * Returns a cancel function to stop the scan early.
 */
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

      for (const ann of parsed) {
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
 * Chunked per-instance counts scanner.
 *
 * key: `${class_name.toLowerCase()}:${canonicalizeTrackId(track_id)}`
 *
 * Filters localStorage keys by an optional keyPrefix and updates
 * counts incrementally via onUpdate(counts).
 */
export function scanInstanceCountsChunked(options: {
  keyPrefix?: string; // e.g. "anno::w3c::app://p/<proj>/s/<sample>/"
  onUpdate: (counts: InstanceCounts) => void;
  chunkSize?: number;
}): () => void {
  const storage = getStorage();
  if (!storage) return () => {};

  const allKeys = Object.keys(storage);
  const prefix = options.keyPrefix;
  const keys = prefix ? allKeys.filter((k) => k.startsWith(prefix)) : allKeys;

  const counts: InstanceCounts = {};
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

      for (const ann of parsed) {
        const label = extractClassLabel(ann);
        if (!label?.class_name || !label.track_id) continue;

        const cname = label.class_name.toLowerCase();
        const tid = canonicalizeTrackId(label.track_id);
        const instKey = `${cname}:${tid}`;

        counts[instKey] = (counts[instKey] ?? 0) + 1;
      }
    }

    options.onUpdate({ ...counts });

    if (index < keys.length) {
      window.setTimeout(step, 0);
    }
  };

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
  a: unknown,
): { class_id?: number; class_name?: string; track_id?: string } | null {
  if (!a || !isRecord(a)) return null;

  const candidates = [...asArray(a.bodies), ...asArray(a.body)];

  for (const b of candidates) {
    if (!isRecord(b)) continue;

    const purpose = getString(b.purpose);
    if (purpose !== "tagging" && purpose !== "classifying") continue;

    const v = b.value;

    if (isRecord(v) && v.type === "class") {
      const id = getNumber(v.id) ?? undefined;
      const name = getString(v.name) ?? undefined;

      const track_id =
        (typeof v.track_id === "string" && v.track_id.length > 0
          ? v.track_id
          : typeof v.instance === "number"
            ? String(v.instance)
            : undefined) ?? undefined;

      return { class_id: id, class_name: name, track_id };
    }

    if (typeof v === "string") {
      return { class_name: v };
    }
  }

  return null;
}

/** -------------------- Track id helpers -------------------- */

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
  "brave",
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
  "cluster",
];

function randomReadableId(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
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

export function nextNumericTrackId(
  className: string,
  existingTrackIds: string[],
): string {
  const storage = getStorage();
  const key = `${INSTANCE_SEED_PREFIX}${className.toLowerCase()}`;

  const used = new Set(
    (existingTrackIds || []).map((id) => canonicalizeTrackId(String(id))),
  );

  let seed = 0;
  if (storage) {
    const raw = storage.getItem(key);
    const n = raw ? Number(raw) : 0;
    seed = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  let candidate = seed + 1;
  let guard = 0;
  while (used.has(String(candidate)) && guard++ < 10000) candidate++;

  if (storage) storage.setItem(key, String(candidate));
  return String(candidate);
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
  a: ImageAnnotation,
  cls: { id: number; name: string },
  track_id: string,
): ImageAnnotation {
  const classBody = () => ({
    purpose: "tagging",
    value: { type: "class", id: cls.id, name: cls.name, track_id },
  });

  const patch = (list: unknown[]) => {
    let found = false;

    const mapped = list.map((b) => {
      if (!isRecord(b)) return b;

      const purpose = getString(b.purpose);
      if (purpose !== "tagging" && purpose !== "classifying") return b;

      const v = b.value;

      if (isRecord(v) && v.type === "class") {
        found = true;
        return {
          ...b,
          value: { ...v, id: cls.id, name: cls.name, track_id },
        };
      }

      if (typeof v === "string") {
        found = true;
        return {
          ...b,
          value: { type: "class", id: cls.id, name: cls.name, track_id },
        };
      }

      return b;
    });

    return { mapped, found };
  };

  // Treat body/bodies as unknown payloads, but avoid casting the whole annotation.
  const bodiesIn = asArray((a as unknown as { bodies?: unknown }).bodies);
  const bodyIn = asArray((a as unknown as { body?: unknown }).body);

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
    body: bodyOut,
  };
}

/**
 * Write / update a W3C class body without track_id (detection mode).
 */
export function writeClassOnly(
  a: ImageAnnotation,
  cls: { id: number; name: string },
): ImageAnnotation {
  const classBody = () => ({
    purpose: "tagging",
    value: { type: "class", id: cls.id, name: cls.name },
  });

  let found = false;

  const patch = (list: unknown[]) =>
    list.map((b) => {
      if (!isRecord(b)) return b;

      const purpose = getString(b.purpose);
      if (purpose !== "tagging" && purpose !== "classifying") return b;

      const v = b.value;

      if (isRecord(v) && v.type === "class") {
        found = true;
        return { ...b, value: { ...v, id: cls.id, name: cls.name } };
      }

      if (typeof v === "string") {
        found = true;
        return { ...b, value: { type: "class", id: cls.id, name: cls.name } };
      }

      return b;
    });

  const bodiesOut = patch(asArray((a as unknown as UnknownRecord).bodies));
  const bodyOut = patch(asArray((a as unknown as UnknownRecord).body));

  if (!found) {
    const cb = classBody();
    bodiesOut.push(cb);
    bodyOut.push(cb);
  }

  return {
    ...(a as unknown as UnknownRecord),
    bodies: bodiesOut,
    body: bodyOut,
  } as ImageAnnotation;
}

/**
 * Mode-aware normalization.
 *
 * TRACKING MODE (includeTrackIds = true)
 *
 * - For existing rectangles (id in knownById):
 *   If they lost class/track info due to editing, restore from the previous label.
 *
 * - For new rectangles (id not in knownById):
 *   If there is a selected profile, stamp its { class_id, class_name, track_id }
 *   using writeClassAndTrack.
 *
 * DETECTION MODE (includeTrackIds = false)
 *
 * - If an annotation ID already exists in knownById, we copy its previous
 *   class label forward (class_id + class_name) via writeClassOnly.
 * - Else, if getSelectedClassName() returns a class name, we look up its
 *   numeric ID from the classRegistry (if present) or FIXED_CLASS_REG,
 *   and stamp that onto the annotation via writeClassOnly.
 */
type SelectedProfile = {
  class_id?: number;
  class_name?: string;
  track_id?: string;
} | null;

export function normalizeWithMode(
  rawList: ImageAnnotation[],
  knownById: Record<string, ImageAnnotation>,
  getSelectedProfile: () => SelectedProfile,
  getSelectedClassName: () => string | null,
  includeTrackIds: boolean,
  classRegistry: ClassRegistry,
): ImageAnnotation[] {
  if (includeTrackIds) {
    const out: ImageAnnotation[] = [];

    for (const a of rawList) {
      const seen = knownById[a.id];
      let next = a;

      if (seen) {
        const prev = extractClassLabel(seen) ?? {};
        const hasNow = extractClassLabel(next) ?? {};

        const missing =
          !hasNow.class_name ||
          typeof hasNow.class_id !== "number" ||
          !(typeof hasNow.track_id === "string" && hasNow.track_id.length > 0);

        if (
          missing &&
          prev.class_name &&
          typeof prev.class_id === "number" &&
          typeof prev.track_id === "string" &&
          prev.track_id.length > 0
        ) {
          next = writeClassAndTrack(
            next,
            { id: prev.class_id, name: prev.class_name },
            prev.track_id,
          );
        }

        out.push(next);
        continue;
      }

      const selected = getSelectedProfile?.();

      if (
        selected &&
        typeof selected.class_id === "number" &&
        selected.class_name &&
        typeof selected.track_id === "string" &&
        selected.track_id.length > 0
      ) {
        next = writeClassAndTrack(
          next,
          { id: selected.class_id, name: selected.class_name },
          selected.track_id,
        );
      }

      out.push(next);
    }

    return out;
  }

  const out: ImageAnnotation[] = [];

  for (const a of rawList) {
    const seen = knownById[a.id];
    let next = a;

    if (seen) {
      const prev = extractClassLabel(seen);
      if (prev?.class_name && typeof prev.class_id === "number") {
        next = writeClassOnly(next, {
          id: prev.class_id,
          name: prev.class_name,
        });
      }
      out.push(next);
      continue;
    }

    const selected = getSelectedClassName();
    if (selected) {
      const keyLower = selected.toLowerCase();

      const fromRegistryLower = classRegistry[keyLower];
      const fromRegistryExact = classRegistry[selected];

      const regIdStr =
        fromRegistryLower?.id ?? fromRegistryExact?.id ?? undefined;
      const regId = regIdStr !== undefined ? Number(regIdStr) : undefined;

      const fixedId = FIXED_CLASS_REG[selected] ?? FIXED_CLASS_REG[keyLower];

      const finalId =
        (typeof regId === "number" && !Number.isNaN(regId)
          ? regId
          : undefined) ??
        (typeof fixedId === "number" ? fixedId : undefined) ??
        1;

      next = writeClassOnly(next, { id: finalId, name: selected });
    }

    out.push(next);
  }

  return out;
}

/** ---------- COCO types + converters ---------- */

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

/** Simple helper: get width/height in pixels from a rectangle annotation. */
export function rectToDims(a: unknown): SelSize | null {
  const box = rectToCoco(a);
  if (!box) return null;
  return { w: box.width, h: box.height };
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function isBounds(v: unknown): v is Bounds {
  return (
    isRecord(v) &&
    typeof v.minX === "number" &&
    typeof v.minY === "number" &&
    typeof v.maxX === "number" &&
    typeof v.maxY === "number"
  );
}

export function rectToCoco(a: unknown, naturalSize?: SelSize): CocoBBox | null {
  if (!isRecord(a)) return null;

  const target = isRecord(a.target) ? a.target : null;
  const selector = target && isRecord(target.selector) ? target.selector : null;
  if (!selector) return null;

  const selValue = getString(selector.value);
  if (selValue) {
    const match = selValue.match(
      /xywh=(pixel|percent):([\d.]+),([\d.]+),([\d.]+),([\d.]+)/i,
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

  if (selector.type === "RECTANGLE") {
    const geometry = isRecord(selector.geometry) ? selector.geometry : null;

    const x = geometry ? getNumber(geometry.x) : null;
    const y = geometry ? getNumber(geometry.y) : null;
    const w = geometry ? getNumber(geometry.w) : null;
    const h = geometry ? getNumber(geometry.h) : null;

    if (x != null && y != null && w != null && h != null) {
      return {
        x_min: Math.round(x),
        y_min: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
      };
    }

    const bounds = geometry ? geometry.bounds : null;
    if (isBounds(bounds)) {
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

export function polyToCoco(a: unknown): CocoPolygon | null {
  if (!isRecord(a)) return null;

  const target = isRecord(a.target) ? a.target : null;
  const selector = target && isRecord(target.selector) ? target.selector : null;
  if (!selector) return null;

  if (selector.type === "POLYGON") {
    const geom = isRecord(selector.geometry) ? selector.geometry : null;
    const points = geom && Array.isArray(geom.points) ? geom.points : null;

    if (points && points.length) {
      const coords: number[][] = points
        .map((p) => (Array.isArray(p) ? p : []))
        .filter(
          (p) =>
            p.length === 2 &&
            typeof p[0] === "number" &&
            typeof p[1] === "number",
        ) as number[][];

      if (coords.length < 3) return null;

      const flat = coords.flatMap(([x, y]) => [Math.round(x), Math.round(y)]);

      const bounds = geom ? geom.bounds : null;
      const bbox: [number, number, number, number] = isBounds(bounds)
        ? [
            Math.round(bounds.minX),
            Math.round(bounds.minY),
            Math.round(bounds.maxX - bounds.minX),
            Math.round(bounds.maxY - bounds.minY),
          ]
        : ([
            Math.round(Math.min(...coords.map((p) => p[0]))),
            Math.round(Math.min(...coords.map((p) => p[1]))),
            Math.round(
              Math.max(...coords.map((p) => p[0])) -
                Math.min(...coords.map((p) => p[0])),
            ),
            Math.round(
              Math.max(...coords.map((p) => p[1])) -
                Math.min(...coords.map((p) => p[1])),
            ),
          ] as [number, number, number, number]);

      return { segmentation: [flat], bbox };
    }
  }

  const selValue = getString(selector.value);
  if (selValue && /<polygon/i.test(selValue)) {
    const match = selValue.match(/points\s*=\s*["']([^"']+)["']/i);
    if (match) {
      const coords = match[1]
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(/[,\s]+/).map(Number))
        .filter(
          (p) =>
            p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
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
 */
export function augmentLabelForExport(a: unknown, includeTracks: boolean) {
  const label = extractClassLabel(a) ?? {};

  if (!includeTracks) {
    return { class_id: label.class_id, class_name: label.class_name };
  }

  const track_numeric = numericFromTrackId(label.track_id);
  return {
    ...label,
    track_numeric: track_numeric ?? undefined,
    instance: track_numeric ?? undefined,
  };
}

export function w3cToCocoFrames(
  list: ImageAnnotation[],
  includeTracks = true,
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

  return Object.values(byFrame).sort((a, b) => a.frame - b.frame);
}

/** ---------- Rectangles-only adapter to backend VideoBoundingBox format ---------- */

export type VideoBoundingBox = {
  type: "video_bounding_box";
  created_by: string; // ideally a union of allowed values
  validated: boolean;
  uncertainty: number;
  label: string;
  height: number;
  width: number;
  x_min: number;
  y_min: number;
  frame: number;
  track_id: string;
};

export function cocoFramesToVideoBBoxes(coco: unknown): VideoBoundingBox[] {
  const out: VideoBoundingBox[] = [];
  if (!Array.isArray(coco)) return out;

  for (const frameEntry of coco) {
    if (!isRecord(frameEntry)) continue;

    const frameIndex =
      typeof frameEntry.frame === "number" ? frameEntry.frame | 0 : 0;
    const bboxes = Array.isArray(frameEntry.bboxes) ? frameEntry.bboxes : [];

    for (const b of bboxes) {
      if (!isRecord(b)) continue;

      const x = Math.round((typeof b.x_min === "number" ? b.x_min : 0) ?? 0);
      const y = Math.round((typeof b.y_min === "number" ? b.y_min : 0) ?? 0);
      const width = Math.round(
        (typeof b.width === "number" ? b.width : 0) ?? 0,
      );
      const height = Math.round(
        (typeof b.height === "number" ? b.height : 0) ?? 0,
      );
      if (width <= 0 || height <= 0) continue;

      const class_name =
        typeof b.class_name === "string" ? b.class_name : undefined;
      const class_id = typeof b.class_id === "number" ? b.class_id : undefined;

      const labelValue =
        class_name ??
        (typeof class_id === "number" ? String(class_id) : "unknown");

      const tid = typeof b.track_id === "string" ? b.track_id : "";
      if (!tid) continue;

      out.push({
        type: "video_bounding_box",
        created_by: "manual",
        validated: true,
        uncertainty: 0,
        label: String(labelValue),
        height,
        width,
        x_min: x,
        y_min: y,
        frame: frameIndex,
        track_id: tid,
      });
    }
  }

  return out;
}

// If your backend Annotation[] is a union, we guard it.
function isVideoBoundingBox(a: unknown): a is VideoBoundingBox {
  if (!a || typeof a !== "object") return false;

  const v = a as Record<string, unknown>;

  return (
    v.type === "video_bounding_box" &&
    typeof v.frame === "number" &&
    typeof v.x_min === "number" &&
    typeof v.y_min === "number" &&
    typeof v.width === "number" &&
    typeof v.height === "number" &&
    typeof v.label === "string" &&
    typeof v.track_id === "string"
  );
}

function inferClassId(label: string): number {
  const key = label.toLowerCase().trim();
  const fixed = FIXED_CLASS_REG[key];
  if (typeof fixed === "number") return fixed;

  const asNum = Number(label);
  if (Number.isFinite(asNum)) return asNum;

  return 1;
}
export function videoBBoxesToW3CByFrame(opts: {
  projectId: string;
  sampleId: string;
  annotations: unknown[];
}): Map<number, ImageAnnotation[]> {
  const { projectId, sampleId, annotations } = opts;

  const byFrame = new Map<number, ImageAnnotation[]>();

  const list = Array.isArray(annotations) ? annotations : [];
  let i = 0;

  for (const raw of list) {
    if (!isVideoBoundingBox(raw)) continue;

    const frame = raw.frame | 0;
    const x = Math.round(raw.x_min);
    const y = Math.round(raw.y_min);
    const w = Math.round(raw.width);
    const h = Math.round(raw.height);
    if (w <= 0 || h <= 0) continue;

    const class_name = raw.label;
    const class_id = inferClassId(class_name);
    const track_id = canonicalizeTrackId(raw.track_id);

    const source = buildSourceKey({ projectId, sampleId, frame });

    // Deterministic-ish id so edits/deletes behave predictably after reload
    const id = `db-${frame}-${track_id}-${x}-${y}-${w}-${h}-${i++}`;

    const anno = {
      id,
      target: {
        source,
        selector: {
          type: "RECTANGLE",
          geometry: {
            x,
            y,
            w,
            h,
            bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
          },
        },
      },
      bodies: [
        {
          purpose: "tagging",
          value: { type: "class", id: class_id, name: class_name, track_id },
        },
      ],
      body: [
        {
          purpose: "tagging",
          value: { type: "class", id: class_id, name: class_name, track_id },
        },
      ],
    } as unknown as ImageAnnotation;

    const cur = byFrame.get(frame) ?? [];
    cur.push(anno);
    byFrame.set(frame, cur);
  }

  return byFrame;
}
