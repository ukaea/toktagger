"use client";

import type { ImageAnnotation, AnnotationBody } from "@annotorious/react";
import { buildSourceKey } from "./adapters";

/**
 * Shared helpers for the video/frame annotation tooling:
 * - LocalStorage keys shared between toolbar + FrameView/AnnoBridge
 * - Track-id / instance-id helpers
 * - Chunked scanners (counts across frames)
 * - W3C (Annotorious) ↔ COCO frame structure ↔ backend VideoBoundingBox conversion
 *
 */

// ------------------------------
// LocalStorage keys 
// ------------------------------

// Persisted toolbar "profiles" 
export const PROFILES_KEY = "ufo::profiles";

// Persisted class registry (name -> id mapping) shared with toolbar
export const CLASS_REG_KEY = "ufo::class-registry";

// Last class selected in the toolbar (used to re-arm selection on reload)
export const LAST_CLASS_KEY = "ufo::last-class-name";

// Per-class numeric seed used to allocate stable instance IDs across frames
export const INSTANCE_SEED_PREFIX = "anno::instance-seed::";

// We only touch localStorage in the browser runtime.
const isBrowser = typeof window !== "undefined";

/** Safely acquire localStorage without throwing in restricted contexts. */
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

/** Normalize "maybe array" values into arrays for uniform iteration. */
function asArray<T>(v: T | T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

function getString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function getNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ------------------------------
// Fixed label map used by the video tool
// ------------------------------

/**
 * Fixed label list used by the video annotation UI.
 */
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

/** Lowercased name -> numeric id lookup for quick fallback. */
export const FIXED_CLASS_REG: Record<string, number> = Object.fromEntries(
  LABEL_MAP.categories.map((c) => [c.name.toLowerCase(), c.id]),
);

// ------------------------------
// Types used by toolbar + frame view
// ------------------------------

export type ProfileId = string;

export type Profile = {
  id: ProfileId;
  name: string;
};

export type ProfileMap = Record<ProfileId, Profile>;

/**
 * Class registry entry (stored in localStorage):
 * key is usually lowercased class name -> { id, name }.
 */
export type ClassDef = {
  id: string;
  name: string;
  profileId?: ProfileId | null;
  color?: string;
};

export type ClassRegistry = Record<string, ClassDef>;

export type ClassCounts = Record<string, number>;

/**
 * Per-instance usage counts, keyed as:
 *   `${class_name.toLowerCase()}:${canonicalizeTrackId(track_id)}`
 *
 * This is the key the toolbar uses to render per-instance badge counts.
 */
export type InstanceCounts = Record<string, number>;

/**
 * Our structured "class" payload stored inside W3C annotation bodies.
 * We encode this payload as JSON (string) for Annotorious bodies, but accept
 * legacy "object payload" too for back-compat.
 */
type ClassValuePayload = {
  type: "class";
  id: number;
  name: string;
  track_id?: string;
};

// ------------------------------
// JSON encode/decode helpers for body.value
// ------------------------------

/** Safe JSON.parse that returns null instead of throwing. */
function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Encode our structured class payload as a JSON string. */
function encodeClassValue(v: ClassValuePayload): string {
  return JSON.stringify(v);
}

/**
 * Decode structured class payload.
 * - New format: JSON string (preferred)
 * - Legacy format: object stored directly
 * - Otherwise: null (caller may treat the value as a plain label string)
 */
function decodeClassValue(v: unknown): ClassValuePayload | null {
  // Back-compat: older annotations may have stored the object directly
  if (isRecord(v) && v.type === "class") {
    const id = getNumber(v.id);
    const name = getString(v.name);
    const track_id = getString(v.track_id) ?? undefined;
    if (id != null && name) return { type: "class", id, name, track_id };
    return null;
  }

  if (typeof v !== "string") return null;

  // New format: JSON string
  try {
    const parsed: unknown = JSON.parse(v);
    if (isRecord(parsed) && parsed.type === "class") {
      const id = getNumber(parsed.id);
      const name = getString(parsed.name);
      const track_id = getString(parsed.track_id) ?? undefined;
      if (id != null && name) return { type: "class", id, name, track_id };
    }
  } catch {
    // Not JSON -> treat as plain label elsewhere
  }

  return null;
}

// ------------------------------
// Profiles
// ------------------------------

/** Read the stored profile map (or {} if none). */
export function loadProfiles(): ProfileMap {
  const storage = getStorage();
  if (!storage) return {};
  return safeParseJSON<ProfileMap>(storage.getItem(PROFILES_KEY)) ?? {};
}

/** Persist profile map to localStorage. */
export function saveProfiles(profiles: ProfileMap): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

/**
 * Ensure we always have at least one profile so UI code can assume a "default".
 */
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

// ------------------------------
// Class Registry (toolbar ↔ frame view shared state)
// ------------------------------

/** Read class registry from localStorage (or {} if none). */
export function loadClassRegistry(): ClassRegistry {
  const storage = getStorage();
  if (!storage) return {};
  return safeParseJSON<ClassRegistry>(storage.getItem(CLASS_REG_KEY)) ?? {};
}

/** Persist class registry to localStorage. */
export function saveClassRegistry(registry: ClassRegistry): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(CLASS_REG_KEY, JSON.stringify(registry));
}

