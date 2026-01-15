"use client";

import type { ImageAnnotation } from "@annotorious/react";

const KEY_PREFIX = "anno::w3c::";

/**
 * LocalStorage-backed store for W3C-style image annotations for a single image/frame.
 *
 * - Keyed by a stable `sourceKey` (see `buildSourceKey`).
 * - Returns an empty array on any failure or malformed data.
 *
 * Storage layout:
 *   localStorage["anno::w3c::" + sourceKey] = JSON.stringify(ImageAnnotation[])
 */
export function W3CImageFormat(sourceKey: string) {
  const key = `${KEY_PREFIX}${sourceKey}`;

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
 * This value is used as:
 * - the W3C `target.source` for annotations, and
 * - the suffix for the LocalStorage key used by `W3CImageFormat`.
 *
 * Example: app://p/abc/s/def/f/300
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

export const W3C_KEY_PREFIX = "anno::w3c::";
const VIDEO_WORKING_PREFIX = "ufo::working::";

export function sampleFramePrefix(projectId: string, sampleId: string) {
  return `${W3C_KEY_PREFIX}app://p/${projectId}/s/${sampleId}/f/`;
}

export function videoWorkingKey(projectId: string, sampleId: string) {
  return `${VIDEO_WORKING_PREFIX}${projectId}::${sampleId}`;
}

export function isVideoWorkingDirty(
  projectId: string,
  sampleId: string,
): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(videoWorkingKey(projectId, sampleId)) === "1";
}

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
