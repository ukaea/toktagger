export class SchemaParser {
  private schema: Record<string, unknown> | null;

  constructor(schema: Record<string, unknown> | null) {
    this.schema = schema;
  }

  private parseLabelsFromSchema(labelType: string): string[] {
    const labels =
      this.schema?.components?.schemas?.ProjectIn?.properties[labelType]
        .default;

    if (!labels || !Array.isArray(labels)) {
      return [];
    }

    return labels;
  }

  public parseDefaultShotLabels(): string[] {
    return this.parseLabelsFromSchema("shot_labels");
  }

  public parseDefaultTimeRegionLabels(): string[] {
    return this.parseLabelsFromSchema("time_region_labels");
  }

  public parseDefaultTimePointLabels(): string[] {
    return this.parseLabelsFromSchema("time_point_labels");
  }

  public parseDefaultBoundingBoxLabels(): string[] {
    return this.parseLabelsFromSchema("bounding_box_labels");
  }

  public parseDefaultPolygonLabels(): string[] {
    return this.parseLabelsFromSchema("polygon_labels");
  }

  public parseDefaultVideoBoundingBoxLabels(): string[] {
    return this.parseLabelsFromSchema("video_bounding_box_labels");
  }
}
