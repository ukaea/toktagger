import { useEffect, useState } from 'react';
import {Provider, defaultTheme, Slider, Flex, ComboBox, Item } from '@adobe/react-spectrum'
import { Annotation } from "@/types";

type IsoForestOutliersType = {
    project_id: string;
    sample_id: string;
    data: any;
    setAnnotations: (annotations: Annotation[]) => void;
};


export function IsoForestTool({ project_id, sample_id, data, setAnnotations }: IsoForestOutliersType) {
    const [signalName, setSignalName] = useState(null);
    const signalOptions = Object.keys(data.values).map((value, index)=> ({id: index, name: value}));
    const [contamination, setContamination] = useState(0.25);
   
    useEffect(() => {
        const fetchData = async () => {
            if (signalName == null && !(signalName in data.values)) {
                return;
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/isoforest_outliers`, {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    signal_name: signalName,
                    contamination: contamination,
                }),
            });

            const payload = await response.json();
            console.log(payload);
            setAnnotations(payload);
        };
        fetchData();
    }, [signalName, contamination]);


    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox defaultItems={signalOptions} onInputChange={setSignalName} allowsEmptyCollection={true} placeholder="None selected">
                    {x => <Item>{x.name}</Item>}
                </ComboBox>
                <br/>
                <Slider label="Contamination" minValue={0.0001} maxValue={0.5} defaultValue={contamination} step={0.0001} onChangeEnd={setContamination}/>
            </Flex>
            </div>
        </Provider>
    );
}