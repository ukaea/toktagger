"use client";
import { ExportButton } from "@/app/components/export";
import { ImportTool } from "@/app/components/import";
import { getSamples, getProject } from "@/app/core";
import { Project } from "@/types";
import {
  Provider,
  defaultTheme,
  Cell,
  Column,
  Row,
  TableView,
  TableBody,
  TableHeader,
  Breadcrumbs,
  Item,
  Text,
  Flex,
  ButtonGroup,
  ToastContainer,
  View,
} from "@adobe/react-spectrum";
import { use } from "react";

export const SampleBreadCrumbs = ({ project }: { project: Project }) => {
  return (
    <Provider theme={defaultTheme}>
      <Breadcrumbs>
        <Item
          key="projects"
          href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}
        >
          Projects
        </Item>
        <Item
          key="project"
          href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${project._id}`}
        >
          Project: {project.name}
        </Item>
      </Breadcrumbs>
    </Provider>
  );
};

export const SamplesTable = ({ project_id }: { project_id: string }) => {
  const project = getProject(project_id);
  const samples = getSamples(project_id);

  if (!samples || !project) {
    return;
  }

  const rows = samples.map(({ _id, ...rest }) => ({
    ...rest,
    id: _id,
  }));


  return (
    <Provider theme={defaultTheme}>
      <ToastContainer placement="top"/>
      <Flex direction="row" margin='size-100' gap="size-100" alignItems="end" justifyContent="left">
        <View paddingEnd='size-10' marginTop='size-100'><ImportTool project_id={project_id} /></View>
        <View paddingEnd='size-10' marginTop='size-100'><ExportButton project={project} /></View>
      </Flex>
      <TableView
        aria-label="Samples"
        selectionMode="none"
        selectionStyle="highlight"
      >
        <TableHeader>
          <Column>Shot ID</Column>
          <Column>Date Created</Column>
        </TableHeader>
        <TableBody items={rows}>
          {(item) => (
            <Row
              href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${item["id"]}`}
            >
              <Cell>{item["shot_id"]}</Cell>
              <Cell>{item["timestamp"]}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </Provider>
  );
};

type ProjectViewProps = {
  project_id: string;
};
export default function ProjectView({
  params,
}: {
  params: Promise<ProjectViewProps>;
}) {
  const { project_id } = use(params);
  const project = getProject(project_id);

  if (!project) {
    return;
  }

  return (
    <div>
      <SampleBreadCrumbs project={project} />
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
        <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-4">Samples</h1>
          <SamplesTable project_id={project_id}></SamplesTable>
        </div>
      </div>
    </div>
  );
}