// ------------------------------
// Last class selection (re-arm on reload)
// ------------------------------

/** Load last class selected in toolbar. */
export function loadLastClassName(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(LAST_CLASS_KEY);
}

/** Save last class selected (or clear when null/empty). */
export function saveLastClassName(name: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (!name) {
    storage.removeItem(LAST_CLASS_KEY);
  } else {
    storage.setItem(LAST_CLASS_KEY, name);
  }
}

// ------------------------------
// W3C annotation shape helpers
// ------------------------------

/**
 * Extract W3C target.source from a W3C annotation-like object.
 * We use target.source to infer the frame number (app://.../f/<n>).
 */
function getTargetSource(a: unknown): string | null {
  if (!isRecord(a)) return null;

  const target = (a as UnknownRecord).target;
  if (!isRecord(target)) return null;

  // W3C target.source is commonly a string
  return getString((target as UnknownRecord).source);
}

/**
 * Create an AnnotationBody id.
 * Not cryptographically unique; enough for local diffs / UI usage.
 */
function makeBodyId(aid: string): string {
  // deterministic-ish, avoids randomness, good for diffs
  return `b-${aid}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a tagging body containing our JSON-encoded class payload.
 * This is the preferred representation in Annotorious `bodies`.
 */
function makeClassBody(
  annotationId: string,
  payload: ClassValuePayload,
): AnnotationBody {
  return {
    id: makeBodyId(annotationId),
    annotation: annotationId,
    purpose: "tagging",
    value: encodeClassValue(payload),
  };
}

// ------------------------------
// Label extraction
// ------------------------------

/**
 * Try to pull a human-readable class label from a W3C-style annotation.
 * Used by "cross-frame counts" utilities that don't care about track_id.
 */
export function extractClassLabelFromAnnotation(
  annotation: unknown,
): string | null {
  if (!annotation || !isRecord(annotation)) return null;

  const body = (annotation as UnknownRecord).body;
  if (!body) return null;

  const bodies = asArray(body);

  for (const b of bodies) {
    if (!b) continue;

    // If the body itself is a string, it could be:
    // - a plain label ("UFO")
    // - a JSON string of our structured class payload
    if (typeof b === "string") {
      const parsed = decodeClassValue(b);
      if (parsed?.name) return parsed.name;

      const s = b.trim();
      if (s) return s;
      continue;
    }

    // If the body is an object, check common fields
    if (isRecord(b)) {
      const value = (b as UnknownRecord).value ?? (b as UnknownRecord).label;

      // `value` can be:
      // - a plain string label
      // - a JSON string payload
      // - (legacy) a structured object payload
      const parsed = decodeClassValue(value);
      if (parsed?.name) return parsed.name;

      if (typeof value === "string") {
        const s = value.trim();
        if (s) return s;
      }
    }
  }

  // Fallbacks: some structures store a label in properties
  const props = (annotation as UnknownRecord).properties;
  if (isRecord(props)) {
    const fromClass =
      typeof (props as UnknownRecord).class === "string"
        ? ((props as UnknownRecord).class as string)
        : undefined;

    const fromLabel =
      typeof (props as UnknownRecord).label === "string"
        ? ((props as UnknownRecord).label as string)
        : undefined;

    const candidate = fromClass ?? fromLabel;
    if (candidate && candidate.trim()) return candidate.trim();
  }

  return null;
}

// ------------------------------
// Cross-frame counts (chunked scanning)
// ------------------------------

/**
 * Scan all localStorage keys in small chunks and compute class usage counts.
 *
 * Why chunked?
 * - localStorage can contain many frames; scanning everything synchronously
 *   would block the main thread and freeze the UI.
 *
 * Returns:
 * - a cancel function to stop the scan early.
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

      // Our per-frame stores are JSON arrays of ImageAnnotation
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
 * This is the scanner used by the toolbar to show "how many annotations exist"
 * for each instance across all frames in a sample.
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
        // extractClassLabel gives { class_name, class_id, track_id } when present
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

// ------------------------------
// Class + track extraction (used for export/save)
// ------------------------------

/**
 * Extract class_id/class_name/track_id from an annotation.
 *
 * This is the "source of truth" used by:
 * - export conversion (W3C -> COCO frames)
 * - per-instance counts
 *
 * It supports:
 * - Annotorious `bodies` (preferred)
 * - custom legacy `body` field used by older storage
 */
export function extractClassLabel(
  a: unknown,
): { class_id?: number; class_name?: string; track_id?: string } | null {
  if (!a || !isRecord(a)) return null;

  const aRec = a as UnknownRecord;

  const candidates = [
    ...asArray(aRec.bodies),
    ...asArray(aRec.body), // custom/back-compat field (not on ImageAnnotation type)
  ];

  for (const b of candidates) {
    if (!isRecord(b)) continue;

    const bRec = b as UnknownRecord;

    const purpose = getString(bRec.purpose);
    if (purpose !== "tagging" && purpose !== "classifying") continue;

    const v = bRec.value;

    // Preferred: decode structured class payload (JSON string or legacy object)
    const parsed = decodeClassValue(v);
    if (parsed) {
      return {
        class_id: parsed.id,
        class_name: parsed.name,
        track_id: parsed.track_id,
      };
    }

    // Fallback: if value is a plain string, treat it as just the class name
    if (typeof v === "string") {
      return { class_name: v };
    }
  }

  return null;
}

// ------------------------------
// Track id helpers (instance identity across frames)
// ------------------------------

/**
 * Track ids are the per-instance identity:
 * - the same object across multiple frames should share the same track_id
 * - toolbar selection/instances are keyed using class_name + track_id
 */

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

/** Create a human-readable id like "silent comet-3" (pre-canonicalization). */
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
 *
 * This ensures stable matching regardless of how the user typed the id.
 */
export function canonicalizeTrackId(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .toLowerCase();
}

/**
 * Generate an incrementing numeric track id string ("1", "2", "3", ...)
 * per class name, persisted in localStorage.
 */
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

// ------------------------------
// Writing class + track into W3C bodies
// ------------------------------

/**
 * Ensure an annotation carries the selected class + track_id in its W3C bodies.
 *
 * We update:
 * - a.bodies (Annotorious standard field)
 * - a.body (legacy/custom storage field used by older codepaths)
 *
 * This function is used in tracking mode (instances across frames).
 */
export function writeClassAndTrack(
  a: ImageAnnotation,
  cls: { id: number; name: string },
  track_id: string,
): ImageAnnotation {
  const classBody = (): AnnotationBody =>
    makeClassBody(a.id, {
      type: "class",
      id: cls.id,
      name: cls.name,
      track_id,
    });

  const patch = (list: AnnotationBody[]) => {
    let found = false;

    const mapped = list.map((b) => {
      if (!isRecord(b)) return b;

      const purpose = getString(b.purpose);
      if (purpose !== "tagging" && purpose !== "classifying") return b;

      const v = b.value;

      // If it's already our structured payload (object or JSON string), update it
      const parsed = decodeClassValue(v);
      if (parsed) {
        found = true;
        return {
          ...b,
          value: encodeClassValue({
            type: "class",
            id: cls.id,
            name: cls.name,
            track_id,
          }),
        };
      }

      // If it's a plain string label, upgrade it to structured payload
      if (typeof v === "string") {
        found = true;
        return {
          ...b,
          value: encodeClassValue({
            type: "class",
            id: cls.id,
            name: cls.name,
            track_id,
          }),
        };
      }

      return b;
    });

    return { mapped, found };
  };

  const pb = patch(a.bodies ?? []);

  // `body` is not part of ImageAnnotation; keep it as an optional custom field.
  const bodyIn = asArray(
    (a as unknown as { body?: unknown }).body,
  ) as AnnotationBody[];
  const p = patch(bodyIn);

  const bodiesOut = [...pb.mapped];
  const bodyOut = [...p.mapped];

  // If neither bodies nor legacy body had tagging info, append a new one.
  if (!pb.found && !p.found) {
    const cb = classBody();
    bodiesOut.push(cb);
    bodyOut.push(cb);
  }

  const base: ImageAnnotation = {
    ...(a as ImageAnnotation),
    bodies: bodiesOut,
  };

  // Return as ImageAnnotation, but preserve custom `body` field for your storage/back-compat.
  return { ...base, body: bodyOut } as unknown as ImageAnnotation;
}

/**
 * Write / update a W3C class body without track_id (detection mode).
 * This is for "class only" annotations where instances are not tracked.
 */
export function writeClassOnly(
  a: ImageAnnotation,
  cls: { id: number; name: string },
): ImageAnnotation {
  // Legacy shape used in the custom `body` field (kept for back-compat storage).
  const legacyClassBody = () => ({
    purpose: "tagging",
    value: { type: "class", id: cls.id, name: cls.name },
  });

  // Proper Annotorious body type for `bodies: AnnotationBody[]`.
  // Note: AnnotationBody.value is typed as string in @annotorious/react,
  // so we store our class payload as an encoded JSON string (same as writeClassAndTrack).
  const typedClassBody = (): AnnotationBody =>
    makeClassBody(a.id, { type: "class", id: cls.id, name: cls.name });

  let found = false;

  // Patch the real Annotorious `bodies` array (typed end-to-end).
  const patchBodies = (list: AnnotationBody[]): AnnotationBody[] =>
    list.map((b) => {
      const purpose = getString(b.purpose);
      if (purpose !== "tagging" && purpose !== "classifying") return b;

      const v = b.value;

      // Preferred: decode structured class payload (JSON string or legacy object)
      const parsed = decodeClassValue(v);
      if (parsed) {
        found = true;
        return {
          ...b,
          value: encodeClassValue({
            type: "class",
            id: cls.id,
            name: cls.name,
          }),
        };
      }

      // Fallback: if value is a plain string label, upgrade it to structured payload
      if (typeof v === "string") {
        found = true;
        return {
          ...b,
          value: encodeClassValue({
            type: "class",
            id: cls.id,
            // keep the selected name (this function is explicitly "write class only")
            name: cls.name,
          }),
        };
      }

      return b;
    });

  // Patch the legacy `body` field while preserving non-object entries exactly.
  const patchLegacyBody = (list: unknown[]): unknown[] =>
    list.map((b) => {
      if (!isRecord(b)) return b;

      const purpose = getString(b.purpose);
      if (purpose !== "tagging" && purpose !== "classifying") return b;

      const v = (b as UnknownRecord).value;

      const parsed = decodeClassValue(v);
      if (parsed) {
        found = true;
        return {
          ...b,
          value: encodeClassValue({
            type: "class",
            id: cls.id,
            name: cls.name,
          }),
        };
      }

      if (typeof v === "string") {
        found = true;
        return {
          ...b,
          value: encodeClassValue({
            type: "class",
            id: cls.id,
            name: cls.name,
          }),
        };
      }

      return b;
    });

  const bodiesOut = patchBodies(a.bodies ?? []);
  const bodyOut = patchLegacyBody(
    asArray((a as unknown as UnknownRecord).body),
  );

  if (!found) {
    bodiesOut.push(typedClassBody());
    bodyOut.push(legacyClassBody());
  }

  // Build a proper ImageAnnotation (keeps id/target/etc intact) and only override bodies.
  const base: ImageAnnotation = {
    ...a,
    bodies: bodiesOut,
  };

  // Preserve custom legacy `body` field for back-compat storage.
  return { ...base, body: bodyOut } as unknown as ImageAnnotation;
}

// ------------------------------
// Mode-aware normalization (tracking vs detection)
// ------------------------------

/**
 * normalizeWithMode applies the "selection state" to a raw list of annotations.
 *
 * It exists because Annotorious can produce annotations without our metadata
 * after edits (or for newly created rectangles), so we "stamp" or "restore"
 * class/track info depending on the mode.
 *
 * Tracking mode (includeTrackIds=true):
 * - If an existing annotation lost metadata: restore from the previous version.
 * - If a new annotation exists and an instance is selected: stamp class+track.
 *
 * Detection mode (includeTrackIds=false):
 * - If annotation existed before: restore class label from previous version.
 * - Else, if a class is armed: stamp class only using registry/fallback id.
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

      // Existing annotation: repair missing metadata using previous label.
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

      // New annotation: stamp selected instance (if one is armed).
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

  // Detection mode (no track ids): stamp / restore class only.
  const out: ImageAnnotation[] = [];

  for (const a of rawList) {
    const seen = knownById[a.id];
    let next = a;

    // Existing annotation: restore previous class label.
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

    // New annotation: stamp armed class name -> numeric id lookup.
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

// ------------------------------
// COCO types + converters (W3C <-> COCO frames)
// ------------------------------

/**
 * Minimal COCO-ish bbox representation produced by rectToCoco.
 * (We add class/track fields when exporting.)
 */
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

/**
 * Convert W3C rectangle selector -> COCO bbox.
 *
 * Supports:
 * - selector.value = "xywh=(pixel|percent):x,y,w,h"
 * - selector.type === "RECTANGLE" with geometry.{x,y,w,h} or geometry.bounds
 */
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

      // Percent-based coords require a known natural image size.
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

    // Some Annotorious adapters store rectangle bounds instead of x/y/w/h.
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

/**
 * Convert W3C polygon selector -> COCO polygon.
 * (Not currently used by the rectangle-only tooling, but supported for export.)
 */
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

  // Fallback: some polygon encodings store SVG-like strings
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
 * Add class/track fields onto exported bbox/polygon labels.
 * - includeTracks=true: include track_id plus numeric convenience fields
 * - includeTracks=false: export class only
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

/**
 * Convert W3C annotations (all frames) -> COCO frame grouping.
 *
 * Output format:
 *  [
 *    { frame: 0, bboxes: [...], polygons: [...] },
 *    { frame: 1, ... },
 *  ]
 *
 * This is used as an intermediate step before converting to backend payload.
 */
export function w3cToCocoFrames(
  list: ImageAnnotation[],
  includeTracks = true,
): CocoFrame[] {
  const byFrame: Record<number, CocoFrame> = {};

  for (const a of Array.isArray(list) ? list : []) {
    const src = getTargetSource(a);
    const frame = frameFromSourceKey(src ?? "");
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

// ------------------------------
// Backend payload conversion (COCO frames -> VideoBoundingBox[])
// ------------------------------

/**
 * Backend "video_bounding_box" format used by the annotation API.
 * This is what we save after collecting all frames from localStorage.
 */
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

/**
 * Convert COCO frame groups -> backend VideoBoundingBox[].
 *
 * Notes:
 * - Rectangles only (polygons ignored)
 * - Requires a track_id per bbox (instances)
 * - Drops invalid/degenerate boxes (width/height <= 0)
 */
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

      // Backend expects a single `label` string; we prefer class_name.
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

// ------------------------------
// Backend -> W3C seeding (used on initial load)
// ------------------------------

/**
 * Guard for backend annotations union types:
 * We only seed W3C from "video_bounding_box" entries.
 */
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

/**
 * Infer class_id from backend label string.
 * - if label matches FIXED_CLASS_REG name -> use that id
 * - else if label is numeric -> parse it
 * - else fallback to 1
 */
function inferClassId(label: string): number {
  const key = label.toLowerCase().trim();
  const fixed = FIXED_CLASS_REG[key];
  if (typeof fixed === "number") return fixed;

  const asNum = Number(label);
  if (Number.isFinite(asNum)) return asNum;

  return 1;
}

/**
 * Convert backend annotations -> W3C ImageAnnotation[], grouped by frame number.
 *
 * This is used by FrameView to "seed" localStorage on first open:
 * backend COCO-like data -> local W3C overlay format per frame.
 */
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

    // W3C target.source ties the annotation to a specific project/sample/frame.
    const source = buildSourceKey({ projectId, sampleId, frame });

    // Deterministic-ish id so edits/deletes behave predictably after reload.
    // Includes frame + track + geometry so the same backend box tends to map to the same id.
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
      // Store class+track in both:
      // - bodies: Annotorious preferred
      // - body: legacy/custom field kept for back-compat with older reads
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
