"use client";
import { useState, useEffect } from 'react';
import { getProjects } from '@/app/core';
import {ButtonGroup, Flex, Provider, defaultTheme, Button, ToastContainer, ToastQueue, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { Project } from '@/types';
import Edit from '@spectrum-icons/workflow/Edit';
import AddCircle from '@spectrum-icons/workflow/AddCircle';
import RemoveCircle from '@spectrum-icons/workflow/RemoveCircle';

export const ProjectsBreadCrumbs = () => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
        </Breadcrumbs>
      </Provider>
  );
};

const deleteProjects = async (project_ids: string[]) => {
  for (const project_id of project_ids) {
    console.log(`Deleting project ${project_id}`);
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok && response.status !== 404) {
      ToastQueue.negative(`Error deleting project ${project_id}`, {timeout: 3000});
    }
  }
};

export const ProjectsTable = () => {
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | string>(new Set<string>());
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const run = async () => {
      const projects = await getProjects();

      if (!projects) {
        ToastQueue.negative('Error fetching projects', {timeout: 3000});
        return;
      }

      setProjects(projects);
    }
    run();
  }, []);

  const deleteSelectedRows = () => {
    setProjects((prevProjects) => {
        const project_ids = prevProjects.map((project) => project._id).filter((id): id is string => typeof id === 'string');
        const keys: Set<string> = (selectedKeys === 'all') ? new Set(project_ids) : new Set(selectedKeys);
        let deleteRows = Array.from(keys);

        deleteProjects(deleteRows);

        const projects = prevProjects.filter((row) => typeof row._id === 'string' && !keys.has(row._id));
        return projects;
    });

    setSelectedKeys(new Set<string>());
  };

  if (projects.length === 0) {
    return (
      <Flex alignItems="center" justifyContent="center" height="100%">
        <span style={{ color: '#6E6E6E' }}>No projects available.</span>
      </Flex>
    );
  }

  return (
    <>
      <Flex direction='row' margin='size-100' gap="size-100"  alignItems="end">
        <ButtonGroup UNSAFE_className="py-2">
          <Button elementType="a" variant='primary' href={`${process.env.NEXT_PUBLIC_API_URL}/projects/create`}><AddCircle/></Button>
          <Button
            elementType='a'
            variant='negative'
            onPress={deleteSelectedRows}
            isDisabled={
              (selectedKeys === 'all')
                ? false
                : (selectedKeys instanceof Set ? selectedKeys.size === 0 : true)
            }
          ><RemoveCircle/></Button>
        </ButtonGroup>
      </Flex>
      <TableView
        aria-label='Projects'
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => {
          // keys can be 'all' or a Set<Key>
          if (keys === 'all') {
            setSelectedKeys('all');
          } else {
            // Convert Set<Key> to Set<string>
            setSelectedKeys(new Set(Array.from(keys).map(String)));
          }
        }}
      >
        <TableHeader>
          <Column>Name</Column>
          <Column>Task</Column>
          <Column>Date Created</Column>
          <Column>Loader</Column>
          <Column>Edit</Column>
        </TableHeader>
        <TableBody>
          {projects.map((item) => (
            <Row key={item['_id']} href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${item['_id']}`}>
              <Cell>{item['name']}</Cell>
              <Cell>{item['task']}</Cell>
              <Cell>{item['timestamp']}</Cell>
              <Cell>{item['data_loader']}</Cell>
              <Cell>
                <Flex direction="row" gap="size-100">
                  <Button variant='accent' elementType='a' href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${item['_id']}/edit`}><Edit/></Button>
                </Flex>
              </Cell>
            </Row>
          ))}
        </TableBody>
      </TableView>
      </>
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
            <ToastContainer placement="top"  />
            <ProjectsTable></ProjectsTable>
          </Provider>
        </div>
      </div>
    </div>
  )
}
