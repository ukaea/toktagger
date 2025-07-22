import { useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation, MultiVariateTimeSeriesData } from "@/types";

type JumpDetectionType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotation[]) => void;
};

export function JumpDetectionTool({ project_id, sample_id, data, setAnnotations }: JumpDetectionType) {
    const [signalName, setSignalName] = useState(null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const [threshold, setThreshold] = useState(5);
    const [minDistance, setMinDistance] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            if (signalName == null && !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/jump_detection`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    threshold: threshold,
                    min_distance: minDistance
                }),
            });

            const payload = await response.json();
            console.log(payload);
            setAnnotations(payload);
        };
        fetchData();
    }, [signalName, minDistance, threshold]);


    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true} placeholder="None selected">
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Threshold" minValue={1.1} maxValue={5} step={0.01} defaultValue={threshold}  onChangeEnd={setThreshold}/>
                <br/>
                <Slider label="Minimum Distance" minValue={1} maxValue={100} step={1} defaultValue={minDistance} onChangeEnd={setMinDistance}/>
            </Flex>
            </div>
        </Provider>
    );
}