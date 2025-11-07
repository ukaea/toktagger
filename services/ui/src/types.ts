import { z } from "zod/v4";

export const BaseAnnotationSchema = z.object({
  timestamp: z.string().optional(),
  validated: z.boolean().optional(),
  uncertainty: z.number().optional(),
  label: z.string(),
});
export type BaseAnnotation = z.infer<typeof BaseAnnotationSchema>;

export const TimeRegionSchema = BaseAnnotationSchema.extend({
  time_min: z.number(),
  time_max: z.number(),
});
export type TimeRegion = z.infer<typeof TimeRegionSchema>;

export const TimePointSchema = BaseAnnotationSchema.extend({
  time: z.number(),
});
export type TimePoint = z.infer<typeof TimePointSchema>;

export const AnnotationSchema = z.union([TimePointSchema, TimeRegionSchema]);
export type Annotation = z.infer<typeof AnnotationSchema>;

export const AnnotationsSchema = z.array(AnnotationSchema);
export type Annotations = z.infer<typeof AnnotationsSchema>;

export const TimeSeriesDataSchema = z.object({
  time: z.array(z.number()),
  values: z.array(z.number()),
});
export type TimeSeriesData = z.infer<typeof TimeSeriesDataSchema>;

export const MultiVariateTimeSeriesDataSchema = z.object({
  values: z.record(z.string(), TimeSeriesDataSchema),
});
export type MultiVariateTimeSeriesData = z.infer<
  typeof MultiVariateTimeSeriesDataSchema
>;

export const SpectrogramDataSchema = z.object({
  time: z.array(z.number()),
  frequency: z.array(z.number()),
  amplitude: z.array(z.array(z.number())),
  threshold_mask: z.array(z.array(z.number())).optional(),
});
export type SpectrogramData = z.infer<typeof SpectrogramDataSchema>;

export const DataSchema = z.union([
  TimeSeriesDataSchema,
  MultiVariateTimeSeriesDataSchema,
  SpectrogramDataSchema,
]);
export type Data = z.infer<typeof DataSchema>;

export const CompositeDataSchema = z.object({
  values: z.record(z.string(), DataSchema),
});
export type CompositeData = z.infer<typeof CompositeDataSchema>;

export const CategorySchema = z.object({
  name: z.string(),
  color: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

export const ZoneSchema = z.object({
  category: CategorySchema,
  x0: z.number(),
  x1: z.number(),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const VSpanSchema = z.object({
  category: CategorySchema,
  x: z.number(),
});
export type VSpan = z.infer<typeof VSpanSchema>;

export const SpectrogramMaskSchema = z.object({
  values: z.array(z.array(z.number())),
});
export type SpectrogramMask = z.infer<typeof SpectrogramMaskSchema>;

export const DisplayAnnotationSchema = z.union([
  ZoneSchema,
  VSpanSchema,
  SpectrogramMaskSchema,
]);
export type DisplayAnnotation = z.infer<typeof DisplayAnnotationSchema>;

export const ProjectSchema = z.object({
  _id: z.string().optional(),
  name: z.string(),
  task: z.string(),
  query_strategy: z.string(),
  data_loader: z.string(),
  timestamp: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectUpdateSchema = z.object({
  name: z.string().optional(),
  task: z.string().optional(),
  query_strategy: z.string().optional(),
});
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

export const FileDataSchema = z.object({
  file_name: z.string(),
  type: z.string(),
  protocol: z.string(),
  column_names: z.array(z.string()),
});
export type FileData = z.infer<typeof FileDataSchema>;

export const ShotDataSchema = z.object({
  protocol: z.string(),
  signal_names: z.array(z.string()),
});
export type ShotData = z.infer<typeof ShotDataSchema>;

export const SampleDataSchema = z.union([FileDataSchema, ShotDataSchema]);
export type SampleData = z.infer<typeof SampleDataSchema>;

export const SampleSchema = z.object({
  _id: z.string().optional(),
  timestamp: z.string(),
  project_id: z.string().optional(),
  shot_id: z.number(),
  data: SampleDataSchema,
});
export type Sample = z.infer<typeof SampleSchema>;

export const SamplesSummarySchema = z
  .object({
    total: z.number(),
    shot_min: z.number().optional(),
    shot_max: z.number().optional(),
    data: SampleDataSchema,
  })
  .refine(
    (data) =>
      data.shot_max == null ||
      data.shot_min == null ||
      data.shot_min <= data.shot_max,
    {
      message: "shot min must be less than or equal to shot max",
      path: ["shot_max"], // attach error to `max`
    },
  );
export type SamplesSummary = z.infer<typeof SamplesSummarySchema>;

export const ViewParamsSchema = z.object({
  name: z.string(),
});
export type ViewParams = z.infer<typeof ViewParamsSchema>;

export const SpectrogramViewParamsSchema = ViewParamsSchema.extend({
  nperseg: z.number().optional(),
  time_min: z.number().optional(),
  time_max: z.number().optional(),
  frequency_min: z.number().optional(),
  frequency_max: z.number().optional(),
  amplitude_min: z.number().optional(),
  amplitude_max: z.number().optional(),
  threshold_value: z.number().optional(),
});
export type SpectrogramViewParams = z.infer<typeof SpectrogramViewParamsSchema>;

export type ToolingProps = {
  plotId?: string;
  plotReady?: boolean;
  forceUpdate?: number;
  onZoneUpdate: CallableFunction;
};

export enum ToolingTypes {
  ZONE,
  VSPAN,
}

export type ToolingCallbacks = {
  id: ToolingTypes;
  start: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: (x: number, y: number) => void;
};

export type PlotProps = {
  colorMap?: string;
  numSignificantDigits?: number;
  thresholdActive?: boolean;
};
