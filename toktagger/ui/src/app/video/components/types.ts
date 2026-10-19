/**
 * Types used across the video view: the drawing tools, the selection and one table row (InstanceProfile).
 */
import type { ImageAnnotation } from "@annotorious/react";

/** Frame number within a video (0-based). */
export type FrameIndex = number;

export type DrawingTool = "rectangle" | "polygon" | "point" | "frame";
export type ActiveDrawingTool = DrawingTool | null;
export type AnnotoriousDrawingTool = Exclude<DrawingTool, "point" | "frame">;

/** Identifies an instance as "className::trackId". */
export type TrackKey = `${string}::${string}`;

/** The class label and track ID the next annotation will use. With no track ID, a new track starts. */
export type Selection = {
  className: string | null;
  trackId: string | null;
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
  trackId: string;
  type: VideoAnnotationType;
  createdBy: string;
  frames: number[]; // unique, sorted
  count: number; // total shapes across frames
};

/** In-memory annotation storage keyed by frame, using the native Annotorious model. */
export type ByFrameMap = Map<FrameIndex, ImageAnnotation[]>;

/** Build a TrackKey from a class + track id. */
export function makeTrackKey(className: string, trackId: string): TrackKey {
  return `${className}::${trackId}`;
}

/** The frame ID stored on each annotation's target.source, linking it to its project, sample and frame. */
export function buildSourceKey(args: {
  projectId: string;
  sampleId: string;
  frame: number;
}): string {
  return `app://p/${args.projectId}/s/${args.sampleId}/f/${args.frame}`;
}
