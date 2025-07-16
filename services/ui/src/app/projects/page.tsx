"use client";
import { getProjects } from '@/app/core';
import {Provider, defaultTheme, Button, Text, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item} from '@adobe/react-spectrum'

export const ProjectsBreadCrumbs = () => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
        </Breadcrumbs>
      </Provider>
  );
};

export const ProjectsTable = () => {
  const projects = getProjects();

  if (!projects) {
    return;
  }
  const rows = projects.map(({ _id, ...rest }) => ({
    ...rest,
    id: _id
  }));

  return (
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
  )
}

export default function Projects() {

  return (
    <div>
      <ProjectsBreadCrumbs />
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400">
        <div className="w-full md:w-4/5 p-6 bg-white/60 text-gray-800 rounded-lg shadow-lg backdrop-blur-sm">
          <h1 className="text-2xl font-bold mb-4">
            Projects
          </h1>
          <Provider theme={defaultTheme}>
            <div className="p-2">
              <Button elementType="a" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/create`}>Create</Button>
            </div>
            <ProjectsTable></ProjectsTable>
          </Provider>
        </div>
      </div>
    </div>
  )
}
