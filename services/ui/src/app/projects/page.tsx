"use client";
import { getProjects } from '@/app/core';
import { use, useState, useEffect } from 'react';
import {Provider, defaultTheme, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item, Button} from '@adobe/react-spectrum'

type ProjecsTableProps = {
  page: number,
  projectsPerPage: number
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

export const ProjectsTable = ({page, projectsPerPage}: ProjecsTableProps) => {
  const projects = getProjects(page, projectsPerPage);

  if (!projects) {
    return;
  }
  const rows = projects.map(({ _id, ...rest }) => ({
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
          <Column>Name</Column>
          <Column>Task</Column>
          <Column>Date Created</Column>
          <Column>Loader</Column>
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
  const [projectsPerPage, setProjectsPerRow] = useState(2);
  const [currentPage, setCurrentPage] = useState(1);

  return (
    <div>
      <ProjectsBreadCrumbs />
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
        <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-4">
            Projects
          </h1>
          <ProjectsTable page={currentPage} projectsPerPage={projectsPerPage}></ProjectsTable>
          <p>Current page: {currentPage}</p>
          <Button variant="primary" onPress={() => setCurrentPage((p) => p - 1)} isDisabled={currentPage === 1}>
            Previous
          </Button>
          <Button onPress={() => setCurrentPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
