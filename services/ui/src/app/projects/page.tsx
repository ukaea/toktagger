"use client";
import { getProjects } from '@/app/core';
import { use, useState, useEffect } from 'react';
import {Provider, defaultTheme, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item, Button, Picker} from '@adobe/react-spectrum'
import type { SortDescriptor } from '@react-types/shared';
import type { Project } from '@/types';

type ProjectsTableProps = {
  projects: Project[];
  sortDescriptor: SortDescriptor<Project>;
  onSortChange: (sort: SortDescriptor<Project>) => void;
}

export const ProjectsBreadCrumbs = () => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
        </Breadcrumbs>
      </Provider>
  );
};

export const ProjectsTable = ({projects, sortDescriptor, onSortChange}: ProjectsTableProps) => {
  const rows = projects.map(({ _id, ...rest }) => ({
    ...rest,
    id: _id
  }));

  return (
    <Provider theme={defaultTheme}>
      <TableView
      selectionMode="none"
      selectionStyle="highlight"
      sortDescriptor={sortDescriptor}
      onSortChange={onSortChange}
      >
        <TableHeader>
          <Column key="name" allowsSorting>Name</Column>
          <Column key="task" allowsSorting>Task</Column>
          <Column key="_id" allowsSorting>Date Created</Column>
          <Column key="data_loader" allowsSorting>Loader</Column>
        </TableHeader>
        <TableBody items={rows}>
          {item => (
            <Row href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${item['id']}`}>
              <Cell>{item['name']}</Cell>
              <Cell>{item['task']}</Cell>
              <Cell>{item['timestamp']}</Cell>
              <Cell>{item['data_loader']}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </Provider>
  )
}

export default function Projects() {
  const [projectsPerPage, setProjectsPerPage] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor<Project>>({ column: '_id', direction: 'descending' });
  
  const projects = getProjects(sortDescriptor, currentPage, projectsPerPage);
  if (!projects) {
    return;
  }

  const onSortChange = (newSortDescriptor: SortDescriptor<Project>) => {
    setSortDescriptor(newSortDescriptor);
  };

  return (
    <div>
      <ProjectsBreadCrumbs />
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
        <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-4">
            Projects
          </h1>
          <ProjectsTable projects={projects} sortDescriptor={sortDescriptor} onSortChange={onSortChange}></ProjectsTable>
          <Provider theme={defaultTheme}>
            <div className="flex items-center justify-between pl-4 pr-4">
              <Button variant="primary" onPress={() => setCurrentPage((p) => p - 1)} isDisabled={currentPage === 1}>
                Previous
              </Button>
              <div className="flex items-center justify-center gap-8 pb-2">
                <p> Page: {currentPage} </p>
              <Picker label="Projects per Page:" onSelectionChange={(selected) => {setProjectsPerPage(selected); setCurrentPage(1)}} defaultSelectedKey="5">
                <Item key="2">2</Item>
                <Item key="5">5</Item>
                <Item key="10">10</Item>
                <Item key="25">25</Item>
              </Picker>
              </div>
              <Button variant="primary" onPress={() => setCurrentPage((p) => p + 1)} isDisabled={projects.length < projectsPerPage}>
                Next
              </Button>
            </div>
          </Provider>
        </div>
      </div>
    </div>
  )
}
