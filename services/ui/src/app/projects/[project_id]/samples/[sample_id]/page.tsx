"use client";
import {Provider, defaultTheme, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { Disruption } from '@/app/disruption/components/disruption';
import { useEffect, useState, use } from 'react';

type BreadCrumbInfo = {
    project_id: string,
    sample_id: string
}

export const BreadCrumbs = (info: BreadCrumbInfo) => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/`}>Projects</Item>
          <Item key="project" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${info.project_id}`}>Project {info.project_id}</Item>
          <Item key="samples">Sample {info.sample_id}</Item>
        </Breadcrumbs>
      </Provider>
  );
};

type Props = {
  params: { project_id: string, sample_id: string };
};

export default function DisruptionPage({ params }: Props) {
  const props = use(params);
  const [data, setData] = useState<any>(null);
  const project_id = props.project_id;
  const sample_id = props.sample_id;

  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`);
      const data = await response.json();
      setData(data);
    };

    fetchData();
  }, []);

  if (!data) {
    return;
  }

  return (
    <div>
      <BreadCrumbs project_id={project_id} sample_id={sample_id}></BreadCrumbs>
      <div class="justify-center">
        <Disruption data={data}/>
      </div>
    </div>
  );
}