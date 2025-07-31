import { use, useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation, MultiVariateTimeSeriesData } from "@/types";
import { loadAnnotatorProps } from '../core';

type ChangePointDetectionAnnotatorProps = {
    signalName: string | null;
    method: string;
    penalty: number;
    numPoints: number;
    numComponents: number;
}

type ChangePointDetectionType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotation[]) => void;
};

export function ChangePointDetectionTool({ project_id, sample_id, data, setAnnotations }: ChangePointDetectionType) {
    const changePointToolProps: ChangePointDetectionAnnotatorProps | null = loadAnnotatorProps<ChangePointDetectionAnnotatorProps>(`changePointToolProps_${project_id}`);
    const methodOptions = [{id: 0, name: "pelt"}, {id: 1, name: "hmm"}];
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));

    const [signalName, setSignalName] = useState(changePointToolProps?.signalName || null);
    const [penalty, setPenalty] = useState(changePointToolProps?.penalty || 5);
    const [numPoints, setNumPoints] = useState(changePointToolProps?.numPoints || 500);
    const [method, setMethod] = useState(changePointToolProps?.method || "pelt");
    const [numComponents, setNumComponents] = useState(changePointToolProps?.numComponents || 3);

    useEffect(() => {
        const fetchData = async () => {
            if (signalName === null && !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/change_point_detection`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    method: method,
                    penalty: penalty,
                    num_points: numPoints,
                    num_components: numComponents
                }),
            });

            const payload = await response.json();
            setAnnotations(previousAnnotations => {
                const otherAnnotations = previousAnnotations.filter((annotation: Annotation) => annotation.created_by !== 'change_point_detection');
                return otherAnnotations.concat(payload);
            });
        };
        fetchData();
    }, [signalName, penalty, method, numPoints, numComponents]);

    useEffect(() => {
        const toolProps: ChangePointDetectionAnnotatorProps = {
            signalName,
            method,
            penalty,
            numPoints,
            numComponents
        };
        // Save annotator props to sessionStorage
        sessionStorage.setItem(`changePointToolProps_${project_id}`, JSON.stringify(toolProps));
    }, [signalName, penalty, method, numPoints, numComponents]);

    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox label="Signal Name" defaultInputValue={signalName} defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true}>
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <ComboBox label="Method" defaultItems={methodOptions} defaultInputValue={method} onInputChange={setMethod}>
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                {(method === "pelt") && (
                    <>
                    <Slider label="Penalty" minValue={0.01} maxValue={30} defaultValue={penalty} step={0.001} onChangeEnd={setPenalty}/>
                    <br/>
                    </>
                )}
                {(method === "hmm") && (
                    <>
                    <Slider label="No. Components" minValue={1} maxValue={10} defaultValue={numComponents} step={1} onChangeEnd={setNumComponents}/>   
                    <br/>
                    </>
                )}
                <Slider label="No. Points" minValue={100} maxValue={1000} defaultValue={numPoints} step={10} onChangeEnd={setNumPoints}/>
            </Flex>
            </div>
        </Provider>
    );
}