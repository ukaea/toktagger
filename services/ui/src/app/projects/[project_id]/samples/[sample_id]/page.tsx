"use client";
import {Provider, defaultTheme, Breadcrumbs, Item, Button, ButtonGroup, ToastContainer, ToastQueue } from '@adobe/react-spectrum'
import { Disruption } from '@/app/disruption/components/disruption';
import { ElmGraph } from '@/app/elm/components/elms';
import { use, useState, useEffect } from 'react';
import { LockedMode } from '@/app/locked-mode/components/locked-mode';
import { Annotations, Data, Project, Sample } from '@/types';
import ToolBar from '@/app/components/tools/toolbar';

type SampleDataBreadCrumbsInfo = {
  project: Project,
  sample: Sample
};
export const SampleDataBreadCrumbs = ({project, sample}: SampleDataBreadCrumbsInfo) => {
  return (
      <Provider theme={defaultTheme}>
        <Breadcrumbs>
          <Item key="projects" href={`${process.env.NEXT_PUBLIC_API_URL}/projects`}>Projects</Item>
          <Item key="project" href={`${process.env.NEXT_PUBLIC_API_URL}/projects/${project._id}`}>Project: {project.name}</Item>
          <Item key="samples">Shot: {sample.shot_id}</Item>
        </Breadcrumbs>
      </Provider>
  );
};

type SampleViewInfo = {
  project: Project,
  data: Data,
  annotations: Annotations,
  setAnnotations: (annotations: Annotations) => void
};

const SampleView = ({project, data, annotations, setAnnotations}: SampleViewInfo) => {
  console.log(data);
  if (project.task == 'disruption') {
    return (<Disruption data={data} annotations={annotations} setAnnotations={setAnnotations} />);
  } else if (project.task == 'ELM') {
    return (<ElmGraph data={data} annotations={annotations} setAnnotations={setAnnotations} />);
  } else if (project.task == 'MHD') {
    return (<LockedMode data={data.values['mirnov']} annotations={annotations} setAnnotations={setAnnotations}/>);
  }
}

export async function getData(url: string): Data {
    const response = await fetch(url);
    const payload = await response.json();
    return payload;
}

async function getSample(project_id: string, sample_id: string) {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}`);
}

async function getProject(project_id: string) {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}`);
}

async function getAnnotations(project_id: string, sample_id: string): Annotations {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`);
}

type SamplePageInfo = {
  params: { project_id: string, sample_id: string };
};

export default function SamplePage({ params }: SamplePageInfo) {
  const props = use(params);
  const project_id = props.project_id;
  const sample_id = props.sample_id;

  const [project, setProject] = useState<any>(null);
  const [sample, setSample] = useState<any>(null);
  const [data, setData] = useState<Data>(null);
  const [annotations, setAnnotations] = useState<Annotations>([]);
  const [viewParams, setViewParams] = useState<any>({name: 'identity'});

  const refreshData = async ( viewParams ) => {
    const project = await getProject(project_id);
    setProject(project);

    const sample = await getSample(project_id, sample_id);
    setSample(sample);

    const annotations = await getAnnotations(project_id, sample_id);
    setAnnotations(annotations);
    
    if (project.task == 'MHD') {
      viewParams.name = 'spectrogram';
      viewParams.nperseg = 256;
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(viewParams),
    });
    const data: Data = await response.json();
    setData(data);
  };

  useEffect(() => {
    const run = async () => {
      await refreshData(viewParams);
    }
    run();
  }, [viewParams]);

  if (!data) {
    return;
  }

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample}></SampleDataBreadCrumbs>
          <div className='flex'>
            <ToolBar project={project} sample={sample} data={data} annotations={annotations} setAnnotations={setAnnotations} viewParams={viewParams} setViewParams={refreshData}/>
            <div className="flex-1 justify-center">
              <SampleView project={project} data={data} annotations={annotations} setAnnotations={setAnnotations}/>
            </div>
          </div>
      </Provider>
    </div>
  );
}