"use client";
import {Provider, defaultTheme, Button, ButtonGroup, Slider, Flex, Header, ToggleButton, RangeSlider} from '@adobe/react-spectrum'
import { useEffect, useState } from 'react';

export default function FindPeaksTool({ project_id, sample_id, data, setAnnotations }) {
    const [prominence, setProminance] = useState(0.1);
    const [distance, setDistance] = useState(1);
    const [clearPeaks, setClearPeaks] = useState(false);

    const [timeMinDefault, setTimeMinDefault] = useState(null);
    const [timeMaxDefault, setTimeMaxDefault] = useState(null);
    const [timeRange, setTimeRange] = useState({start: 0, end: 100}); 

    useEffect(() => {
        if (data) {
            const tmin = Math.min(...data.time);
            const tmax = Math.max(...data.time)
            setTimeMinDefault(tmin);
            setTimeMaxDefault(tmax);
        }
    }, [data]);

    useEffect(() => {
        const fetchData = async () => {
            if (clearPeaks) {
            setAnnotations([]);
            return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/models/abc/predict/${sample_id}`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    prominence: prominence,
                    distance: distance,
                    time_min: timeRange.start,
                    time_max: timeRange.end,
                }),
            });

            const payload = await response.json();
            setAnnotations(payload);
        };

        fetchData();
    }, [prominence, distance, clearPeaks, timeRange]);


    return (
        <Provider theme={defaultTheme}>
            <Header>Find Peaks</Header>
            <div className='m-4'>
            <Flex direction="column">
                <Slider label="Prominence" minValue={0.01} maxValue={1} defaultValue={prominence} step={0.001} onChangeEnd={setProminance}/>
                <Slider label="Distance" minValue={1} maxValue={100} defaultValue={distance} onChangeEnd={setDistance}/>
                <RangeSlider label="Time Range" defaultValue={{ start: timeMinDefault, end: timeMaxDefault }} value={timeRange} onChange={setTimeRange} step={0.001} minValue={timeMinDefault} maxValue={timeMaxDefault}/>
                <ToggleButton isSelected={clearPeaks} onChange={setClearPeaks}>Clear Peaks</ToggleButton>
            </Flex>
            </div>
        </Provider>
    );
}