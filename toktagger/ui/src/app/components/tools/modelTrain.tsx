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
  View
} from "@adobe/react-spectrum";
import WorkflowAdd from "@spectrum-icons/workflow/WorkflowAdd";
import CheckmarkCircle from "@spectrum-icons/workflow/CheckmarkCircle";
import DataAdd from '@spectrum-icons/workflow/DataAdd';
import DataUpload from '@spectrum-icons/workflow/DataUpload';

import Alert from "@spectrum-icons/workflow/Alert";
import { Project } from "@/types";
import { startTraining, getModelWeightsPath, startLoadModelWeights, getLoadModelStatus, getModelTypes, getModelLoadTypes, getModelTrainSchema } from "@/app/core";
import ModelForm from "@/app/components/ui/schemaForm";
import { RJSFSchema } from "@rjsf/utils";
import Form from "@rjsf/core";

export function ModelTrainModal({ project }: { project: Project }) {
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
  const [loadPath, setLoadPath] = useState<string>("");
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
      }
      else {
        const errorMessage = await modelTypesResponse.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      }
      if (modelLoadResponse.ok) {
        const data = await modelLoadResponse.json();
        const loadMethods = data as string[];
        setLoadMethods(loadMethods);
      }
      else {
        const errorMessage = await modelLoadResponse.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
      }
    })();
  }, [modalOpen, project.task]);

  useEffect(() => {
    const updateSchema = async () => {
      if (!selectedModelName) {
        setSchema(null);
        return;
      }
      const newSchema: RJSFSchema =
        await getModelTrainSchema(selectedModelName);
      setSchema(newSchema);
    };
    updateSchema();
  }, [selectedModelName]);



  const getWeightsPath = async () => {
    if (!project._id || !selectedModelName || !selectedLoadMethod) return;
    const response = await getModelWeightsPath(project._id, selectedModelName, selectedLoadMethod);
    if (response.ok) {
      const data = await response.json();
      setLoadPath(data);
    } else {
      const errorMessage = await response.json();
      setMessage(errorMessage.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  }



  const pressSubmit = () => {
    if (schema) {
      formRef.current?.submit();
    } else {
      submitTrainJob({});
    }
  };

  const submitTrainJob = async (params: Record<string, unknown>) => {
    if (!selectedModelName || !project._id) {
      return;
    }
    const response = await startTraining(
      project._id,
      selectedModelName,
      params,
    );
    if (response.ok) {
      setMessage("Model training added to job queue!");
      setMessageIcon(
        <CheckmarkCircle aria-label="Success" color="positive" size="S" />,
      );
    } else {
      const errorMessage = await response.json();
      setMessage(errorMessage.detail);
      setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
    }
  };

  const submitLoadJob = async () => {
    if (!selectedModelName || !project._id) {
      return;
    }

    const response = await startLoadModelWeights(
      project._id,
      selectedModelName,
    );
    const payload = await response.json();

    if (response.ok) {
      setIsLoading(true);
      setTaskId(payload.task_id);
      setMessage(null);
    } else {
      setMessage(payload.detail);
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
          if (pollCounter > 30) {
            setMessage("Failed to retrieve model load status.");
            clearInterval(interval);
            setIsLoading(false);
          }
        } else if (response.ok && payload === true) {
          setMessage("Model loaded successfully!")
          clearInterval(interval);
          setIsLoading(false);
        } else {
          setMessage(payload === false ? "Model failed to load" : payload.detail);
          clearInterval(interval);
          setIsLoading(false);
        }
      }, 1000);
    };
    fetchData();
  }, [
    project._id,
    selectedModelName,
    taskId,
  ]);

  return (
    <Provider theme={defaultTheme}>
      <DialogTrigger onOpenChange={(isOpen) => setModalOpen(isOpen)}>
        <ActionButton UNSAFE_style={buttonStyle} aria-label="Create ML Model">
          <WorkflowAdd />
        </ActionButton>
        {(close) => (
          <Dialog>
            <Heading>
              <Flex alignItems="center" gap="size-100">
                <WorkflowAdd size="S" />
                <Text>Create New ML Model</Text>
              </Flex>
            </Heading>
            <Divider />
            <Content>
              <Tabs
                aria-label="ML Model Tabs"
                selectedKey={selectedTab}
                onSelectionChange={setSelectedTab}
              >
                <TabList>
                  <Item key="train">
                    <DataAdd />
                    <Text>Train Model</Text>
                  </Item>
                  <Item key="load">
                    <DataUpload />
                    <Text>Load Pretrained Weights</Text>
                  </Item>
                </TabList>
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
                <TabPanels>
                  <Item key="train">
                    <Content>
                      {schema && (
                        <ModelForm
                          ref={formRef}
                          schema={schema}
                          onSubmit={submitTrainJob}
                          formData={unvalidatedFormData}
                          setFormData={setUnvalidatedFormData}
                        />
                      )}
                    </Content>
                  </Item>
                  <Item key="load">
                    <Content>
                      <ComboBox
                        label="Select Load Method"
                        selectedKey={selectedLoadMethod}
                        onSelectionChange={(key) =>
                          setSelectedLoadMethod(key !== null ? String(key) : null)
                        }
                      >
                        {loadMethods
                          ? loadMethods.map((load_method) => (
                            <Item key={load_method}>{load_method}</Item>
                          ))
                          : null}
                      </ComboBox>
                    </Content>
                  </Item>
                </TabPanels>
              </Tabs>
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
              {selectedTab === "train" && (
                <Button
                  variant="accent"
                  onPress={pressSubmit}
                  isDisabled={!modelNames || !selectedModelName}
                >
                  Train
                </Button>
              )}
              {(selectedTab === "load" && selectedLoadMethod === "local") && (
                <DialogTrigger
                  onOpenChange={(isOpen) => {
                    if (isOpen) {
                      getWeightsPath()
                    }
                  }}
                >

                  <Button variant="accent">Load</Button>

                  {(close) => (
                    <Dialog>
                      <Heading>Import Pretrained Weights File</Heading>

                      <Content>
                        <View>
                          <Text>Please move your pretrained weights file to the following location, adding on the correct suffix as expected by your selected model:</Text>
                          <Text><strong>{loadPath}</strong></Text>
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
              )}
            </ButtonGroup>
          </Dialog>
        )}
      </DialogTrigger>
    </Provider>
  );
}
