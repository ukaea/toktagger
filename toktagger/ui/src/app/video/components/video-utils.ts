/**
 * Pure helpers for track IDs, instances, propagation and byFrame updates.
 * There is no React here, so this is the easiest place to read the rules.
 */
"use client";

import type { ImageAnnotation } from "@annotorious/react";
import type { Annotation, CreatedByFields } from "@/types";
import {
  pickCreatedBy,
  VideoBoundingBoxSchema,
  VideoFrameLabelSchema,
  VideoPointSchema,
  VideoPolygonSchema,
} from "@/types";
import type {
  ByFrameMap,
  FrameIndex,
  InstanceProfile,
  TrackKey,
} from "./types";
import {
  classIdForName,
  makeTrackKey,
  buildSourceKey,
  VideoAnnotationType,
} from "./types";
import {
  getAnnotationAuthor,
  getAnnotationCreator,
  getLabelTrack,
  isPointAnno,
  isPolygonAnno,
} from "./anno-utils";

/** True when global annotation shortcuts should yield to text entry controls. */
export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;

  return (
    target instanceof HTMLInputElement &&
    target.type !== "checkbox" &&
    target.type !== "radio"
  );
}

/** Deep clone through JSON, which is enough for plain annotation data. */
export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Normalises a track ID for comparing: trimmed, lower case, with spaces turned into dashes. */
export function canonicalizeTrackId(trackId: string): string {
  const s = trackId.trim();
  if (!s) return "";
  return s.replace(/\s+/g, "-").toLowerCase();
}

/** Like canonicalizeTrackId, but never empty (falls back to "1"). Used when matching for deletion. */
export function ensureTrackId(trackId: string): string {
  const c = canonicalizeTrackId(trackId);
  return c.length > 0 ? c : "1";
}

// Human-readable track IDs, e.g. mellow-glove-4

const READABLE_ADJECTIVES = [
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
] as const;

const READABLE_NOUNS = [
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
] as const;

function randInt(minIncl: number, maxIncl: number) {
  return Math.floor(Math.random() * (maxIncl - minIncl + 1)) + minIncl;
}

function randomReadableSlug(): string {
  const adj = READABLE_ADJECTIVES[randInt(0, READABLE_ADJECTIVES.length - 1)];
  const noun = READABLE_NOUNS[randInt(0, READABLE_NOUNS.length - 1)];
  const n = randInt(1, 9);
  return `${adj}-${noun}-${n}`;
}

/** A new readable track ID, such as brave-glow-4, that is not already in `existingTrackIds`. */
export function uniqueReadableTrackId(
  existingTrackIds: Iterable<string>,
): string {
  const used = new Set<string>();
  for (const t of existingTrackIds) {
    const c = canonicalizeTrackId(t);
    if (c) used.add(c);
  }

  let candidate = randomReadableSlug();
  let guard = 0;

  while (used.has(canonicalizeTrackId(candidate)) && guard++ < 200) {
    candidate = randomReadableSlug();
  }

  // Extremely unlikely fallback: add a short unique suffix.
  if (used.has(canonicalizeTrackId(candidate))) {
    const suffix =
      globalThis.crypto?.randomUUID?.().slice(0, 6) ??
      Math.random().toString(36).slice(2, 8);
    candidate = `${candidate}-${suffix}`;
  }

  return canonicalizeTrackId(candidate);
}

/** Every track ID a class's shapes use across all frames, so new IDs don't repeat one. */
export function existingTrackIdsForClass(
  byFrame: ByFrameMap,
  className: string,
): string[] {
  const cls = className.trim();
  if (!cls) return [];

  const out: string[] = [];
  for (const list of byFrame.values()) {
    for (const a of list) {
      const got = getLabelTrack(a);
      if ((got.className || "").trim() !== cls) continue;
      const tid = canonicalizeTrackId(got.trackId || "");
      if (tid) out.push(tid);
    }
  }
  return out;
}

