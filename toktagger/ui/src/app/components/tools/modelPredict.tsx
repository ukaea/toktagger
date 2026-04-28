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
  Selection
} from "@adobe/react-spectrum";
import Workflow from "@spectrum-icons/workflow/Workflow";
import CheckmarkCircle from "@spectrum-icons/workflow/CheckmarkCircle";
import Alert from "@spectrum-icons/workflow/Alert";
import { Project, Model } from "@/types";
import { startPredictions, getModels, stopTraining } from "@/app/core";

export function ModelPredictModal({ project }: { project: Project }) {
  const [models, setModels] = useState<Model[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Selection | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [numPredictions, setNumPredictions] = useState<number>(20);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIcon, setMessageIcon] = useState<React.JSX.Element | null>(null);
  const buttonStyle = {
    position: "fixed",
    top: 10,
    right: 10,
    zIndex: 1000,
  };
  const onSelectModel = (keys: Selection) => {
    setSelectedKeys(keys);

    if (keys === 'all') {
      // Won't happen in single mode
      return;
    }

    if (!keys || keys.size === 0) {
      setSelectedModel(null)
      return
    }

    // Single select mode, so only ever one key
    const [key] = keys as Set<string>;

    if (!models) {
      return;
    }

    const model = models.find(
      (model) => model._id === key
    );

    if (!model) {
      setMessage("Selected model could not be found!");
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      return
    }

    setSelectedModel(model);
    return;
  }

  useEffect(() => {
    const fetchModels = async () => {
      if (!project._id) return;
      const response = await getModels(project._id);

      if (response.ok) {
        const data = await response.json();
        const models = data as Model[];
        setModels(models);
      } else {
        const errorMessage = await response.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      }
    };

    let poll: ReturnType<typeof setInterval>;
    if (modalOpen) {
      fetchModels();
      setMessage(null);
      setMessageIcon(null);
      setSelectedModel(null);

      poll = setInterval(() => {
        fetchModels();
      }, 5000);
    }
    return () => {
      if (poll) clearInterval(poll);
    };
  }, [project._id, modalOpen]);


  const submitPredictJob = async () => {
    if (!project._id || !models || !selectedKeys || !selectedModel) {
      return;
    }

    const response = await startPredictions(
      project._id,
      selectedModel.type,
      selectedModel.version,
      numPredictions,
    );

    if (response.ok) {
      setMessage("Model predictions added to job queue!");
      setMessageIcon(
        <CheckmarkCircle aria-label="Success" color="positive" size="S" />,
      );
      setSelectedKeys(undefined);
    } else {
      const errorMessage = await response.json();
      setMessage(errorMessage.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  };

  const stopTrainingJob = async () => {
    if (!project._id || !models || !selectedKeys || !selectedModel) {
      return;
    }

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
      setSelectedKeys(undefined);
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
                    !selectedKeys ||
                    !models ||
                    !selectedModel ||
                    !["started", "queued"].includes(
                      selectedModel.training_status,
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
                  onSelectionChange={onSelectModel}
                  height="size-3000"
                  aria-label="Model Prediction Table"
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
                  !selectedKeys ||
                  !models ||
                  !selectedModel ||
                  selectedModel.training_status != "completed"
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
