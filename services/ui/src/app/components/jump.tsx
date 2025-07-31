import { useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation, Annotations, MultiVariateTimeSeriesData } from "@/types";
import { loadAnnotatorProps } from '../core';

type JumpDetectionAnnotatorProps = {
    threshold: number;
    minDistance: number;
    smoothing: number;
    numPoints: number;
    signalName: string | null;
}

type JumpDetectionType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotation[]) => void;
};

export function JumpDetectionTool({ project_id, sample_id, data, setAnnotations }: JumpDetectionType) {
    // Load previously saved annotator props from sessionStorage
    const jumpToolProps: JumpDetectionAnnotatorProps | null = loadAnnotatorProps<JumpDetectionAnnotatorProps>(`jumpToolProps_${project_id}`);

    const [signalName, setSignalName] = useState(jumpToolProps?.signalName || null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const [threshold, setThreshold] = useState(jumpToolProps?.threshold || 2);
    const [minDistance, setMinDistance] = useState(jumpToolProps?.minDistance || 5);
    const [smoothingValue, setSmoothingValue] = useState(jumpToolProps?.smoothing || 2);
    const [numPoints, setNumPoints] = useState(jumpToolProps?.numPoints || 2000);

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
                    min_distance: minDistance,
                    smoothing: smoothingValue,
                    num_points: numPoints,
                }),
            });

            const payload = await response.json();
            setAnnotations((previousAnnotations: Annotations) => {
                const otherAnnotations = previousAnnotations.filter((annotation: Annotation) => annotation.created_by !== 'jump_detection');
                return otherAnnotations.concat(payload);
            });
        };
        fetchData();
    }, [signalName, minDistance, threshold, smoothingValue, numPoints]);

    useEffect(() => {
        const toolProps: JumpDetectionAnnotatorProps = {
            threshold,
            minDistance,
            smoothing: smoothingValue,
            numPoints,
            signalName
        };
        // Save annotator props to sessionStorage
        sessionStorage.setItem(`jumpToolProps_${project_id}`, JSON.stringify(toolProps));
    }, [threshold, minDistance, smoothingValue, numPoints, signalName]);    

    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox label="Signal Name" defaultInputValue={signalName} defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true}>
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Threshold" minValue={0.5} maxValue={5} step={0.01} defaultValue={threshold}  onChangeEnd={setThreshold}/>
                <br/>
                <Slider label="Minimum Distance" minValue={1} maxValue={100} step={1} defaultValue={minDistance} onChangeEnd={setMinDistance}/>
                <br/>
                <Slider label="Smoothing" minValue={0.1} maxValue={5} step={0.1} defaultValue={smoothingValue} onChangeEnd={setSmoothingValue}/>
                <br/>
                <Slider label="No. Points" minValue={100} maxValue={5000} step={10} defaultValue={numPoints} onChangeEnd={setNumPoints}/>
            </Flex>
            </div>
        </Provider>
    );
}