// Track ids already used by whole-frame labels of a class - shares the pool with shapes.
export function existingFrameLabelTrackIdsForClass(
  annotations: Annotation[],
  className: string,
): string[] {
  const cls = className.trim();
  if (!cls) return [];

  const out: string[] = [];
  for (const annotation of annotations) {
    if (annotation.type !== "video_frame_label") continue;
    if ((annotation.label || "").trim() !== cls) continue;
    const tid = canonicalizeTrackId(annotation.track_id || "");
    if (tid) out.push(tid);
  }
  return out;
}

/** The highest numeric track ID used by each class, for allocateNextTrackId. */
export function buildNextTrackIdState(
  annotations: Annotation[],
): Map<string, number> {
  const nextTrackNums = new Map<string, number>();

  for (const annotation of annotations) {
    const parsed =
      annotation.type === "video_bounding_box"
        ? VideoBoundingBoxSchema.safeParse(annotation)
        : annotation.type === "video_polygon"
          ? VideoPolygonSchema.safeParse(annotation)
          : annotation.type === "video_point"
            ? VideoPointSchema.safeParse(annotation)
            : null;
    if (!parsed || !parsed.success) continue;

    const className = (parsed.data.label || "").trim();
    const numericTrackId = Number.parseInt(parsed.data.track_id || "", 10);

    if (!className || !Number.isFinite(numericTrackId)) continue;

    const prev = nextTrackNums.get(className) ?? 0;
    if (numericTrackId > prev) {
      nextTrackNums.set(className, numericTrackId);
    }
  }

  return nextTrackNums;
}

/** Bumps a class's numeric track ID counter and returns the new ID. Mutates the map on purpose: the session owns it. */
export function allocateNextTrackId(
  nextTrackNums: Map<string, number>,
  className: string,
): string {
  const key = (className || "").trim();
  const next = (nextTrackNums.get(key) ?? 0) + 1;
  nextTrackNums.set(key, next);
  return String(next);
}

/** Immutable update: set a frame's overlay list. */
export function mapSetFrame(
  prev: ByFrameMap,
  frame: FrameIndex,
  list: ImageAnnotation[],
): ByFrameMap {
  const next = new Map(prev);
  next.set(frame, list);
  return next;
}

/** Immutable update: clear a single frame to an empty overlay list. */
export function mapClearFrame(prev: ByFrameMap, frame: FrameIndex): ByFrameMap {
  const next = new Map(prev);
  next.set(frame, []);
  return next;
}

/** Immutable update: clear all known frames to empty overlay lists. */
export function mapClearAll(prev: ByFrameMap): ByFrameMap {
  const next = new Map<FrameIndex, ImageAnnotation[]>();
  for (const [f] of prev.entries()) next.set(f, []);
  return next;
}

/** Flatten all frame overlays into one list. */
export function flattenByFrame(byFrame: ByFrameMap): ImageAnnotation[] {
  const out: ImageAnnotation[] = [];
  for (const list of byFrame.values()) out.push(...list);
  return out;
}

function shapeAnnotationType(a: ImageAnnotation): VideoAnnotationType {
  if (isPointAnno(a)) return VideoAnnotationType.POINT;
  return isPolygonAnno(a)
    ? VideoAnnotationType.POLYGON
    : VideoAnnotationType.BOUNDING_BOX;
}

