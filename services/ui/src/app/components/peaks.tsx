"use client";
import { Annotations, MultiVariateTimeSeriesData } from "@/types";
import {
  Provider,
  defaultTheme,
  Slider,
  Button,
  Flex,
  Header,
  ComboBox,
  Item,
  RangeSlider,
} from "@adobe/react-spectrum";
import { RangeValue } from "@react-types/shared";
import { useEffect, useState } from "react";
import { BACKEND_API_URL } from "../core";

type FindPeaksToolInfo = {
  project_id: string;
  sample_id: string;
  data: MultiVariateTimeSeriesData;
  setAnnotations: (annotations: Annotations) => void;
};

export function FindPeaksTool({
  project_id,
  sample_id,
  data,
  setAnnotations,
}: FindPeaksToolInfo) {
  const [prominence, setProminance] = useState<number>(0.1);
  const [distance, setDistance] = useState<number>(1);

  const [timeMinDefault, setTimeMinDefault] = useState<number | null>(null);
  const [timeMaxDefault, setTimeMaxDefault] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<RangeValue<number>>({
    start: 0,
    end: 100,
  });
  const [signalName, setSignalName] = useState<string | null>(null);
  const signalOptions = Object.keys(data.values).map((value, index) => ({
    id: index,
    name: value,
  }));

  const validSignal = signalName !== null && signalName in data.values;

  const clearPeaks = () => {
    setAnnotations([]);
  };

  useEffect(() => {
    if (data && validSignal) {
      const time = data.values[signalName].time;
      const tmin = Math.min(...time);
      const tmax = Math.max(...time);
      setTimeMinDefault(tmin);
      setTimeMaxDefault(tmax);
    }
  }, [data, signalName, validSignal]);

  useEffect(() => {
    const fetchData = async () => {
      if (!validSignal) {
        return;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotator/find_peaks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signal_name: signalName,
            prominence: prominence,
            distance: distance,
            time_min: timeRange.start,
            time_max: timeRange.end,
          }),
        },
      );

      const payload = await response.json();
      setAnnotations(payload);
    };

    fetchData();
  }, [
    project_id,
    sample_id,
    prominence,
    distance,
    timeRange,
    signalName,
    setAnnotations,
    validSignal,
  ]);

  return (
    <Provider theme={defaultTheme}>
      <Header>Find Peaks</Header>
      <div className="m-4">
        <Flex direction="column">
          <ComboBox
            defaultItems={signalOptions}
            onInputChange={setSignalName}
            label="Signal Name"
          >
            {(x) => <Item>{x.name}</Item>}
          </ComboBox>
          <br />
          <Slider
            label="Prominence"
            minValue={0.01}
            maxValue={1}
            defaultValue={prominence}
            step={0.001}
            onChangeEnd={setProminance}
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
            defaultValue={{
              start: timeMinDefault || 0,
              end: timeMaxDefault || 0,
            }}
            value={timeRange}
            onChangeEnd={setTimeRange}
            step={0.001}
            minValue={timeMinDefault || 0}
            maxValue={timeMaxDefault || 0}
          />
          <br />
          <Button variant="primary" onPress={clearPeaks}>
            Clear Peaks
          </Button>
        </Flex>
      </div>
    </Provider>
  );
}
