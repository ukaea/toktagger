import { useState, useEffect } from "react";
import {
  Provider,
  defaultTheme,
  NumberField,
  TableView,
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  Flex,
  ActionButton,
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogTrigger,
  Divider,
  Footer,
  Heading,
  Text,
} from "@adobe/react-spectrum";
import Workflow from "@spectrum-icons/workflow/Workflow";
import CheckmarkCircle from "@spectrum-icons/workflow/CheckmarkCircle";
import Alert from "@spectrum-icons/workflow/Alert";
import { Project, Model } from "@/types";
import { startPredictions, getModels, stopTraining } from "@/app/core";

export function ModelPredictModal({ project }: Project) {
  const [models, setModels] = useState<Model[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [numPredictions, setNumPredictions] = useState<string>("20");
  const [message, setMessage] = useState<string | null>(null);
  const [messageIcon, setMessageIcon] = useState<JSX.Element | null>(null);
  const buttonStyle = {
    position: "fixed",
    top: 10,
    right: 10,
    zIndex: 1000,
  };

  useEffect(() => {
    const fetchModels = async () => {
      const models = await getModels(project._id);
      setModels(models);
    };

    let poll: ReturnType<typeof setInterval>;
    if (modalOpen) {
      fetchModels();
      setMessage(null);
      setMessageIcon(null);
      setSelectedKeys(new Set([]));

      poll = setInterval(() => {
        fetchModels();
      }, 5000);
    }
    return () => {
      if (poll) clearInterval(poll);
    };
  }, [project._id, modalOpen]);

  if (!project) {
    return;
  }

  const submitPredictJob = async () => {
    if (selectedKeys.size === 0 || !models) {
      return;
    }
    const selectedModel = models.find(
      (model) => model._id === selectedKeys.values().next().value,
    );

    const response = await startPredictions(
      project._id,
      selectedModel.type,
      selectedModel.version,
      Number(numPredictions),
    );

    if (response.ok) {
      setMessage("Model predictions added to job queue!");
      setMessageIcon(
        <CheckmarkCircle aria-label="Success" color="positive" size="S" />,
      );
      setSelectedKeys(new Set());
    } else {
      const errorMessage = await response.json();
      setMessage(errorMessage.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  };

  const stopTrainingJob = async () => {
    if (selectedKeys.size === 0 || !models) {
      return;
    }
    const selectedModel = models.find(
      (model) => model._id === selectedKeys.values().next().value,
    );

    const response = await stopTraining(
      project._id,
      selectedModel.type,
      selectedModel.version,
    );

    if (response.ok) {
      setMessage("Model training has been stopped!");
      setMessageIcon(
        <CheckmarkCircle aria-label="Success" color="positive" size="S" />,
      );
      setSelectedKeys(new Set());
    } else {
      const errorMessage = await response.json();
      setMessage(errorMessage.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  };

  return (
    <Provider theme={defaultTheme}>
      <DialogTrigger onOpenChange={(isOpen) => setModalOpen(isOpen)}>
        <ActionButton
          UNSAFE_style={buttonStyle}
          aria-label="Create Predictions from ML Model"
        >
          <Workflow />
        </ActionButton>
        {(close) => (
          <Dialog>
            <Heading>
              <Flex alignItems="center" gap="size-100">
                <Workflow size="S" />
                <Text>Create Predictions from ML Model</Text>
              </Flex>
            </Heading>
            <Divider />
            <Content>
              <Flex
                justifyContent="space-between"
                alignItems="center"
                className="pb-4"
                marginBottom="size-200"
              >
                <NumberField
                  label="Number of Predictions"
                  onChange={setNumPredictions}
                  defaultValue={20}
                  minValue={10}
                  step={10}
                />
                <Button
                  variant="negative"
                  isDisabled={
                    selectedKeys.size === 0 ||
                    !models ||
                    !["training", "queued"].includes(
                      models.find(
                        (model) =>
                          model._id === selectedKeys.values().next().value,
                      ).training_status,
                    )
                  }
                  onPress={stopTrainingJob}
                >
                  Cancel Training
                </Button>
              </Flex>
              {models && (
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
                    <Column>Score</Column>
                  </TableHeader>
                  <TableBody items={models}>
                    {(item) => (
                      <Row key={item["_id"]}>
                        <Cell>{item["type"]}</Cell>
                        <Cell>{item["version"]}</Cell>
                        <Cell>
                          {item["training_status"] === "started"
                            ? "Training: " + Math.round(item["progress"]) + "%"
                            : item["training_status"]}
                        </Cell>
                        <Cell>{Math.round(item["score"])}</Cell>
                      </Row>
                    )}
                  </TableBody>
                </TableView>
              )}
            </Content>
            <Footer>
              {message && (
                <Text>
                  {messageIcon} {message}
                </Text>
              )}
            </Footer>
            <ButtonGroup>
              <Button variant="secondary" onPress={close}>
                Close
              </Button>
              <Button
                variant="accent"
                isDisabled={
                  selectedKeys.size === 0 ||
                  !models ||
                  models.find(
                    (model) => model._id === selectedKeys.values().next().value,
                  ).training_status != "completed"
                }
                onPress={submitPredictJob}
              >
                Predict
              </Button>
            </ButtonGroup>
          </Dialog>
        )}
      </DialogTrigger>
    </Provider>
  );
}
