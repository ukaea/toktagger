"use client";
import {Provider, defaultTheme, Breadcrumbs, Item} from '@adobe/react-spectrum'
import { Disruption } from '@/app/disruption/components/disruption';
import { ElmGraph } from '@/app/elm/components/elms';
import { getSample, getProject, getSampleData } from '@/app/core';
import { use } from 'react';
import { useEffect, useState } from 'react';

export const SampleDataBreadCrumbs = (info) => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects`}>Projects</Item>
          <Item key="project" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${info.project._id}`}>Project: {info.project.name}</Item>
          <Item key="samples">Sample: {info.sample.shot_id}</Item>
        </Breadcrumbs>
      </Provider>
  );
};

const SampleView = (args) => {
  if (args.project.task == 'disruption') {
    return (<Disruption data={args.data}/>);
  } else if (args.project.task == 'ELM') {
    return (<ElmGraph data={args.data} annotations={args.annotations}/>);
  }
}

type Props = {
  params: { project_id: string, sample_id: string };
};

export default function DisruptionPage({ params }: Props) {
  const props = use(params);
  const project_id = props.project_id;
  const sample_id = props.sample_id;

  const project = getProject(project_id);
  const sample = getSample(project_id, sample_id);
  const data = getSampleData(project_id, sample_id);

  const [annotations, setAnnotations] = useState<any>(null);

  useEffect(() => {
      const fetchData = async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/models/abc/predict/${sample_id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
              prominence: 0.5,
              distance: 1
          }),
      });
      const data = await response.json();
      setAnnotations(data);
      };

      fetchData();
  }, []);


  if (!data) {
    return;
  }

  return (
    <div>
      <SampleDataBreadCrumbs project={project} sample={sample}></SampleDataBreadCrumbs>
      <div className="justify-center">
        <SampleView project={project} data={data} annotations={annotations}/>
      </div>
    </div>
  );
}