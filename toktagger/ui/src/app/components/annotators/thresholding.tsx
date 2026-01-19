import { useSample } from "@/app/contexts/SampleContext";
import { BACKEND_API_URL } from "@/app/core";
import {
  Annotation,
  SpectrogramDataSchema,
  SpectrogramViewParams,
  SpectrogramViewParamsSchema,
} from "@/types";
import { Flex, NumberField, RangeSlider, Switch } from "@adobe/react-spectrum";
import { useEffect, useState } from "react";
import { AnnotatorTypes } from "./types";
import { z } from "zod";
import NumberStepper from "../ui/number_stepper";
import { getSignalNames } from "@/app/utils";

const SpectrogramThresholdParamsSchema = z.object({
  signal_name: z.string(),
  percentile: z.number(),
  freq_max: z.number().default(50),
  freq_min: z.number().default(3),
  sigma: z.number().default(2),
  min_size: z.number().int().default(150),
  line_filter_width: z.number().int().default(0),
  nfft: z.number().int().default(256),
  nperseg: z.number().int().default(256),
});

type SpectrogramThresholdParams = z.infer<
  typeof SpectrogramThresholdParamsSchema
>;

type SpectrogramThresholdToolInfo = {
  project_id: string;
  sample_id: string;
};

export default function SpectrogramThresholdTool({
  project_id,
  sample_id,
}: SpectrogramThresholdToolInfo) {
  const {
    sample,
    setAnnotations,
    dataParams,
    data,
    viewParams,
    plotProps,
    setPlotProps,
  } = useSample();

  const signalNames = getSignalNames(sample);
  const signalName =
    (viewParams as SpectrogramViewParams)?.signal_name || signalNames[0];
  const [isEnabled, setIsEnabled] = useState(false);

  const params: SpectrogramThresholdParams =
    SpectrogramThresholdParamsSchema.parse({
      signal_name: signalName,
      percentile: 95,
    });

  // Tooling properties
  const [frequencyRange, setFrequencyRange] = useState<{
    start: number;
    end: number;
  }>({
    start: params.freq_min,
    end: params.freq_max,
  });

  const [defaultFrequencyRange, setDefaultFrequencyRange] = useState<{
    start: number;
    end: number;
  }>({
    start: params.freq_min,
    end: params.freq_max,
  });

  const [percentile, setPercentile] = useState(params.percentile);
  const [sigma, setSigma] = useState<number>(params.sigma);
  const [minSize, setMinSize] = useState<number>(params.min_size);
  const [lineFilterWidth, setLineFilterWidth] = useState(
    params.line_filter_width
  );

  const onThresholdChange = (value: boolean) => {
    setIsEnabled(value);
    setPlotProps({ ...plotProps, thresholdActive: value });
  };

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const fetchData = async () => {
      if (!signalName) return;

      const viewParamsParsed = SpectrogramViewParamsSchema.parse(viewParams);
      const nfft = viewParamsParsed.nfft;
      const nperseg = viewParamsParsed.nperseg;

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotator/spectrogram_threshold`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            annotator_params: {
              signal_name: signalName,
              percentile: percentile,
              freq_min: frequencyRange.start,
              freq_max: frequencyRange.end,
              sigma: isNaN(sigma) ? 0 : sigma,
              min_size: isNaN(minSize) ? 0 : minSize,
              line_filter_width: lineFilterWidth,
              nfft: nfft,
              nperseg: nperseg,
            },
            data_params: dataParams,
          }),
        }
      );

      const payload: Annotation[] = await response.json();
      setAnnotations((previousAnnotations: Annotation[]) => {
        const otherAnnotations = previousAnnotations.filter(
          (annotation: Annotation) =>
            annotation.signal_name !== signalName &&
            annotation.created_by !== AnnotatorTypes.SPECTROGRAM_THRESHOLD
        );
        return otherAnnotations.concat(payload);
      });
    };

    fetchData();
  }, [
    project_id,
    sample_id,
    isEnabled,
    percentile,
    signalName,
    setAnnotations,
    dataParams,
    frequencyRange,
    lineFilterWidth,
    minSize,
    sigma,
    viewParams,
  ]);

  useEffect(() => {
    if (!isEnabled) return;
    if (!data || !SpectrogramDataSchema.safeParse(data).success) return;

    const specData = SpectrogramDataSchema.parse(data);

    const freqencyMinValue = specData.frequency[0];
    const frequencyMaxValue = specData.frequency[specData.frequency.length - 1];
    setDefaultFrequencyRange({
      start: freqencyMinValue,
      end: frequencyMaxValue,
    });
    setFrequencyRange({
      start: freqencyMinValue,
      end: frequencyMaxValue,
    });
  }, [data, isEnabled]);

  return (
    <Flex direction="column" gap="size-200" justifyContent="start">
      <Switch isSelected={isEnabled} onChange={onThresholdChange}>
        Thresholding
      </Switch>
      {isEnabled && (
        <>
          <NumberStepper
            label="Percentile"
            defaultValue={percentile}
            onChange={(value: number) => {
              setPercentile(value);
            }}
          />
          <RangeSlider
            label="Frequency Range (Hz)"
            value={frequencyRange}
            minValue={defaultFrequencyRange.start}
            maxValue={defaultFrequencyRange.end}
            step={1}
            onChangeEnd={setFrequencyRange}
          />
          <NumberField
            label="Sigma"
            value={sigma}
            minValue={0}
            onChange={setSigma}
            step={0.001}
          />
          <NumberField
            label="Min Size"
            value={minSize}
            minValue={0}
            onChange={setMinSize}
            formatOptions={{ maximumFractionDigits: 0 }}
          />
          <NumberField
            label="Vertical Line Filter Width"
            value={lineFilterWidth}
            minValue={0}
            onChange={setLineFilterWidth}
            formatOptions={{ maximumFractionDigits: 0 }}
          />
        </>
      )}
    </Flex>
  );
}
