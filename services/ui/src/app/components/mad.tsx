import { useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation, MultiVariateTimeSeriesData } from "@/types";

type MeanAbsoluteDeviationOutliersType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotation[]) => void;
};

export function MeanAbsoluteDeviationOutliersTool({ project_id, sample_id, data, setAnnotations }: MeanAbsoluteDeviationOutliersType) {
    const [signalName, setSignalName] = useState(null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const [threshold, setThreshold] = useState(3);

    useEffect(() => {
        const fetchData = async () => {
            if (signalName == null && !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/mean_absolute_deviation`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    threshold: threshold,
                }),
            });

            const payload = await response.json();
            console.log(payload);
            setAnnotations(payload);
        };
        fetchData();
    }, [signalName, threshold]);


    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true} placeholder="None selected">
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Threshold" minValue={1} maxValue={100} defaultValue={threshold} step={0.001} onChangeEnd={setThreshold}/>
            </Flex>
            </div>
        </Provider>
    );
}