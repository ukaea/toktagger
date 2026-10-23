/**
 * Types used across the video view: the drawing tools, the selection, one table row (InstanceProfile)
 * and the backend payload shapes.
 */
"use client";

import type { ImageAnnotation } from "@annotorious/react";
import type { CreatedByFields } from "@/types";

/** Frame number within a video (0-based). */
export type FrameIndex = number;

export type DrawingTool = "rectangle" | "polygon" | "point" | "frame";
export type ActiveDrawingTool = DrawingTool | null;
export type AnnotoriousDrawingTool = Exclude<DrawingTool, "point" | "frame">;

/** Identifies an instance as "className::trackId". */
export type TrackKey = `${string}::${string}`;

/** How the current selection was produced (user picked it vs. auto-assigned). */
export type SelectionSource = "explicit" | "auto" | null;

/** The class label and track ID the next annotation will use. With no track ID, a new track starts. */
export type Selection = {
  className: string | null;
  trackId: string | null;
  source: SelectionSource;
};

export enum VideoAnnotationType {
  BOUNDING_BOX = "BOUNDING BOX",
  POLYGON = "POLYGON",
  POINT = "POINT",
  FRAME_LABEL = "FRAME LABEL",
}

/** One annotations-table row: an instance across all frames. `type` and `createdBy` come from its first annotation. */
export type InstanceProfile = {
  key: TrackKey;
  className: string;
  classId: number;
  trackId: string;
  type: VideoAnnotationType;
  createdBy: CreatedByFields;
  frames: number[]; // unique, sorted
  count: number; // total shapes across frames
};

/** In-memory annotation storage keyed by frame, using the native Annotorious model. */
export type ByFrameMap = Map<FrameIndex, ImageAnnotation[]>;

/** Backend payloads for video shapes. The same shapes also exist as Zod schemas in src/types.ts. */
export type VideoBoundingBox = Partial<CreatedByFields> & {
  type: "video_bounding_box";
  /** Backend _id when this annotation already exists; absent for a new shape. */
  _id?: string | null;
  frame: number;
  track_id: string;
  label: string;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  timestamp?: string;
  class_id?: number;
};

export type VideoPolygon = Partial<CreatedByFields> & {
  type: "video_polygon";
  /** Backend _id when this annotation already exists; absent for a new shape. */
  _id?: string | null;
  frame: number;
  track_id: string;
  label: string;
  segmentation: number[][];
  timestamp?: string;
  class_id?: number;
};

export type VideoPoint = Partial<CreatedByFields> & {
  type: "video_point";
  /** Backend _id when this annotation already exists; absent for a new shape. */
  _id?: string | null;
  frame: number;
  track_id: string;
  label: string;
  x: number;
  y: number;
  timestamp?: string;
  class_id?: number;
};

export type VideoAnnotationShape = VideoBoundingBox | VideoPolygon | VideoPoint;

/** Maps label names to the numeric class_id saved with each shape. The UI's labels come from the project. */
export const class_labels: { id: number; name: string }[] = [
  { id: 1, name: "UFO" },
  { id: 2, name: "Minor UFO" },
  { id: 3, name: "Major UFO" },
  { id: 4, name: "Disruption" },
  { id: 5, name: "Marfe" },
  { id: 6, name: "Other Anomaly" },
];

/** Resolve a human label name to a numeric class id (defaults to 1). */
export function classIdForName(className: string): number {
  const key = (className || "").trim().toLowerCase();
  const hit = class_labels.find((c) => c.name.toLowerCase() === key);
  return hit?.id ?? 1;
}

/** Build a TrackKey from a class + track id. */
export function makeTrackKey(className: string, trackId: string): TrackKey {
  return `${className}::${trackId}`;
}

/** Parse a TrackKey back into its components. */
export function parseTrackKey(key: TrackKey): {
  className: string;
  trackId: string;
} {
  const idx = key.lastIndexOf("::");
  return { className: key.slice(0, idx), trackId: key.slice(idx + 2) };
}

/** The frame ID stored on each annotation's target.source, linking it to its project, sample and frame. */
export function buildSourceKey(args: {
  projectId: string;
  sampleId: string;
  frame: number;
}): string {
  return `app://p/${args.projectId}/s/${args.sampleId}/f/${args.frame}`;
}