/** One InstanceProfile per class + track ID in byFrame, listing the frames it appears on. */
export function deriveInstances(
  byFrame: ByFrameMap,
  getLabelTrack: (a: ImageAnnotation) => {
    className?: string | null;
    trackId?: string | null;
  },
): InstanceProfile[] {
  const map = new Map<TrackKey, InstanceProfile>();

  const frames = Array.from(byFrame.keys()).sort((a, b) => a - b);

  for (const frame of frames) {
    const list = byFrame.get(frame) ?? [];
    for (const a of list) {
      const { className, trackId } = getLabelTrack(a);
      if (!className || !trackId) continue;

      const key = makeTrackKey(className, trackId);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          className,
          classId: classIdForName(className),
          trackId,
          type: shapeAnnotationType(a),
          createdBy: getAnnotationAuthor(a),
          frames: [frame],
          count: 1,
        });
      } else {
        existing.count += 1;
        if (!existing.frames.includes(frame)) existing.frames.push(frame);
      }
    }
  }

  const out = Array.from(map.values());
  for (const inst of out) inst.frames.sort((a, b) => a - b);

  // Sort by first frame, then by track ID so ties keep a stable order
  out.sort(
    (a, b) =>
      (a.frames[0] ?? Number.POSITIVE_INFINITY) -
        (b.frames[0] ?? Number.POSITIVE_INFINITY) ||
      a.trackId.localeCompare(b.trackId),
  );

  return out;
}

/** Removes every shape of one instance (class + track ID) from all frames. */
export function deleteTrackAcrossFrames(
  byFrame: ByFrameMap,
  match: { className: string; trackId: string },
  getLabelTrack: (a: ImageAnnotation) => {
    className?: string | null;
    trackId?: string | null;
  },
): ByFrameMap {
  const cls = match.className.trim();
  const tid = ensureTrackId(match.trackId);

  const next = new Map<FrameIndex, ImageAnnotation[]>();

  for (const [frame, list] of byFrame.entries()) {
    const filtered = list.filter((a) => {
      const got = getLabelTrack(a);
      const c = (got.className || "").trim();
      const t = ensureTrackId(got.trackId || "");
      return !(c === cls && t === tid);
    });
    next.set(frame, filtered);
  }

  return next;
}

/** Append missing manual instances from `sourceFrame` to `destinationFrame`. */
export function forwardPropagateMissingManualAnnotations(
  byFrame: ByFrameMap,
  sourceFrame: FrameIndex,
  destinationFrame: FrameIndex,
  sessionIds: { projectId: string; sampleId: string },
): ByFrameMap {
  const sourceAnnotations = byFrame.get(sourceFrame) ?? [];
  const destinationAnnotations = byFrame.get(destinationFrame) ?? [];

  const destinationKeys = new Set<TrackKey>();
  for (const annotation of destinationAnnotations) {
    const { className, trackId } = getLabelTrack(annotation);
    const trimmedClassName = (className ?? "").trim();
    const canonicalTrackId = canonicalizeTrackId(trackId ?? "");
    if (!trimmedClassName || !canonicalTrackId) continue;

    destinationKeys.add(makeTrackKey(trimmedClassName, canonicalTrackId));
  }

  const destinationFrameSourceKey = buildSourceKey({
    projectId: sessionIds.projectId,
    sampleId: sessionIds.sampleId,
    frame: destinationFrame,
  });

  const annotationsToPropagate: ImageAnnotation[] = [];
  for (const annotation of sourceAnnotations) {
    if (getAnnotationCreator(annotation) !== "manual") continue;

    const { className, trackId } = getLabelTrack(annotation);
    const trimmedClassName = (className ?? "").trim();
    const canonicalTrackId = canonicalizeTrackId(trackId ?? "");
    if (!trimmedClassName || !canonicalTrackId) continue;

    const instanceKey = makeTrackKey(trimmedClassName, canonicalTrackId);
    if (destinationKeys.has(instanceKey)) continue;

    const clonedAnnotation = deepClone(annotation);
    annotationsToPropagate.push({
      ...clonedAnnotation,
      target: { ...clonedAnnotation.target, source: destinationFrameSourceKey },
    });
    destinationKeys.add(instanceKey);
  }

  if (annotationsToPropagate.length === 0) return byFrame;

  const updatedByFrame = new Map(byFrame);
  updatedByFrame.set(destinationFrame, [
    ...destinationAnnotations,
    ...annotationsToPropagate,
  ]);
  return updatedByFrame;
}

