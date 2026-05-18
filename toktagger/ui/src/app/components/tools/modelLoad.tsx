import { useState, useEffect, useRef } from "react";
import {
  Provider,
  defaultTheme,
  ComboBox,
  Item,
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
  Tabs,
  TabList,
  TabPanels,
  Key,
  View,
  TextField,
  ProgressCircle,
} from "@adobe/react-spectrum";
import FileWorkflow from "@spectrum-icons/workflow/FileWorkflow";
import CheckmarkCircle from "@spectrum-icons/workflow/CheckmarkCircle";
import DataAdd from "@spectrum-icons/workflow/DataAdd";
import DataUpload from "@spectrum-icons/workflow/DataUpload";
import FullScreenExit from "@spectrum-icons/workflow/FullScreenExit";

import Alert from "@spectrum-icons/workflow/Alert";
import { Project } from "@/types";
import {
  startTraining,
  getModelWeightsPath,
  startLoadModelWeights,
  getLoadModelStatus,
  getModelTypes,
  getModelLoadTypes,
  getModelTrainSchema,
} from "@/app/core";
import ModelForm from "@/app/components/ui/schemaForm";
import { RJSFSchema } from "@rjsf/utils";
import Form from "@rjsf/core";

export function LocalModal({
  project,
  selectedModelName,
}: {
  project: Project;
  selectedModelName: string;
}) {
  const [loadPath, setLoadPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  return (
    <DialogTrigger
      onOpenChange={(isOpen) => {
        if (isOpen) {
          getWeightsPath();
        }
      }}
    >
      <Button variant="accent">Load</Button>

      {(close) => (
        <Dialog>
          <Heading>Import Pretrained Weights File</Heading>

          <Content>
            <View>
              <Text>
                Please move your pretrained weights file to the following
                location, adding on the correct suffix as expected by your
                selected model:
              </Text>
              <Text marginTop={"size-100"}>
                <strong>{loadPath}</strong>
              </Text>
            </View>
          </Content>
          <ButtonGroup>
            <Button variant="negative" onPress={close}>
              Cancel
            </Button>
            <Button variant="accent" onPress={submitLoadJob}>
              Verify File
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogTrigger>
  );
}

export function ModelLoadModal({ project }: { project: Project }) {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIcon, setMessageIcon] = useState<React.JSX.Element | null>(
    null,
  );
  const [selectedTab, setSelectedTab] = useState<Key>("train");
  const [modelNames, setModelNames] = useState<string[] | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null,
  );
  const [loadMethods, setLoadMethods] = useState<string[] | null>(null);
  const [selectedLoadMethod, setSelectedLoadMethod] = useState<string | null>(
    null,
  );
  const [weightsPath, setWeightsPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [unvalidatedFormData, setUnvalidatedFormData] = useState<
    Record<string, unknown>
  >({});
  const formRef = useRef<Form>(null);
  const buttonStyle = {
    position: "fixed",
    top: 10,
    right: 50,
    zIndex: 1000,
  };

  const submitLoadJob = async () => {
    if (!selectedModelName || !selectedTab || !project._id) {
      return;
    }

    const response = await startLoadModelWeights(
      project._id,
      selectedModelName,
      selectedTab as string,
      weightsPath,
    );
    const payload = await response.json();

    if (response.ok) {
      setIsLoading(true);
      setTaskId(payload.task_id);
      setMessage(null);
    } else {
      setMessage(payload.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!taskId || !project._id || !selectedModelName) return;

      let pollCounter = 0;
      // Poll for result from GET predictions endpoint
      const interval = setInterval(async () => {
        if (selectedModelName == null) {
          clearInterval(interval);
          setIsLoading(false);
          return;
        }
        const response = await getLoadModelStatus(
          project._id,
          selectedModelName,
          taskId,
        );
        const payload = await response.json();

        if (response.status === 202) {
          // Load check queued but not done yet, so continue to poll
          pollCounter += 1;
        } else if (response.ok && payload === true) {
          setMessage("Model loaded successfully!");
          setMessageIcon(
            <CheckmarkCircle aria-label="Success" color="positive" size="S" />,
          );
          clearInterval(interval);
          setIsLoading(false);
        } else {
          setMessage(
            payload === false ? "Model failed to load!" : payload.detail,
          );
          setMessageIcon(
            <Alert aria-label="Failed" color="negative" size="S" />,
          );
          clearInterval(interval);
          setIsLoading(false);
        }
      }, 1000);
    };
    fetchData();
  }, [project._id, selectedModelName, taskId]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    (async () => {
      const modelTypesResponse = await getModelTypes(project.task);
      const modelLoadResponse = await getModelLoadTypes();
      if (modelTypesResponse.ok) {
        const data = await modelTypesResponse.json();
        const modelTypes = data as string[];
        setModelNames(modelTypes);
      } else {
        const errorMessage = await modelTypesResponse.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      }
      if (modelLoadResponse.ok) {
        const data = await modelLoadResponse.json();
        const loadMethods = data as string[];
        setLoadMethods(loadMethods);
      } else {
        const errorMessage = await modelLoadResponse.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      }
    })();
  }, [modalOpen, project.task]);

  return (
    <Provider theme={defaultTheme}>
      <DialogTrigger onOpenChange={(isOpen) => setModalOpen(isOpen)}>
        <ActionButton UNSAFE_style={buttonStyle} aria-label="Create ML Model">
          <FileWorkflow />
        </ActionButton>
        {(close) => (
          <Dialog>
            <Heading>
              <Flex alignItems="center" gap="size-100">
                <FileWorkflow size="S" />
                <Text>Load Pretrained Model Weights</Text>
              </Flex>
            </Heading>
            <Divider />
            <Content>
              <ComboBox
                label="Select Model Type"
                selectedKey={selectedModelName}
                onSelectionChange={(key) =>
                  setSelectedModelName(key !== null ? String(key) : null)
                }
              >
                {modelNames
                  ? modelNames.map((model_name) => (
                      <Item key={model_name}>{model_name}</Item>
                    ))
                  : null}
              </ComboBox>
              {loadMethods && (
                <Tabs
                  aria-label="ML Model Tabs"
                  selectedKey={selectedTab}
                  onSelectionChange={setSelectedTab}
                >
                  <TabList>
                    {loadMethods?.includes("local") ? (
                      <Item key="local">
                        <DataAdd />
                        <Text>Use Local File</Text>
                      </Item>
                    ) : null}
                    {loadMethods?.includes("hugging_face") ? (
                      <Item key="hugging_face">
                        <DataAdd />
                        <Text>Download from Hugging Face</Text>
                      </Item>
                    ) : null}
                  </TabList>
                  <TabPanels>
                    {loadMethods?.includes("local") ? (
                      <Item key="local">
                        <Flex direction="column">
                          <Text marginTop={"size-100"}>
                            Specify the path to the weights file to load,
                            ensuring that the file has the correct permissions
                            which allow it to be copied.
                          </Text>
                          <TextField
                            marginTop={"size-100"}
                            width={"100%"}
                            label="Model Weights Path"
                            onChange={setWeightsPath}
                          />
                        </Flex>
                      </Item>
                    ) : null}
                    {loadMethods?.includes("hugging_face") ? (
                      <Item key="hugging_face">HI</Item>
                    ) : null}
                  </TabPanels>
                </Tabs>
              )}
            </Content>
            <Footer>
              {message && (
                <Text>
                  {messageIcon} {message}
                </Text>
              )}
              {isLoading && (
                <ProgressCircle aria-label="Loading…" isIndeterminate />
              )}
            </Footer>
            <ButtonGroup>
              <Button variant="negative" onPress={close}>
                Cancel
              </Button>
              <Button
                variant="accent"
                onPress={submitLoadJob}
                isDisabled={!weightsPath || !selectedModelName}
              >
                Submit
              </Button>
            </ButtonGroup>
          </Dialog>
        )}
      </DialogTrigger>
    </Provider>
  );
}
