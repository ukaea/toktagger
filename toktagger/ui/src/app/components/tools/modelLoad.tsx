import { useState, useEffect, useRef } from "react";
import {
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
  TextField,
  ProgressCircle,
  TooltipTrigger,
  Tooltip,
} from "@adobe/react-spectrum";
import FileWorkflow from "@spectrum-icons/workflow/FileWorkflow";
import CheckmarkCircle from "@spectrum-icons/workflow/CheckmarkCircle";
import DataAdd from "@spectrum-icons/workflow/DataAdd";
import Alert from "@spectrum-icons/workflow/Alert";
import { GitlabIcon } from "@/app/utils";
import { Project } from "@/types";
import {
  startLoadModelWeightsLocal,
  getLoadModelStatus,
  getModelTypes,
  getModelLoadTypes,
} from "@/app/core";

export function ModelLoadModal({
  project,
  isEnabled,
}: {
  project: Project;
  isEnabled: boolean;
}) {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIcon, setMessageIcon] = useState<React.JSX.Element | null>(
    null,
  );
  const [selectedTab, setSelectedTab] = useState<Key | null>(null);
  const [modelNames, setModelNames] = useState<string[] | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string | null>(
    null,
  );
  const pollingModelName = useRef<string | null>(null);
  const [loadMethods, setLoadMethods] = useState<string[] | null>(null);
  const [weightsPath, setWeightsPath] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  const submitLoadJob = async () => {
    if (!selectedModelName || !selectedTab || !project._id) {
      return;
    }
    let response: Response;
    if (selectedTab == "local") {
      response = await startLoadModelWeightsLocal(
        project._id,
        selectedModelName,
        weightsPath,
      );
    } else {
      throw new Error("Only one signal name allowed for image array data!");
    }
    const payload = await response.json();

    if (response.ok) {
      setIsLoading(true);
      setTaskId(payload.task_id);
      pollingModelName.current = selectedModelName;
      setMessage(null);
    } else {
      setMessage(payload.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  };

  useEffect(() => {
    if (!taskId || !project._id || !pollingModelName.current) return;

    let pollCounter = 0;
    // Poll for result from GET predictions endpoint
    const interval = setInterval(async () => {
      if (pollingModelName.current == null) {
        clearInterval(interval);
        setIsLoading(false);
        return;
      }
      const response = await getLoadModelStatus(
        project._id,
        pollingModelName.current,
        taskId,
      );
      const payload = await response.json();

      if (response.status === 202) {
        // Load check queued but not done yet, so continue to poll
        pollCounter += 1;
        if (pollCounter > 60) {
          setMessage(
            "Timed out while loading model - check models tab to see current status.",
          );
          setMessageIcon(
            <Alert aria-label="Timeout" color="notice" size="S" />,
          );
          clearInterval(interval);
          setIsLoading(false);
        }
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
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
        clearInterval(interval);
        setIsLoading(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [project._id, taskId]);

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
        setSelectedTab(loadMethods?.[0] ?? null);
      } else {
        const errorMessage = await modelLoadResponse.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      }
    })();
  }, [modalOpen, project.task]);

  return (
    <DialogTrigger onOpenChange={(isOpen) => setModalOpen(isOpen)}>
      <TooltipTrigger delay={350} placement="bottom">
        <ActionButton isDisabled={!isEnabled} aria-label="Load ML Model">
          <FileWorkflow />
        </ActionButton>
        <Tooltip>"Load Pretrained Weights"</Tooltip>
      </TooltipTrigger>
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
                  {loadMethods?.includes("gitlab") ? (
                    <Item key="gitlab">
                      <GitlabIcon />
                      <Text>From Gitlab</Text>
                    </Item>
                  ) : null}
                </TabList>
                <TabPanels>
                  {loadMethods?.includes("local") ? (
                    <Item key="local">
                      <Flex direction="column">
                        <Text marginTop={"size-100"}>
                          Specify the path to the weights file to load, ensuring
                          that the file has the correct permissions which allow
                          it to be copied.
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
            <Button variant="secondary" onPress={close}>
              Close
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
  );
}
