import { Annotation, MultiVariateTimeSeriesData } from "@/types";

export enum AnnotatorTypes {
  PEAK_DETECTION = "peak_detection",
  CHANGE_POINT_DETECTION = "change_point_detection",
  JUMP_DETECTION = "jump_detection",
  OUTLIER_DETECTION = "outlier_detection",
}

export type AnnotatorToolProps = {
  project_id: string;
  sample_id: string;
  task_name: string;
  data: MultiVariateTimeSeriesData;
  setAnnotations: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])
  ) => void;
};
