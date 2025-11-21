"use client";

import type { ImageAnnotation } from "@annotorious/react";

const KEY_PREFIX = "anno::w3c::";

/**
 * Stable, per-source W3C image annotation store.
 * Persists to localStorage today. Swap for a backend later without changing call sites.
 *
 * Storage key shape:
 *   localStorage["anno::w3c::" + sourceKey]
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
      // ignore quota or serialization errors for now
    }
  };

  return { read, write };
}

/**
 * Helper to build the stable identity for an image frame.
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
