export type TimeSeriesData = Array<{
  time: number;
  value: number;
}>;

export type SpectrogramData = {
  time: Array<number>;
  frequency: Array<number>;
  amplitude: Array<Array<number>>;
};

export type Category = {
  name: string;
  color: string;
};

export type Zone = {
  category: Category;

  x0: number;
  x1: number;

  active: boolean;
};

export type VSpan = {
  category: Category;
  x: number;
};

export type ToolingProps = {
  plotId?: string;
  plotReady?: boolean;
  forceUpdate?: number;
  onZoneUpdate: CallableFunction;
};

export type ToolingCallbacks = {
  start: (x: number, y: number) => void
  move: (x: number, y: number) => void
  end: (x: number, y: number) => void
}