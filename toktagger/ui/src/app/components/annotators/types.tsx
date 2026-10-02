export enum AnnotatorTypes {
  PEAK_DETECTION = "peak_detection",
  CHANGE_POINT_DETECTION = "change_point_detection",
  JUMP_DETECTION = "jump_detection",
  OUTLIER_DETECTION = "outlier_detection",
  PROFILE_2D_THRESHOLD = "profile_2d_threshold",
}

export const annotatorCreatedBy = (type: AnnotatorTypes) =>
  `annotators::${type}`;

export const modelCreatedBy = (modelType: string) => `model::${modelType}`;

// Display only; the raw created_by value is kept for filtering, exports, etc.
export const displayCreatedBy = (createdBy: string) =>
  createdBy.replace(/^(model|annotators)::/, "");