// Derive instance profiles from whole-frame labels, grouped like deriveInstances groups shapes.
export function deriveFrameLabelInstances(
  annotations: Annotation[],
): InstanceProfile[] {
  const framesByKey = new Map<
    TrackKey,
    {
      className: string;
      trackId: string;
      createdBy: CreatedByFields;
      frames: Set<number>;
    }
  >();

  for (const annotation of annotations) {
    if (annotation.type !== "video_frame_label") continue;

    const className = (annotation.label || "").trim();
    const trackId = canonicalizeTrackId(annotation.track_id || "");
    if (!className || !trackId) continue;

    const key = makeTrackKey(className, trackId);
    const entry = framesByKey.get(key) ?? {
      className,
      trackId,
      createdBy: pickCreatedBy(annotation),
      frames: new Set<number>(),
    };
    entry.frames.add(annotation.frame);
    framesByKey.set(key, entry);
  }

  return Array.from(framesByKey.entries()).map(([key, entry]) => {
    const frames = Array.from(entry.frames).sort((a, b) => a - b);
    return {
      key,
      className: entry.className,
      classId: classIdForName(entry.className),
      trackId: entry.trackId,
      type: VideoAnnotationType.FRAME_LABEL,
      createdBy: entry.createdBy,
      frames,
      count: frames.length,
    };
  });
}

// Merge shape and frame-label instance profiles that share a (className, trackId) key.
export function mergeInstanceProfiles(
  primary: InstanceProfile[],
  extra: InstanceProfile[],
): InstanceProfile[] {
  const byKey = new Map<TrackKey, InstanceProfile>();
  for (const profile of primary) byKey.set(profile.key, profile);

  for (const profile of extra) {
    const existing = byKey.get(profile.key);
    if (!existing) {
      byKey.set(profile.key, profile);
      continue;
    }

    const frames = Array.from(
      new Set([...existing.frames, ...profile.frames]),
    ).sort((a, b) => a - b);
    byKey.set(profile.key, { ...existing, frames, count: frames.length });
  }

  const out = Array.from(byKey.values());
  out.sort(
    (a, b) =>
      (a.frames[0] ?? Number.POSITIVE_INFINITY) -
        (b.frames[0] ?? Number.POSITIVE_INFINITY) ||
      a.trackId.localeCompare(b.trackId),
  );
  return out;
}

// Append missing manual frame labels from frame without replacing destination labels.
export function propagateMissingManualFrameLabels(
  annotations: Annotation[],
  frame: FrameIndex,
  nextFrame: FrameIndex,
): Annotation[] {
  const destinationClasses = new Set<string>();
  for (const annotation of annotations) {
    if (
      annotation.type !== "video_frame_label" ||
      annotation.frame !== nextFrame
    )
      continue;

    const parsed = VideoFrameLabelSchema.safeParse(annotation);
    if (!parsed.success) continue;

    const className = parsed.data.label.trim();
    if (className) destinationClasses.add(className);
  }

  const propagated: Annotation[] = [];
  const acceptedClasses = new Set(destinationClasses);
  for (const annotation of annotations) {
    if (annotation.type !== "video_frame_label" || annotation.frame !== frame)
      continue;

    const parsed = VideoFrameLabelSchema.safeParse(annotation);
    if (!parsed.success || parsed.data.created_by !== "manual") continue;

    const className = parsed.data.label.trim();
    if (!className || acceptedClasses.has(className)) continue;

    const nextLabel = VideoFrameLabelSchema.safeParse({
      ...parsed.data,
      frame: nextFrame,
    });
    if (!nextLabel.success) continue;

    propagated.push(nextLabel.data);
    acceptedClasses.add(className);
  }

  if (propagated.length === 0) return annotations;

  return [...annotations, ...propagated];
}
