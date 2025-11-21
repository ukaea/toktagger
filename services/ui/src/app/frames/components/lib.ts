"use client";

import type { ImageAnnotation } from "@annotorious/react";

/**
 * Minimal types for Phase 1.
 */
export type ClassRegistry = Record<string, number>;

export type Profile = {
  key: string;
  class_id: number;
  class_name: string;
  track_id: string;
};

/**
 * Minimal stub: we don't care about classes yet, so just return null.
 */
export function extractClassLabel(
  _a: any
): { class_id?: number; class_name?: string; track_id?: string } | null {
  return null;
}

/**
 * Stubbed track ID normalizer – we'll replace with the full version later.
 */
export function canonicalizeTrackId(input: string): string {
  return input.trim();
}

/**
 * Stubbed label writers – for Phase 1, we don't attach any class metadata.
 * These simply return the annotation unchanged.
 */
export function writeClassAndTrack(
  a: any,
  _cls: { id: number; name: string },
  _track_id: string
): any {
  return a;
}

export function writeClassOnly(a: any, _cls: { id: number; name: string }): any {
  return a;
}

/**
 * Phase 1 normalization: just return the list as-is.
 * No mode-awareness, no class/track propagation.
 *
 * This keeps AnnoBridge happy without pulling in the full label logic yet.
 */
export function normalizeWithMode(
  rawList: ImageAnnotation[],
  _knownById: Record<string, ImageAnnotation>,
  _getSelectedProfile: () => Profile | null,
  _getSelectedClassName: () => string | null,
  _includeTrackIds: boolean,
  _classRegistry: ClassRegistry
): ImageAnnotation[] {
  return rawList;
}
