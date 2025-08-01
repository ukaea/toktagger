import { useState, useEffect } from "react";
import {Provider, defaultTheme, NumberField, TableView, Cell, Column, Row, TableBody, TableHeader, ComboBox, Item, Flex, ActionButton, Button, ButtonGroup, Content, Dialog, DialogTrigger, Divider, Header, Footer, Heading, Text} from '@adobe/react-spectrum';
import Workflow from '@spectrum-icons/workflow/Workflow';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Alert from '@spectrum-icons/workflow/Alert';
import { getModels } from '@/app/core';

export function ModelPredictModal({project}) { // Project should be typed somewhere
    const [models, setModels] = useState(null); // TODO models needs typing
    let [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));
    let [modalOpen, setModalOpen] = useState(false);
    let [numPredictions, setNumPredictions] = useState<string>("20");
    const [message, setMessage] = useState<string | null>(null);
    const [messageIcon, setMessageIcon] = useState<JSX.Element | null>(null);
    const buttonStyle = {
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 1000
    };

    useEffect( () => {
        const fetchData = async () => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project._id}/models`);
            const data = await response.json();
            setModels(data);
            };
        fetchData();
        setMessage(null);
        setMessageIcon(null);
        setSelectedKeys(new Set([]))

    }, [modalOpen, project._id]);

    if (!models) {
        return;
    }

    const submitPredictJob = async () => {
        if (selectedKeys.size === 0) {
            return;
        }
        const selectedModel = models.find(model => model._id === selectedKeys.values().next().value)

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project._id}/models/${selectedModel.type}/predict?version=${selectedModel.version}&num_predictions=${Number(numPredictions)}`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            setMessage("Model predictions added to job queue!");
            setMessageIcon(<CheckmarkCircle aria-label="Success" color="positive" size="S"/>)
            setSelectedKeys(new Set());

        } else {
            const errorMessage = await response.json()
            setMessage(errorMessage.detail);
            setMessageIcon(<Alert aria-label="Failed" color="negative" size="S"/>)
        }
    }

    return (
        <Provider theme={defaultTheme}>
            <DialogTrigger onOpenChange={(isOpen) => setModalOpen(isOpen)}>
                <ActionButton UNSAFE_style={buttonStyle} aria-label="Create Predictions from ML Model">
                    <Workflow/>
                </ActionButton>
                {(close) => (
                    <Dialog>
                        <Heading>
                            <Flex alignItems="center" gap="size-100">
                                <Workflow size="S" />
                                <Text>
                                    Create Predictions from ML Model
                                </Text>
                            </Flex>
                        </Heading>
                        <Divider />
                            <Content>
                            <div className="pb-4">
                                <NumberField
                                    label="Number of Predictions"
                                    onChange={setNumPredictions}
                                    defaultValue={20}
                                    minValue={10}
                                    step={10}
                                />
                            </div>
                            <TableView
                            flex
                            selectionMode="single"
                            selectedKeys={selectedKeys}
                            onSelectionChange={setSelectedKeys}
                            >
                                <TableHeader>
                                <Column>Model Type</Column>
                                <Column>Version</Column>
                                <Column>Status</Column>
                                <Column>Accuracy</Column>
                                </TableHeader>
                                <TableBody items={models}>
                                {item => (
                                    <Row key={item['_id']}>
                                    <Cell>{item['type']}</Cell>
                                    <Cell>{item['version']}</Cell>
                                    <Cell>{
                                    item['training_status'] === "started"
                                    ? "Training: "+ Math.round(item["progress"]) + "%"
                                    : item['training_status']}
                                    </Cell>
                                    <Cell>{Math.round(item['accuracy']) + "%" }</Cell>
                                    </Row>
                                )}
                                </TableBody>
                        </TableView>
                        </Content>
                        <Footer>
                            {message && (
                            <Text>
                                {messageIcon} {message}
                            </Text>
                            )}
                        </Footer>
                        <ButtonGroup>
                            <Button variant="secondary" onPress={close}>Close</Button>
                            <Button variant="accent" onPress={submitPredictJob}>Predict</Button>
                        </ButtonGroup>
                    </Dialog>
                )}
            </DialogTrigger>
        </Provider>
    )
}