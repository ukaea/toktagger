import { useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation, MultiVariateTimeSeriesData } from "@/types";

type ChangePointDetectionType = {
    project_id: string;
    sample_id: string;
    data: MultiVariateTimeSeriesData;
    setAnnotations: (annotations: Annotation[]) => void;
};

export function ChangePointDetectionTool({ project_id, sample_id, data, setAnnotations }: ChangePointDetectionType) {
    const [signalName, setSignalName] = useState(null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const [penalty, setPenalty] = useState(5);
    const [numPoints, setNumPoints] = useState(500);

    useEffect(() => {
        const fetchData = async () => {
            if (signalName == null && !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/change_point_detection`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    penalty: penalty,
                    num_points: numPoints
                }),
            });

            const payload = await response.json();
            console.log(payload);
            setAnnotations(payload);
        };
        fetchData();
    }, [signalName, penalty]);


    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true} placeholder="None selected">
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Penalty" minValue={0.01} maxValue={30} defaultValue={penalty} step={0.001} onChangeEnd={setPenalty}/>
                <br/>
                <Slider label="No. Points" minValue={100} maxValue={1000} defaultValue={numPoints} step={10} onChangeEnd={setNumPoints}/>
            </Flex>
            </div>
        </Provider>
    );
}