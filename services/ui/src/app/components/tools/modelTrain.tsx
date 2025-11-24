import { useState } from "react";
import {Provider, defaultTheme, ComboBox, Item, Flex, ActionButton, Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Footer, Heading, Text} from '@adobe/react-spectrum';
import WorkflowAdd from '@spectrum-icons/workflow/WorkflowAdd';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import {
  Project,
} from "@/types";
import {
    startTraining
} from "@/app/core"

export function ModelTrainModal({project}: Project) {
    const [message, setMessage] = useState<string | null>(null);
    const [messageColour, setMessageColour] = useState<string>("primary");
    const [messageIcon, setMessageIcon] = useState<JSX.Element | null>(null);
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const buttonStyle = {
        position: 'fixed',
        top: 10,
        right: 50,
        zIndex: 1000
    };

    const submitTrainJob = async () => {

        if (selectedModel == null) {
            return;
        }
        const response = await startTraining(project._id, selectedModel)

        if (response.ok) {
            setMessage("Model training added to job queue!");
            setMessageColour("positive");
            setMessageIcon(<CheckmarkCircle aria-label="Success" color="positive" size="S"/>)
        } else {
            const errorMessage = await response.json()
            setMessage(errorMessage.detail);
            setMessageColour("negative");
            setMessageIcon(<Alert aria-label="Failed" color="negative" size="S"/>)
        }
    }

    return (
        <Provider theme={defaultTheme}>
            <DialogTrigger>
                <ActionButton UNSAFE_style={buttonStyle} aria-label="Train ML Model">
                    <WorkflowAdd/>
                </ActionButton>
                {(close) => (
                    <Dialog>
                        <Heading>
                            <Flex alignItems="center" gap="size-100">
                                <WorkflowAdd size="S" />
                                <Text>
                                    Train ML Model
                                </Text>
                            </Flex>
                        </Heading>
                        <Divider />
                        <Content>
                            <ComboBox 
                                label="Select Model Type"
                                onSelectionChange={setSelectedModel}>
                                {project.model_types.map((model_type) => (
                                    <Item key={model_type}>{model_type}</Item>
                                ))}
                            </ComboBox>
                        </Content>
                        <Footer>
                            {message && (
                            <Text color={messageColour}>
                                {messageIcon} {message}
                            </Text>
                            )}
                        </Footer>
                        <ButtonGroup>
                            <Button variant="secondary" onPress={close}>Close</Button>
                            <Button variant="accent" onPress={submitTrainJob}>Train</Button>
                        </ButtonGroup>
                    </Dialog>
                )}
            </DialogTrigger>
        </Provider>
    )
}