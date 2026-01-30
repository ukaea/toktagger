"use client";

import type { ImageAnnotation } from "@annotorious/react";

/**
 * All per-frame W3C annotation blobs are stored under:
 *   localStorage["anno::w3c::" + sourceKey] = JSON.stringify(ImageAnnotation[])
 *
 * We keep the prefix constant so we can:
 * - efficiently scan/delete all frames for a sample (prefix match)
 * - avoid collisions with other localStorage entries
 */
const KEY_PREFIX = "anno::w3c::";

/**
 * LocalStorage-backed store for W3C-style image annotations for a single image/frame.
 *
 * Key idea:
 * - each frame has a stable sourceKey (see buildSourceKey)
 * - that same sourceKey becomes the W3C annotation target.source
 * - and it also becomes the localStorage key suffix for persistence
 *
 * This keeps everything consistent across:
 * - reloads
 * - navigation between frames
 * - exporting/collecting annotations later
 */
export function W3CImageFormat(sourceKey: string) {
  // Full localStorage key for this frame
  const key = `${KEY_PREFIX}${sourceKey}`;

  /**
   * Read per-frame annotations (best-effort).
   * Returns [] if:
   * - not in browser (SSR)
   * - key missing
   * - malformed JSON / wrong shape
   */
  const read = async (): Promise<ImageAnnotation[]> => {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem(key);
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list as ImageAnnotation[];
      return [];
    } catch {
      return [];
    }
  };

  /**
   * Write per-frame annotations (best-effort).
   * We intentionally swallow errors so the UI doesn't hard-fail on:
   * - quota exceeded
   * - transient serialization issues
   */
  const write = async (list: ImageAnnotation[]): Promise<void> => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(list ?? []));
    } catch {
      // Ignore quota or serialization errors; caller treats this as best-effort persistence.
    }
  };

  return { read, write };
}

/**
 * Build a stable "source" identifier for a project/sample/frame combination.
 *
 * This string is used in two places:
 * 1) W3C annotations: annotation.target.source
 * 2) LocalStorage: "anno::w3c::" + sourceKey
 *
 * So when we "retarget" annotations to a frame, we just update target.source
 * to the new sourceKey, and the storage key aligns automatically.
 *
 * Example:
 *   app://p/<projectId>/s/<sampleId>/f/<frame>
 */
export function buildSourceKey({
  projectId,
  sampleId,
  frame,
}: {
  projectId: string;
  sampleId: string;
  frame: number;
}): string {
  return `app://p/${projectId}/s/${sampleId}/f/${frame}`;
}

/**
 * Re-exported prefix used in other modules when scanning/deleting keys.
 * (Keeps a single canonical prefix value across the UFO tool.)
 */
export const W3C_KEY_PREFIX = "anno::w3c::";

/**
 * "Working dirty" marker:
 * We use a small sentinel key to decide whether to seed localStorage from backend.
 *
 * - dirty=false: safe to clear local cache and seed from DB (first visit)
 * - dirty=true: user has local edits; do NOT overwrite from backend
 *
 * This marker is per (projectId, sampleId).
 */
const VIDEO_WORKING_PREFIX = "ufo::working::";

/**
 * Prefix for all per-frame storage keys for a specific sample.
 * Used for:
 * - scanning all frames in a sample
 * - clearing all cached per-frame annotations for a sample
 */
export function sampleFramePrefix(projectId: string, sampleId: string) {
  return `${W3C_KEY_PREFIX}app://p/${projectId}/s/${sampleId}/f/`;
}

/**
 * LocalStorage key for the per-sample "dirty working set" marker.
 * Value semantics:
 * - "1" => dirty (has local edits)
 * - missing => not dirty
 */
export function videoWorkingKey(projectId: string, sampleId: string) {
  return `${VIDEO_WORKING_PREFIX}${projectId}::${sampleId}`;
}

/**
 * Read the working-dirty marker.
 * Used to guard DB→localStorage seeding so we never overwrite active local work.
 */
export function isVideoWorkingDirty(
  projectId: string,
  sampleId: string,
): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(videoWorkingKey(projectId, sampleId)) === "1"
  );
}

/**
 * Set or clear the working-dirty marker.
 * Called when we successfully write a frame to localStorage (dirty=true)
 * and when we intentionally reset state (dirty=false).
 */
export function setVideoWorkingDirty(
  projectId: string,
  sampleId: string,
  dirty: boolean,
) {
  if (typeof window === "undefined") return;
  const key = videoWorkingKey(projectId, sampleId);
  if (dirty) window.localStorage.setItem(key, "1");
  else window.localStorage.removeItem(key);
}

/**
 * Delete ALL cached per-frame W3C annotations for a given sample.
 *
 * Note:
 * - This does NOT touch the "working dirty" marker; callers manage that separately.
 * - We first collect keysToDelete before removing to avoid issues while iterating.
 */
export function clearW3CForSample(projectId: string, sampleId: string) {
  if (typeof window === "undefined") return;

  const storage = window.localStorage;
  const prefix = sampleFramePrefix(projectId, sampleId);

  const keysToDelete: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(prefix)) keysToDelete.push(k);
  }

  for (const k of keysToDelete) storage.removeItem(k);
}
