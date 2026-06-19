import { describe, expect, it } from "vitest";
import { applyPreprocessingClientSide } from "../preprocessingUtils";
import type { MultiVariateTimeSeriesData, PreprocessingConfig } from "@/types";

function makeData(
  values: number[],
  signalName = "Ip",
): MultiVariateTimeSeriesData {
  return {
    values: {
      [signalName]: {
        time: values.map((_, i) => i),
        values,
      },
    },
  };
}

function variance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

describe("applyPreprocessingClientSide", () => {
  it("returns same object reference for empty steps", () => {
    const data = makeData([1, 2, 3]);
    const config: PreprocessingConfig = { steps: [] };
    expect(applyPreprocessingClientSide(data, config)).toBe(data);
  });

  it("silently skips unknown signal name", () => {
    const data = makeData([1, 2, 3], "Ip");
    const config: PreprocessingConfig = {
      steps: [
        {
          type: "smoothing",
          signal_name: "Unknown",
          method: "gaussian",
          sigma: 1.0,
        },
      ],
    };
    const result = applyPreprocessingClientSide(data, config);
    expect(result.values["Ip"].values).toEqual([1, 2, 3]);
    expect(result.values["Unknown"]).toBeUndefined();
  });

  it("does not mutate the original data", () => {
    const original = [1, 2, 3, 4, 5];
    const data = makeData([...original]);
    const config: PreprocessingConfig = {
      steps: [
        { type: "smoothing", signal_name: "Ip", method: "gaussian", sigma: 1 },
      ],
    };
    applyPreprocessingClientSide(data, config);
    expect(data.values["Ip"].values).toEqual(original);
  });

  describe("smoothing — gaussian", () => {
    it("preserves signal length", () => {
      const data = makeData(Array.from({ length: 100 }, (_, i) => i));
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "smoothing",
            signal_name: "Ip",
            method: "gaussian",
            sigma: 2,
          },
        ],
      };
      expect(
        applyPreprocessingClientSide(data, config).values["Ip"].values,
      ).toHaveLength(100);
    });

    it("leaves a constant signal unchanged", () => {
      const data = makeData(Array(50).fill(5));
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "smoothing",
            signal_name: "Ip",
            method: "gaussian",
            sigma: 3,
          },
        ],
      };
      const result = applyPreprocessingClientSide(data, config);
      result.values["Ip"].values.forEach((v) => expect(v).toBeCloseTo(5, 5));
    });

    it("reduces variance on a noisy alternating signal", () => {
      const values = Array.from({ length: 100 }, (_, i) => i % 2);
      const data = makeData(values);
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "smoothing",
            signal_name: "Ip",
            method: "gaussian",
            sigma: 5,
          },
        ],
      };
      const result = applyPreprocessingClientSide(data, config);
      expect(variance(result.values["Ip"].values)).toBeLessThan(
        variance(values),
      );
    });
  });

  describe("smoothing — uniform", () => {
    it("preserves signal length", () => {
      const data = makeData(Array.from({ length: 50 }, (_, i) => i));
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "smoothing",
            signal_name: "Ip",
            method: "uniform",
            sigma: 5,
          },
        ],
      };
      expect(
        applyPreprocessingClientSide(data, config).values["Ip"].values,
      ).toHaveLength(50);
    });

    it("leaves a constant signal unchanged", () => {
      const data = makeData(Array(40).fill(3));
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "smoothing",
            signal_name: "Ip",
            method: "uniform",
            sigma: 10,
          },
        ],
      };
      const result = applyPreprocessingClientSide(data, config);
      result.values["Ip"].values.forEach((v) => expect(v).toBeCloseTo(3, 5));
    });
  });

  describe("background subtraction", () => {
    it("preserves signal length", () => {
      const data = makeData(Array.from({ length: 200 }, (_, i) => i));
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "background_subtraction",
            signal_name: "Ip",
            window_size: 20,
          },
        ],
      };
      expect(
        applyPreprocessingClientSide(data, config).values["Ip"].values,
      ).toHaveLength(200);
    });

    it("reduces a constant signal to zero", () => {
      const data = makeData(Array(100).fill(7));
      const config: PreprocessingConfig = {
        steps: [
          {
            type: "background_subtraction",
            signal_name: "Ip",
            window_size: 10,
          },
        ],
      };
      const result = applyPreprocessingClientSide(data, config);
      result.values["Ip"].values.forEach((v) => expect(v).toBeCloseTo(0, 10));
    });
  });

  describe("normalisation — zscore", () => {
    it("produces mean near zero", () => {
      const data = makeData([1, 2, 3, 4, 5]);
      const config: PreprocessingConfig = {
        steps: [{ type: "normalisation", signal_name: "Ip", method: "zscore" }],
      };
      const result = applyPreprocessingClientSide(data, config);
      const values = result.values["Ip"].values;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean).toBeCloseTo(0, 5);
    });

    it("preserves signal length", () => {
      const data = makeData(Array.from({ length: 50 }, (_, i) => i));
      const config: PreprocessingConfig = {
        steps: [{ type: "normalisation", signal_name: "Ip", method: "zscore" }],
      };
      expect(
        applyPreprocessingClientSide(data, config).values["Ip"].values,
      ).toHaveLength(50);
    });
  });

  describe("normalisation — minmax", () => {
    it("maps minimum to 0 and maximum to 1", () => {
      const data = makeData([3, 1, 4, 1, 5, 9, 2, 6]);
      const config: PreprocessingConfig = {
        steps: [{ type: "normalisation", signal_name: "Ip", method: "minmax" }],
      };
      const result = applyPreprocessingClientSide(data, config);
      const values = result.values["Ip"].values;
      expect(Math.min(...values)).toBeCloseTo(0, 5);
      expect(Math.max(...values)).toBeCloseTo(1, 5);
    });

    it("preserves signal length", () => {
      const data = makeData(Array.from({ length: 30 }, (_, i) => i));
      const config: PreprocessingConfig = {
        steps: [{ type: "normalisation", signal_name: "Ip", method: "minmax" }],
      };
      expect(
        applyPreprocessingClientSide(data, config).values["Ip"].values,
      ).toHaveLength(30);
    });
  });

  it("applies multiple steps in sequence (order matters)", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const data = makeData(values);

    const configNS: PreprocessingConfig = {
      steps: [
        { type: "normalisation", signal_name: "Ip", method: "zscore" },
        { type: "smoothing", signal_name: "Ip", method: "gaussian", sigma: 1 },
      ],
    };
    const configSN: PreprocessingConfig = {
      steps: [
        { type: "smoothing", signal_name: "Ip", method: "gaussian", sigma: 1 },
        { type: "normalisation", signal_name: "Ip", method: "zscore" },
      ],
    };

    const r1 = applyPreprocessingClientSide(data, configNS).values["Ip"].values;
    const r2 = applyPreprocessingClientSide(data, configSN).values["Ip"].values;

    expect(r1).not.toEqual(r2);
  });

  it("step on one signal does not affect another signal", () => {
    const data: MultiVariateTimeSeriesData = {
      values: {
        Ip: { time: [0, 1, 2, 3, 4], values: [0, 1, 2, 3, 4] },
        Ne: { time: [0, 1, 2, 3, 4], values: [10, 10, 10, 10, 10] },
      },
    };
    const config: PreprocessingConfig = {
      steps: [{ type: "normalisation", signal_name: "Ip", method: "zscore" }],
    };
    const result = applyPreprocessingClientSide(data, config);
    expect(result.values["Ne"].values).toEqual([10, 10, 10, 10, 10]);
    expect(result.values["Ip"].values).not.toEqual([0, 1, 2, 3, 4]);
  });
});
