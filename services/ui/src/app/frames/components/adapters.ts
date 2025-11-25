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
  frame
}: {
  projectId: string;
  sampleId: string;
  frame: number;
}): string {
  return `app://p/${projectId}/s/${sampleId}/f/${frame}`;
}
