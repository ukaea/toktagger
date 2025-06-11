"use client";
import { useEffect, useState, use } from 'react';
import {Provider, defaultTheme, Cell, Column, Row, TableView, TableBody, TableHeader, Breadcrumbs, Item} from '@adobe/react-spectrum'


type BreadCrumbInfo = {
    project_id: string,
}

export const BreadCrumbs = (info: BreadCrumbInfo) => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
          <Item key="project" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${info.project_id}`}>Project {info.project_id}</Item>
        </Breadcrumbs>
      </Provider>
  );
};

type SampleTableParams = {
  project_id: string;
};

export const SamplesTable = ({project_id}: SampleTableParams) => {
  const [data, setData] = useState<any>(null);
  const [projectData, setProjectData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples`);
      const data = await response.json();
      setData(data);
    };

    fetchData();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
      const data = await response.json();
      setProjectData(data);
    };

    fetchData();
  }, []);

  if (!data) {
    return;
  }

  console.log(data);

  const rows = data.map(({ _id, ...rest }) => ({
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
  return (
    <div>
    <BreadCrumbs project_id={project_id} />
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