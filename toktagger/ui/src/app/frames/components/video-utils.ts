"use client";

import type { ImageAnnotation } from "@annotorious/react";
import type { ByFrameMap, FrameIndex, InstanceProfile, TrackKey } from "./types";
import { classIdForName, makeTrackKey } from "./types";

/** Deep clone is fine for annot payloads (no functions) */
export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Normalize track ids to a readable canonical form */
export function canonicalizeTrackId(trackId: string): string {
  const s = String(trackId ?? "").trim();
  if (!s) return "";
  // Keep it simple: lower-case and strip spaces
  return s.replace(/\s+/g, "-").toLowerCase();
}

/** Ensure a string is a safe-ish track id */
export function ensureTrackId(trackId: string): string {
  const c = canonicalizeTrackId(trackId);
  return c || "1";
}

/** Return a new map with frame set */
export function mapSetFrame(prev: ByFrameMap, frame: FrameIndex, list: ImageAnnotation[]): ByFrameMap {
  const next = new Map(prev);
  next.set(frame, list);
  return next;
}

/** Return a new map with frame cleared */
export function mapClearFrame(prev: ByFrameMap, frame: FrameIndex): ByFrameMap {
  const next = new Map(prev);
  next.set(frame, []);
  return next;
}

/** Return a new map with all frames cleared (emptied) */
export function mapClearAll(prev: ByFrameMap): ByFrameMap {
  const next = new Map<FrameIndex, ImageAnnotation[]>();
  // Preserve known frame keys if you want; for now, keep it minimal.
  for (const [f] of prev.entries()) next.set(f, []);
  return next;
}

/** Flatten all frames */
export function flattenByFrame(byFrame: ByFrameMap): ImageAnnotation[] {
  const out: ImageAnnotation[] = [];
  for (const list of byFrame.values()) out.push(...(list ?? []));
  return out;
}

/** Derive instance profiles (counts + frames) from byFrame map */
export function deriveInstances(byFrame: ByFrameMap, getLabelTrack: (a: ImageAnnotation) => {
  className?: string | null;
  trackId?: string | null;
}): InstanceProfile[] {
  const map = new Map<TrackKey, InstanceProfile>();

  for (const [frame, list] of byFrame.entries()) {
    for (const a of list ?? []) {
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
  out.sort((a, b) => a.className.localeCompare(b.className) || a.trackId.localeCompare(b.trackId));
  return out;
}

/** Delete a track (className + trackId) across all frames */
export function deleteTrackAcrossFrames(
  byFrame: ByFrameMap,
  match: { className: string; trackId: string },
  getLabelTrack: (a: ImageAnnotation) => { className?: string | null; trackId?: string | null }
): ByFrameMap {
  const cls = (match.className || "").trim();
  const tid = ensureTrackId(match.trackId);

  const next = new Map<FrameIndex, ImageAnnotation[]>();

  for (const [frame, list] of byFrame.entries()) {
    const filtered = (list ?? []).filter((a) => {
      const got = getLabelTrack(a);
      const c = (got.className || "").trim();
      const t = ensureTrackId(got.trackId || "");
      return !(c === cls && t === tid);
    });
    next.set(frame, filtered);
  }

  return next;
}

/** Forward propagate from frame -> nextFrame iff nextFrame currently empty */
export function forwardPropagateIfEmpty(
  byFrame: ByFrameMap,
  frame: FrameIndex,
  nextFrame: FrameIndex,
  withRetarget: (a: ImageAnnotation, nextFrame: FrameIndex) => ImageAnnotation
): ByFrameMap {
  const cur = byFrame.get(frame) ?? [];
  if (cur.length === 0) return byFrame;

  const nxt = byFrame.get(nextFrame) ?? [];
  if (nxt.length > 0) return byFrame;

  const seeded = cur.map((a) => withRetarget(deepClone(a), nextFrame));
  const next = new Map(byFrame);
  next.set(nextFrame, seeded);
  return next;
}

/** Allocate the next track id for a class by scanning existing instances */
export function nextTrackIdForClass(byFrame: ByFrameMap, className: string, getLabelTrack: (a: ImageAnnotation) => {
  className?: string | null;
  trackId?: string | null;
}): string {
  const key = (className || "").trim();
  if (!key) return "1";

  let max = 0;
  for (const list of byFrame.values()) {
    for (const a of list ?? []) {
      const got = getLabelTrack(a);
      if ((got.className || "").trim() !== key) continue;
      const t = ensureTrackId(got.trackId || "");
      const n = Number(t);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }

  return String(max + 1);
}
