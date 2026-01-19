"use client";
import { useEffect, useMemo, useState } from "react";
import { Annotation, MultiVariateTimeSeriesDataSchema } from "@/types";
import {
  Provider,
  defaultTheme,
  Slider,
  Flex,
  ComboBox,
  Item,
  RangeSlider,
  Switch,
} from "@adobe/react-spectrum";
import { AnnotatorTypes } from "./types";
import { BACKEND_API_URL } from "@/app/core";
import { useSample } from "@/app/contexts/SampleContext";

type PeakDetectionType = {
  project_id: string;
  sample_id: string;
};
export function PeakDetectionTool({
  project_id,
  sample_id,
}: PeakDetectionType) {
  const { setAnnotations, dataParams, data } = useSample();
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [prominence, setProminence] = useState<number>(5);
  const [distance, setDistance] = useState<number>(1);

  const [timeMinDefault, setTimeMinDefault] = useState<number>(0);
  const [timeMaxDefault, setTimeMaxDefault] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 100,
  });

  const dataValues = useMemo(
    () => MultiVariateTimeSeriesDataSchema.safeParse(data).data?.values || {},
    [data]
  );

  const [signalName, setSignalName] = useState<string | null>(null);
  const signalOptions = Object.keys(dataValues).map((value, index) => ({
    id: index,
    name: value,
  }));

  const validSignal = signalName !== null && signalName in dataValues;

  useEffect(() => {
    if (data && signalName !== null && signalName in dataValues) {
      const time = dataValues[signalName].time;
      const tmin = Math.min(...time);
      const tmax = Math.max(...time);
      setTimeMinDefault(tmin);
      setTimeMaxDefault(tmax);
    }
  }, [dataValues, signalName, data]);

  useEffect(() => {
    const fetchData = async () => {
      if (!validSignal || !isEnabled) {
        // Remove previous annotations from this annotator
        setAnnotations((previousAnnotations: Annotation[]) => {
          const otherAnnotations = previousAnnotations.filter(
            (annotation: Annotation) =>
              annotation.created_by !== AnnotatorTypes.PEAK_DETECTION
          );
          return otherAnnotations;
        });

        return;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotator/peak_detection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            annotator_params: {
              signal_name: signalName,
              prominence: prominence,
              distance: distance,
              time_min: timeRange.start,
              time_max: timeRange.end,
            },
            data_params: dataParams,
          }),
        }
      );

      const payload: Annotation[] = await response.json();
      setAnnotations((previousAnnotations: Annotation[]) => {
        const otherAnnotations = previousAnnotations.filter(
          (annotation: Annotation) =>
            annotation.created_by !== AnnotatorTypes.PEAK_DETECTION
        );
        return otherAnnotations.concat(payload);
      });
    };

    fetchData();
  }, [
    project_id,
    sample_id,
    prominence,
    distance,
    timeRange,
    isEnabled,
    signalName,
    validSignal,
    dataParams,
    setAnnotations,
  ]);

  return (
    <Provider theme={defaultTheme}>
      <div className="m-4">
        <Flex direction="column">
          <Switch isSelected={isEnabled} onChange={setIsEnabled}>
            Enable Tool
          </Switch>
          <ComboBox
            label="Signal Name"
            defaultInputValue={signalName ?? undefined}
            defaultItems={signalOptions}
            onInputChange={setSignalName}
          >
            {(x) => <Item>{x.name}</Item>}
          </ComboBox>
          <br />
          <Slider
            label="Prominence"
            minValue={0.01}
            maxValue={10}
            defaultValue={prominence}
            step={0.001}
            onChangeEnd={setProminence}
          />
          <Slider
            label="Distance"
            minValue={1}
            maxValue={1000}
            defaultValue={distance}
            onChangeEnd={setDistance}
          />
          <RangeSlider
            label="Time Range"
            defaultValue={{ start: timeMinDefault, end: timeMaxDefault }}
            value={timeRange}
            onChangeEnd={setTimeRange}
            step={0.001}
            minValue={timeMinDefault}
            maxValue={timeMaxDefault}
          />
        </Flex>
      </div>
    </Provider>
  );
}
