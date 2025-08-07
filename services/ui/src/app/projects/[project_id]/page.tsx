"use client";
import { use, useState } from 'react';
import { getSamples, getProject } from '@/app/core';
import {Provider, defaultTheme, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Button, Picker, Item, Flex, SearchField} from '@adobe/react-spectrum'
import { SortDescriptor } from '@react-types/shared';
import type { Project, Sample } from '@/types';

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

type SamplesTableProps = {
  project_id: string;
  samples: Sample[];
  sortDescriptor: SortDescriptor;
  onSortChange: (sort: SortDescriptor) => void;
}

export const SamplesTable = ({project_id, samples, sortDescriptor, onSortChange}: SamplesTableProps) => {

  const rows = samples.map(({ _id, ...rest }) => ({
    ...rest,
    id: _id,
  }));

  return (
    <Provider theme={defaultTheme}>
      <Flex height="size-5000" width="100%" direction="column">
        <TableView
        flex
        aria-label="Samples"
        selectionMode="none"
        selectionStyle="highlight"
        sortDescriptor={sortDescriptor}
        onSortChange={onSortChange}
        >
          <TableHeader>
            <Column key="shot_id" allowsSorting>Shot ID</Column>
            <Column key="_id" allowsSorting>Date Created</Column>
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
      </Flex>
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
  const [samplesPerPage, setSamplesPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [shotId, setShotId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: 'shot_id', direction: 'ascending' });
  
  const { project_id } = use(params);
  const project = getProject(project_id);
  const samples = getSamples(sortDescriptor, project_id, currentPage, samplesPerPage, shotId);

  if (!project) {
    return;
  }

  if (!samples) {
    return;
  }

  const onSortChange = (newSortDescriptor: SortDescriptor) => {
    setSortDescriptor(newSortDescriptor);
  };

  const onSearchSubmit = (newValue: string) => {
    if (/^[0-9]*$/.test(newValue)) {
      setErrorMessage("")
      setShotId(newValue)
      setCurrentPage(1)
    } else {
      setErrorMessage("Please enter a number.")
    }
  }

  return (
    <div>
    <SampleBreadCrumbs project={project} />
    <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
      <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">
          Samples
        </h1>
        <Provider theme={defaultTheme}>
        <div className="pl-4">
          <SearchField 
          label="Search By Shot ID" 
          // SearchField should be able to do validation when provided a 'pattern' inside a Form element
          // But I could not for the life of me get that to work, so will do it manually...
          onSubmit={onSearchSubmit}
          validationState={errorMessage ? 'invalid' : undefined}
          errorMessage={errorMessage} />
        </div>
        <SamplesTable project_id={project_id} samples={samples} sortDescriptor={sortDescriptor} onSortChange={onSortChange}></SamplesTable>
          <div className="flex items-center justify-between pl-4 pr-4">
            <Button variant="primary" onPress={() => setCurrentPage((p) => p - 1)} isDisabled={currentPage === 1}>
              Previous
            </Button>
            <div className="flex items-center justify-center gap-8 pb-2">
              <p> Page: {currentPage} </p>
            <Picker 
              label="Samples per Page:" 
              onSelectionChange={(selectedKey) => {
                if (selectedKey != null) {
                  setSamplesPerPage(Number(selectedKey) || 10); 
                  setCurrentPage(1);
                }
                }} 
              defaultSelectedKey="10">
              <Item key="5">5</Item>
              <Item key="10">10</Item>
              <Item key="25">25</Item>
              <Item key="50">50</Item>
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
  );
}
