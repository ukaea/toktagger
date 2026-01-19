"use client";

import type { ImageAnnotation } from "@annotorious/react";

/** Frame index (0-based) */
export type FrameIndex = number;

/** Composite key for an "instance" track */
export type TrackKey = `${string}::${string}`;

/** Selection source: explicit (user chose) vs auto (system created) */
export type SelectionSource = "explicit" | "auto" | null;

/** Currently armed selection for drawing */
export type Selection = {
  className: string | null;
  trackId: string | null;
  source: SelectionSource;
};

/** UI-level instance row */
export type InstanceProfile = {
  key: TrackKey;
  className: string;
  classId: number;
  trackId: string;
  frames: number[]; // unique, sorted
  count: number; // total boxes across frames
};

/** Map of per-frame overlay annotations (native Annotorious model) */
export type ByFrameMap = Map<FrameIndex, ImageAnnotation[]>;

/** Minimal backend video bbox shape we can emit */
export type VideoBoundingBox = {
  type: "video_bounding_box";
  frame: number;
  track_id: string;
  label: string;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  created_by?: string;
  timestamp?: string;
  class_id?: number;
};

/** Fixed label list for v2 (keep in sync with v1 LABEL_MAP if you want) */
export const V2_LABELS: { id: number; name: string }[] = [
  { id: 1, name: "UFO" },
  { id: 2, name: "Minor UFO" },
  { id: 3, name: "Major UFO" },
  { id: 4, name: "Disruption" },
  { id: 5, name: "Marfe" },
  { id: 6, name: "Other Anomaly" },
];

export function classIdForName(className: string): number {
  const key = (className || "").trim().toLowerCase();
  const hit = V2_LABELS.find((c) => c.name.toLowerCase() === key);
  return hit?.id ?? 1;
}

export function makeTrackKey(className: string, trackId: string): TrackKey {
  return `${className}::${trackId}`;
}

export function parseTrackKey(key: TrackKey): { className: string; trackId: string } {
  const idx = key.lastIndexOf("::");
  return { className: key.slice(0, idx), trackId: key.slice(idx + 2) };
}

/**
 * Keep the same "source key" format as v1 so you can re-use any downstream logic.
 * (We do NOT use this for storage in v2 — only as target.source for debugging/export.)
 */
export function buildSourceKey(args: {
  projectId: string;
  sampleId: string;
  frame: number;
}): string {
  return `app://p/${args.projectId}/s/${args.sampleId}/f/${args.frame}`;
}
