import {
  MultiVariateTimeSeriesData,
  PreprocessingConfig,
  PreprocessingStep,
  SmoothingStep,
  BackgroundSubtractionStep,
  NormalisationStep,
} from "@/types";

function gaussianKernel(sigma: number): number[] {
  const halfSize = Math.ceil(sigma * 3);
  const size = 2 * halfSize + 1;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - halfSize;
    const v = Math.exp(-0.5 * (x / sigma) ** 2);
    kernel.push(v);
    sum += v;
  }
  return kernel.map((k) => k / sum);
}

function convolve1d(signal: number[], kernel: number[]): number[] {
  const n = signal.length;
  const half = Math.floor(kernel.length / 2);
  return Array.from({ length: n }, (_, i) => {
    let sum = 0;
    let wsum = 0;
    for (let j = 0; j < kernel.length; j++) {
      const si = i + j - half;
      if (si >= 0 && si < n) {
        sum += signal[si] * kernel[j];
        wsum += kernel[j];
      }
    }
    return wsum > 0 ? sum / wsum : 0;
  });
}

function applySmoothing(values: number[], step: SmoothingStep): number[] {
  if (step.method === "gaussian") {
    return convolve1d(values, gaussianKernel(step.sigma));
  }
  // uniform: moving average with window = round(sigma)
  const half = Math.max(0, Math.floor(step.sigma / 2));
  return Array.from({ length: values.length }, (_, i) => {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - half);
      j <= Math.min(values.length - 1, i + half);
      j++
    ) {
      sum += values[j];
      count++;
    }
    return count > 0 ? sum / count : 0;
  });
}

function applyBackgroundSubtraction(
  values: number[],
  step: BackgroundSubtractionStep,
): number[] {
  const w = step.window_size;
  const half = Math.floor(w / 2);
  const trend = Array.from({ length: values.length }, (_, i) => {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - half);
      j <= Math.min(values.length - 1, i + half);
      j++
    ) {
      sum += values[j];
      count++;
    }
    return count > 0 ? sum / count : 0;
  });
  return values.map((v, i) => v - trend[i]);
}

function applyNormalisation(
  values: number[],
  step: NormalisationStep,
): number[] {
  if (step.method === "zscore") {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
    );
    return values.map((v) => (v - mean) / (std + 1e-8));
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => (v - min) / (max - min + 1e-8));
}

function applyStep(values: number[], step: PreprocessingStep): number[] {
  if (step.type === "smoothing") return applySmoothing(values, step);
  if (step.type === "background_subtraction")
    return applyBackgroundSubtraction(values, step);
  return applyNormalisation(values, step);
}

export function applyPreprocessingClientSide(
  data: MultiVariateTimeSeriesData,
  config: PreprocessingConfig,
): MultiVariateTimeSeriesData {
  if (!config.steps.length) return data;

  const newValues = { ...data.values };
  for (const step of config.steps) {
    const ts = newValues[step.signal_name];
    if (!ts) continue;
    newValues[step.signal_name] = {
      ...ts,
      values: applyStep([...ts.values], step),
    };
  }
  return { values: newValues };
}
