import { useState, useEffect } from "react";
import {Provider, defaultTheme, ComboBox, Item, Flex, ActionButton, Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Header, Footer, Heading, Text} from '@adobe/react-spectrum';
import WorkflowAdd from '@spectrum-icons/workflow/WorkflowAdd';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';

// This should be added to the toolbar
export function ModelPredictTool({project, sample_id, setAnnotations}) { // all of this should be typed, waiting on Sam's PR

    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
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
                setAnnotations((previousAnnotations) => { // add type for annotations, wait for Sams PR
                    const otherAnnotations = previousAnnotations.filter((annotation) => annotation.created_by !== selectedModel);
                    return otherAnnotations.concat(payload);
                });
            } else {
                setErrorMessage(payload.detail)                
            };
        }
        fetchData();
    }, [selectedModel]);


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
            </Flex>
            </div>
        </Provider>
    );
}