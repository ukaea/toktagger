"use client";
import { useState } from "react";
import {
  Form,
  Button,
  ToastQueue,
  DialogTrigger,
  Dialog,
  Divider,
  Heading,
  Content,
  ButtonGroup,
  Text,
} from "@adobe/react-spectrum";
import { Project } from "@/types";
import AddCircle from "@spectrum-icons/workflow/AddCircle";
import {
  DataLoaderOptions,
  SelectDataLoaderUI,
  buildSamples,
  createSamples,
} from "@/app/projects/components/project_config";

export const AddSamplesEditor = ({
  project,
  onModify,
}: {
  project: Project;
  onModify?: () => void;
}) => {
  const [dataLoaderOptions, setDataLoaderOptions] =
    useState<DataLoaderOptions | null>(null);
  // Get dataloader from project
  if (!project) {
    return;
  }

  const dataLoader = project.data_loader;

  const doAddSamples = async (
    project: Project,
    dataLoaderOptions: DataLoaderOptions,
  ) => {
    const projectId = project._id;

    if (!projectId) {
      throw new Error(`Cannot edit a project with missing Project ID.`);
    }

    const samples = buildSamples(dataLoaderOptions);
    await createSamples(projectId, samples);
    if (onModify) onModify();
  };

  const onFormSubmit = async (close: () => void) => {
    try {
      if (dataLoaderOptions === null) {
        return;
      }
      await doAddSamples(project, dataLoaderOptions).then(() => {
        close();
      });
    } catch (error) {
      ToastQueue.negative(`${error}`, { timeout: 3000 });
    }
  };

  // Get what form this dataloader needs
  const ui = SelectDataLoaderUI(
    dataLoader,
    dataLoaderOptions,
    setDataLoaderOptions,
  ) ?? <></>;

  return (
    <DialogTrigger>
      <Button variant={"primary"}>
        {<AddCircle />}
        {<Text>{"Create"}</Text>}
      </Button>
      {(close) => (
        <Dialog>
          <Heading>Add Samples</Heading>
          <Divider />
          <Content>
            <Form maxWidth="size-6000">{ui}</Form>
          </Content>
          <ButtonGroup>
            <Button variant="primary" onPress={close}>
              Close
            </Button>
            <Button variant="primary" onPress={async () => onFormSubmit(close)}>
              {"Create"}
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogTrigger>
  );
};
