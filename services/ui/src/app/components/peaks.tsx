"use client";
import { useEffect, useState } from 'react';
import { Annotation, Annotations, MultiVariateTimeSeriesData } from '@/types';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item, RangeSlider} from '@adobe/react-spectrum'
import { saveAnnotatorProps, loadAnnotatorProps } from '@/app/core';

type PeakDetectionAnnotatorProps = {
    prominence: number;
    distance: number;
    timeRange: { start: number; end: number };
    signalName: string | null;
}

type PeakDetectionToolInfo = {
  project_id: string;
  sample_id: string;
  data: MultiVariateTimeSeriesData;
  setAnnotations: (annotations: Annotations | ((prev: Annotations) => Annotations)) => void;
};
export function PeakDetectionTool({ project_id, sample_id, data, setAnnotations } : PeakDetectionToolInfo) {
    // Load previously saved annotator props from sessionStorage
    const peakToolProps: PeakDetectionAnnotatorProps | null = loadAnnotatorProps<PeakDetectionAnnotatorProps>(`peakToolProps_${project_id}`);

    const [prominence, setProminance] = useState<number>(peakToolProps?.prominence || 5);
    const [distance, setDistance] = useState<number>(peakToolProps?.distance || 1);

    const [timeMinDefault, setTimeMinDefault] = useState<number>(0);
    const [timeMaxDefault, setTimeMaxDefault] = useState<number>(0);
    const [timeRange, setTimeRange] = useState<{ start: number; end: number }>(peakToolProps?.timeRange || {start: 0, end: 100});
    const [signalName, setSignalName] = useState<string | null>(peakToolProps?.signalName || null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const validSignal = signalName !== null && (signalName in data.values)

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
          `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/models/abc/predict/${sample_id}`,
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
          }
        );

        const payload = await response.json();
        setAnnotations((previousAnnotations: Annotation[]) => {
            const otherAnnotations = previousAnnotations.filter((annotation: Annotation) => annotation.created_by !== 'peak_detection');
            return otherAnnotations.concat(payload);
        });
      };

      fetchData();
    }, [project_id, sample_id, prominence, distance, timeRange, signalName, setAnnotations, validSignal]);

    useEffect(() => {
        const toolProps: PeakDetectionAnnotatorProps = {
            prominence,
            distance,
            timeRange,
            signalName
        };
        saveAnnotatorProps(`peakToolProps_${project_id}`, toolProps);
    }, [prominence, distance, timeRange, signalName]);

    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox label='Signal Name' defaultItems={signalOptions} onInputChange={setSignalName}>
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Prominence" minValue={0.01} maxValue={10} defaultValue={prominence} step={0.001} onChangeEnd={setProminance}/>
                <Slider label="Distance" minValue={1} maxValue={1000} defaultValue={distance} onChangeEnd={setDistance}/>
                <RangeSlider label="Time Range" defaultValue={{ start: timeMinDefault, end: timeMaxDefault }} value={timeRange} onChangeEnd={setTimeRange} step={0.001} minValue={timeMinDefault} maxValue={timeMaxDefault}/>
            </Flex>
            </div>
        </Provider>
    );
}
