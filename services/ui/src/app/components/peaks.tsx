"use client";
import { useEffect, useState } from 'react';
import { Annotation, Annotations, MultiVariateTimeSeriesData } from '@/types';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item, RangeSlider} from '@adobe/react-spectrum'

type PeakDetectionType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotation[]) => void;
};
export function PeakDetectionTool({ project_id, sample_id, data, setAnnotations } : PeakDetectionType) {
    const [prominence, setProminance] = useState(5);
    const [distance, setDistance] = useState(1);

    const [timeMinDefault, setTimeMinDefault] = useState(null);
    const [timeMaxDefault, setTimeMaxDefault] = useState(null);
    const [timeRange, setTimeRange] = useState({start: 0, end: 100}); 
    const [signalName, setSignalName] = useState(null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));

    useEffect(() => {
        if (data && (signalName in data.values)) {
            const time = data.values[signalName].time;
            const tmin = Math.min(...time);
            const tmax = Math.max(...time)
            setTimeMinDefault(tmin);
            setTimeMaxDefault(tmax);
        }
    }, [data, signalName]);

    useEffect(() => {
        const fetchData = async () => {
            if (signalName == null && !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/peak_detection`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    prominence: prominence,
                    distance: distance,
                    time_min: timeRange.start,
                    time_max: timeRange.end,
                }),
            });

            const payload = await response.json();
            setAnnotations((previousAnnotations: Annotations) => {
                const otherAnnotations = previousAnnotations.filter((annotation: Annotation) => annotation.created_by !== 'peak_detection');
                return otherAnnotations.concat(payload);
            });
        };

        fetchData();
        
    }, [prominence, distance, timeRange, signalName]);

    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox label='Signal Name' defaultInputValue={signalName} defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true}>
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