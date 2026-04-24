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
} from "@adobe/react-spectrum";
import WorkflowAdd from "@spectrum-icons/workflow/WorkflowAdd";
import CheckmarkCircle from "@spectrum-icons/workflow/CheckmarkCircle";
import Alert from "@spectrum-icons/workflow/Alert";
import { Project } from "@/types";
import { startTraining, getModels, getModelSchema } from "@/app/core";
import ModelForm from "@/app/components/ui/schemaForm";
import { RJSFSchema } from '@rjsf/utils';
import Form from '@rjsf/core';

export function ModelTrainModal({ project }: { project: Project }) {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [trainDisabled, setTrainDisabled] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIcon, setMessageIcon] = useState<JSX.Element | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [unvalidatedFormData, setUnvalidatedFormData] = useState<Record<string, any>>({});
  const formRef = useRef<Form>(null);
  const buttonStyle = {
    position: "fixed",
    top: 10,
    right: 50,
    zIndex: 1000,
  };

  useEffect(() => {
    if (!modalOpen) {
      setTrainDisabled(true);
      return;
    };

    (async () => {
      const response = await getModels(project._id);

      if (!response.ok) {
        const errorMessage = await response.json();
        setMessage(errorMessage.detail);
        setMessageIcon(<Alert aria-label="Failed" color="negative" size="S" />);
        setTrainDisabled(true);
      }
    })();
  }, [modalOpen, project._id]);

  useEffect(() => {
    const updateSchema = async () => {
      if (!selectedModel) return;
      const newSchema: RJSFSchema = await getModelSchema(selectedModel);
      setSchema(newSchema)
    }
    if (!selectedModel) {
      setTrainDisabled(true)
      return
    }
    updateSchema()
    setTrainDisabled(false)
  }, [selectedModel])

  const pressSubmit = () => {
    if (schema) {
      formRef.current?.submit()
    } else {
      submitTrainJob({})
    }
  }

  const submitTrainJob = async (params: Record<string, any>) => {
    if (selectedModel == null) {
      return;
    }
    const response = await startTraining(project._id, selectedModel, params);
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

  return (
    <Provider theme={defaultTheme}>
      <DialogTrigger onOpenChange={(isOpen) => setModalOpen(isOpen)}>
        <ActionButton UNSAFE_style={buttonStyle} aria-label="Train ML Model">
          <WorkflowAdd />
        </ActionButton>
        {(close) => (
          <Dialog>
            <Heading>
              <Flex alignItems="center" gap="size-100">
                <WorkflowAdd size="S" />
                <Text>Train ML Model</Text>
              </Flex>
            </Heading>
            <Divider />
            <Content>
              <ComboBox
                label="Select Model Type"
                selectedKey={selectedModel}
                onSelectionChange={(key) => setSelectedModel(key !== null ? String(key) : null)}
              >
                {project.model_types.map((model_type) => (
                  <Item key={model_type}>{model_type}</Item>
                ))}
              </ComboBox>
              {schema && (
                <ModelForm
                  ref={formRef}
                  schema={schema}
                  onSubmit={submitTrainJob}
                  formData={unvalidatedFormData}
                  setFormData={setUnvalidatedFormData}
                />
              )
              }
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
                onPress={pressSubmit}
                isDisabled={trainDisabled}
              >
                Train
              </Button>
            </ButtonGroup>
          </Dialog>
        )}
      </DialogTrigger>
    </Provider>
  );
}
