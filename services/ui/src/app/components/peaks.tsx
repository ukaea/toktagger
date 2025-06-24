"use client";
import {Provider, defaultTheme, Slider, Button, Flex, Header, ComboBox, Item, RangeSlider} from '@adobe/react-spectrum'
import { useEffect, useState } from 'react';

export function FindPeaksTool({ project_id, sample_id, data, setAnnotations }) {
    const [prominence, setProminance] = useState(0.1);
    const [distance, setDistance] = useState(1);

    const [timeMinDefault, setTimeMinDefault] = useState<number>(null);
    const [timeMaxDefault, setTimeMaxDefault] = useState<number>(null);
    const [timeRange, setTimeRange] = useState<Record<string, number>>({start: 0, end: 100}); 
    const [signalName, setSignalName] = useState<string>(null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));

    const clearPeaks = () => {
        setAnnotations([]);
    };

    useEffect(() => {
        if (signalName == null) {
            return;
        }

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

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/models/abc/predict/${sample_id}`, {
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
            setAnnotations(payload);
        };

        fetchData();
    }, [prominence, distance, timeRange, signalName]);



    return (
        <Provider theme={defaultTheme}>
            <Header>Find Peaks</Header>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true} placeholder="None selected">
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Prominence" minValue={0.01} maxValue={1} defaultValue={prominence} step={0.001} onChangeEnd={setProminance}/>
                <Slider label="Distance" minValue={1} maxValue={1000} defaultValue={distance} onChangeEnd={setDistance}/>
                <RangeSlider label="Time Range" defaultValue={{ start: timeMinDefault, end: timeMaxDefault }} value={timeRange} onChangeEnd={setTimeRange} step={0.001} minValue={timeMinDefault} maxValue={timeMaxDefault}/>
                <br />
                <Button variant="primary" onPress={clearPeaks} >Clear Peaks</Button>
            </Flex>
            </div>
        </Provider>
    );
}