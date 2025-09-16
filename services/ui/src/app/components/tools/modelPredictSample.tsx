import { useState, useEffect } from "react";
import {Provider, defaultTheme, ComboBox, Item, Flex, ProgressCircle} from '@adobe/react-spectrum';
import {
  Project,
  Annotations,
  Model,
} from "@/types";

type ModelPredictInfo = {
  project: Project;
  sample_id: string;
  setAnnotations: (annotations: Annotations) => void;
};

export function ModelPredictTool({project, sample_id, setAnnotations}: ModelPredictInfo ) { // all of this should be typed, waiting on Sam's PR

    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [pollCounter, setPollCounter] = useState<number>(0);

    useEffect(() => {
        const scheduleTask = async () => {
            if (selectedModel == null) {
                return;
            }
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project._id}/samples/${sample_id}/models/${selectedModel}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    },
                });
            const payload = await response.json();
            if (response.ok) {
                setIsLoading(true);
                setTaskId(payload.task_id);
            } else {
                setErrorMessage(payload.detail)                
            };
        };
        scheduleTask();
    }, [selectedModel]);

    useEffect(() => {
        const fetchData = async () => {
            if (taskId == null) {
                return;
            }
            setPollCounter(0)
            // Poll for result from GET predictions endpoint
            const interval = setInterval(async () => {
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project._id}/samples/${sample_id}/models/${selectedModel}/predict/${taskId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        },
                    });
                const payload = await response.json();
                if (response.status === 204) { // Predictions queued but not done yet, so continue to poll
                    setPollCounter(prevPollCounter => prevPollCounter + 1);
                    if (pollCounter > 10) {
                        setErrorMessage("Failed to retrieve predictions result.")      
                        clearInterval(interval)
                        setIsLoading(false);
                    }

                } else if (response.ok) {
                    setAnnotations((previousAnnotations) => { // add type for annotations, wait for Sams PR
                        const otherAnnotations = previousAnnotations.filter((annotation) => annotation.created_by !== selectedModel);
                        return otherAnnotations.concat(payload);
                    });
                    clearInterval(interval)
                    setIsLoading(false);
                } else {
                    setErrorMessage(payload.detail)      
                    clearInterval(interval)
                    setIsLoading(false);
                };
            }, 1000);
        };
        fetchData();
    }, [taskId]);


    return (
        <Provider theme={defaultTheme}>
            <div className='m-4'>
            <Flex direction="column">
                <ComboBox 
                    label="Select Model Type"
                    validationState={errorMessage ? 'invalid' : ''}
                    errorMessage={errorMessage}
                    onSelectionChange={setSelectedModel}>
                    {project.model_types.map((model_type) => (  // doesnt know the type of this, should be defined what getProject returns, imagine this is the case in more recent branch? Needs updating with model_type regardless
                        <Item key={model_type}>{model_type}</Item>
                    ))}
                </ComboBox>
                <br/>
                {isLoading ? (
                    <ProgressCircle aria-label="Loading…" isIndeterminate />
                ) : null}
            </Flex>
            </div>
        </Provider>
    );
}