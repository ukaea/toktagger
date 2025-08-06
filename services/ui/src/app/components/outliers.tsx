import { use, useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation, Annotations, MultiVariateTimeSeriesData } from "@/types";
import { loadAnnotatorProps } from '../core';

type OutlierDetectionAnnotatorProps = {
    threshold: number;
    contamination: number;
    method: string;
    signalName: string | null;
}


type OutlierDetectionType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotations | ((prev: Annotations) => Annotations)) => void;
};

export function OutlierDetectionTool({ project_id, sample_id, data, setAnnotations }: OutlierDetectionType) {
    // Load previously saved annotator props from sessionStorage
    const outlierToolProps: OutlierDetectionAnnotatorProps | null = loadAnnotatorProps<OutlierDetectionAnnotatorProps>(`outlierToolProps_${project_id}`);
    const methodOptions = [{id: 0, name: "mad"}, {id: 1, name: "isoforest"}];
    const [signalName, setSignalName] = useState(outlierToolProps?.signalName || null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const [threshold, setThreshold] = useState(outlierToolProps?.threshold || 3);
    const [contamination, setContamination] = useState(outlierToolProps?.contamination || 0);
    const [method, setMethod] = useState(outlierToolProps?.method || "mad");

    useEffect(() => {
        const fetchData = async () => {
            if (signalName == null || !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/outlier_detection`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    method: method,
                    threshold: threshold,
                    contamination: contamination,
                }),
            });

            const payload = await response.json();
            setAnnotations((previousAnnotations: Annotations) => {
                const otherAnnotations = previousAnnotations.filter((annotation: Annotation) => annotation.created_by !== 'outlier_detection');
                return otherAnnotations.concat(payload);
            });
        };
        fetchData();
    }, [signalName, threshold, contamination, method]);

    useEffect(() => {
        const toolProps: OutlierDetectionAnnotatorProps = {
            threshold,
            contamination,
            method,
            signalName
        };
        // Save annotator props to sessionStorage
        sessionStorage.setItem(`outlierToolProps_${project_id}`, JSON.stringify(toolProps));
    }, [threshold, contamination, method, signalName]);

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
                { (method === "mad") && (
                    <>
                    <Slider label="Threshold" minValue={1} maxValue={100} defaultValue={threshold} step={0.001} onChangeEnd={setThreshold}/>
                    <br/>
                    </>
                )}
                { (method === "isoforest") && (
                    <>
                    <Slider label="Contamination" minValue={0} maxValue={0.5} defaultValue={contamination} step={0.0001} onChangeEnd={setContamination}/>
                    <br/>
                    </>
                )}
            </Flex>
            </div>
        </Provider>
    );
}