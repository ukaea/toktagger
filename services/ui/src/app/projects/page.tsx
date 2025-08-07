"use client";
import { useState, useEffect } from 'react';
import { deleteProject, getProjects } from '@/app/core';
import {ButtonGroup, Flex, Text, Provider, defaultTheme, Button, ToastContainer, ToastQueue, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item, SearchField, Picker} from '@adobe/react-spectrum'
import { Project } from '@/types';
import Edit from '@spectrum-icons/workflow/Edit';
import AddCircle from '@spectrum-icons/workflow/AddCircle';
import Delete from '@spectrum-icons/workflow/Delete';
import type { SortDescriptor } from '@react-types/shared';

type ProjectsTableProps = {
  projects: Project[];
  sortDescriptor: SortDescriptor;
  onSortChange: (sort: SortDescriptor) => void;
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

export const ProjectsTable = ({projects, sortDescriptor, onSortChange} : ProjectsTableProps) => {

  if (projects.length === 0) {
    return (
      <Flex alignItems="center" justifyContent="center" height="100%">
        <span style={{ color: '#6E6E6E' }}>No projects available.</span>
      </Flex>
    );
  }

  const handleDelete = async (project_id: string) => {
    try {
      await deleteProject(project_id);
      ToastQueue.positive('Project deleted successfully', {timeout: 3000});
    } catch (error) {
      ToastQueue.negative('Error deleting project', {timeout: 3000});
    }
  }


  return (
    <>
      <TableView
        aria-label='Projects'
        sortDescriptor={sortDescriptor}
        onSortChange={onSortChange}
        selectionMode="none"
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
                  <Button
                    variant='negative'
                    onPress={() => {
                      if (item['_id']) handleDelete(item['_id']);
                    }}
                  ><Delete/></Button>
                </Flex>
              </Cell>
            </Row>
          ))}
        </TableBody>
      </TableView>
      </>
);
}

export default function Projects() {
  const [projectsPerPage, setProjectsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [projectName, setProjectName] = useState<string>("");
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: '_id', direction: 'descending' });
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const run = async () => {
      const projects = await getProjects(sortDescriptor, currentPage, projectsPerPage, projectName);

      if (!projects) {
        ToastQueue.negative('Error fetching projects', {timeout: 3000});
        return;
      }

      setProjects(projects);
    }
    run();
  }, [sortDescriptor, currentPage, projectsPerPage, projectName]);

  if (!projects) {
    return;
  }

  const onSortChange = (newSortDescriptor: SortDescriptor) => {
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
          <Provider theme={defaultTheme}>
          <ToastContainer placement="top"  />
          <Flex direction='row' margin='size-100' gap="size-100"  alignItems="center" justifyContent="space-between">
              <Button elementType="a" variant='primary' href={`${process.env.NEXT_PUBLIC_API_URL}/projects/create`}><AddCircle/><Text>Create</Text></Button>
              <SearchField label="Search By Name" onSubmit={
                (name) => {
                  if (name != null) {
                    setProjectName(name); 
                    setCurrentPage(1);
                  }
                }}/>
          </Flex>
          <ProjectsTable projects={projects} sortDescriptor={sortDescriptor} onSortChange={onSortChange}></ProjectsTable>
            <div className="flex items-center justify-between pl-4 pr-4">
              <Button variant="primary" onPress={() => setCurrentPage((p) => p - 1)} isDisabled={currentPage === 1}>
                Previous
              </Button>
              <div className="flex items-center justify-center gap-8 pb-2">
                <p> Page: {currentPage} </p>
              <Picker 
              label="Projects per Page:" 
              onSelectionChange={(selectedKey) => {
                if (selectedKey != null) {
                  setProjectsPerPage(Number(selectedKey) || 10); 
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
