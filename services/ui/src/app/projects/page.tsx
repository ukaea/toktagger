"use client";
import { useState, useEffect } from 'react';
import { getProjects } from '@/app/core';
import {ButtonGroup, Flex, Provider, defaultTheme, Button, ToastContainer, ToastQueue, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item} from '@adobe/react-spectrum'

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
  const [selectedKeys, setSelectedKeys] = useState<Set<string> | string>(new Set<string>());
  const [rows, setRows] = useState<any>([]);

  useEffect(() => {
    const run = async () => {
      const projects = await getProjects();
      const rows = projects.map(({ _id, ...rest }) => ({
        ...rest,
        id: _id
      }));
      setRows(rows);
    }
    run();
  }, []);

  const deleteSelectedRows = () => {
    let keys = (selectedKeys === 'all') ? new Set(rows) : selectedKeys;
    let deleteRows = Array.from(keys);
    console.log('Deleting selected rows', deleteRows);
    deleteRows.map(async (row) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${row}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        ToastQueue.negative(`Error deleting project ${row}`, {timeout: 3000});
      }
    });

    setRows((prevRows) => {
        return prevRows.filter((row) => !keys.has(row.id))
    });
    setSelectedKeys(new Set<string>());
  };

  if (rows.length === 0) {
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
          <Button elementType="a" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/create`}>Create</Button>
          <Button elementType='a' variant='negative' onPress={deleteSelectedRows} isDisabled={selectedKeys.size === 0}>Delete</Button>
        </ButtonGroup>
      </Flex>
      <TableView
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
      >
        <TableHeader>
          <Column>Name</Column>
          <Column>Task</Column>
          <Column>Date Created</Column>
          <Column>Loader</Column>
          <Column>Controls</Column>
        </TableHeader>
        <TableBody>
          {rows.map((item) => (
            <Row key={item['id']}>
              <Cell>{item['name']}</Cell>
              <Cell>{item['task']}</Cell>
              <Cell>{item['timestamp']}</Cell>
              <Cell>{item['data_loader']}</Cell>
              <Cell>
                <Flex direction="row" gap="size-100">
                  <Button variant='accent' elementType='a' href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${item['id']}`}>View</Button>
                  <Button variant='accent' elementType='a' href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${item['id']}/edit`}>Edit</Button>
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
