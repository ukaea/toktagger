import { z } from "zod/v4";

export const AnnotationSchema = z.object({
  timestamp: z.string().optional(),
  validated: z.boolean().optional(),
  uncertainty: z.number().optional(),
  label: z.string()
});
export type Annotation = z.infer<typeof AnnotationSchema>;

export const TimeRegionSchema = AnnotationSchema.extend({
  time_min: z.number(),
  time_max: z.number(),
});
export type TimeRegion = z.infer<typeof TimeRegionSchema>;


export const TimePointSchema = AnnotationSchema.extend({
  time: z.number(),
});
export type TimePoint = z.infer<typeof TimePointSchema>;

export const AnnotationsSchema = z.array(z.union([TimePointSchema, TimeRegionSchema]));
export type Annotations = z.infer<typeof AnnotationsSchema>;


export const TimeSeriesDataSchema = z.object({
  time: z.array(z.number()),
  values: z.array(z.number())
});
export type TimeSeriesDataSchema = z.infer<typeof TimeSeriesDataSchema>;


export const MultiVariateTimeSeriesDataSchema = z.object({
  values: z.record(TimeSeriesDataSchema)
});
export type MultiVariateTimeSeriesData = z.infer<typeof MultiVariateTimeSeriesDataSchema>;

export const SpectrogramDataSchema = z.object({
  time: z.array(z.number()),
  frequency: z.array(z.number()),
  amplitude: z.array(z.number())
});
export type SpectrogramData = z.infer<typeof SpectrogramDataSchema>;

export const DataSchema = z.union([TimeSeriesDataSchema, MultiVariateTimeSeriesDataSchema, SpectrogramDataSchema]);
export type Data = z.infer<typeof DataSchema>;

export const CategorySchema = z.object({
  label: z.string(),
  color: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

export const ZoneSchema = z.object({
  category: CategorySchema,
  x0: z.number(),
  x1: z.number()
});
export type Zone = z.infer<typeof ZoneSchema>;

export const VSpanSchema = z.object({
  category: CategorySchema,
  x: z.number(),
});
export type VSpan = z.infer<typeof VSpanSchema>;

export const ProjectSchema = z.object({
  _id: z.string(),
  name: z.string(),
  task: z.string(),
  query_strategy: z.string(),
  data_loader: z.string()
}); 
export type Project = z.infer<typeof ProjectSchema>;

export const SampleSchema = z.object({
  _id: z.string(),
  project_id: z.string(),
  shot_id: z.number(),
  data: z.record(z.any())
}); 
export type Sample = z.infer<typeof SampleSchema>;

export const ViewParamsSchema = z.object({
  name: z.string()
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
});
export type SpectrogramViewParams = z.infer<typeof SpectrogramViewParamsSchema>;

export type ToolingProps = {
  plotId?: string;
  plotReady?: boolean;
  forceUpdate?: number;
  onZoneUpdate: CallableFunction;
};
