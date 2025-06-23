"use client";
import { use, useState } from 'react';
import { useGetSamples, useGetProject } from '@/app/core';
import {Provider, defaultTheme, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Button, Picker, Item} from '@adobe/react-spectrum'

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

export const SamplesTable = ({project_id, samples}) => {

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

type ProjectViewInfo = {
  params: { project_id: string };
};

export default function ProjectView({params} : ProjectViewInfo) {

  const [samplesPerPage, setSamplesPerPage] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  
  const project_id = use(params).project_id;
  const project = useGetProject(project_id);
  const samples = useGetSamples(project_id, currentPage, samplesPerPage);

  if (!project) {
    return;
  }

  if (!samples) {
    return;
  }

  return (
    <div>
    <SampleBreadCrumbs project={project} />
    <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
      <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">
          Samples
        </h1>
        <SamplesTable project_id={project_id} samples={samples}></SamplesTable>
        <Provider theme={defaultTheme}>
          <div className="flex items-center justify-between">
            <Button variant="primary" onPress={() => setCurrentPage((p) => p - 1)} isDisabled={currentPage === 1}>
              Previous
            </Button>
            <div className="flex items-center justify-center gap-8">
              <p> Page: {currentPage} </p>
            <Picker label="Samples per Page:" onSelectionChange={(selected) => {setSamplesPerPage(selected); setCurrentPage(1)}} defaultSelectedKey="5">
              <Item key="2">2</Item>
              <Item key="5">5</Item>
              <Item key="10">10</Item>
              <Item key="25">25</Item>
            </Picker>
            </div>
            <Button variant="primary" onPress={() => setCurrentPage((p) => p + 1)} isDisabled={samples.length < samplesPerPage}>
              Next
            </Button>
          </div>
          </Provider>
      </div>
    </div>
  </div>
  )
}