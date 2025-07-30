"use client";
import { use } from 'react';
import { getSamples, getProject } from '@/app/core';
import {Provider, defaultTheme, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { TrainModelTool } from '@/app/components/tools/trainModel';

export const SampleBreadCrumbs = (info) => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
          <Item key="project" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${info.project.project_id}`}>Project: {info.project.name}</Item>
        </Breadcrumbs>
      </Provider>
  );
};

type SampleTableParams = {
  project_id: string;
};

export const SamplesTable = ({project_id}: SampleTableParams) => {
  const samples = getSamples(project_id);

  if (!samples) {
    return;
  }

  const rows = samples.map(({ _id, ...rest }) => ({
    ...rest,
    id: _id
  }));

  return (
    <Provider theme={defaultTheme}>
      <TableView
      selectionMode="none"
      selectionStyle="highlight"
      >
        <TableHeader>
          <Column>Shot ID</Column>
          <Column>Date Created</Column>
        </TableHeader>
        <TableBody items={rows}>
          {item => (
            <Row href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${item['id']}`}>
              <Cell>{item['shot_id']}</Cell>
              <Cell>{item['timestamp']}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </Provider>
  )
}

type Props = {
  params: { project_id: string };
};

export default function ProjectView({params} : Props) {
  const project_id = use(params).project_id;
  const project = getProject(project_id);

  if (!project) {
    return;
  }

  return (
    <div>
    <SampleBreadCrumbs project={project} />
    <TrainModelTool project={project}></TrainModelTool>
    <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
      <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">
          Samples
        </h1>
        <SamplesTable project_id={project_id}></SamplesTable>
      </div>
    </div>
  </div>
  )
}