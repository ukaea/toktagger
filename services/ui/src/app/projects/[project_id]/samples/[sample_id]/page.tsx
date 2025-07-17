"use client";
import { use, useState, useEffect } from 'react';
import {Provider, defaultTheme, Breadcrumbs, Item, ToastContainer} from '@adobe/react-spectrum'
import { Annotations, CompositeDataSchema, Data, MultiVariateTimeSeriesDataSchema, Project, Sample, SpectrogramDataSchema, ViewParams } from '@/types';
import { ELMView } from '@/app/elms/components/elms';
import { SpectrogramView } from '@/app/spectrogram/components/spectrogram';
import { DisruptionView } from '@/app/disruption/components/disruption';
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
  if (project.task == 'disruption') {
    data = MultiVariateTimeSeriesDataSchema.parse(data);
    return (<DisruptionView data={data} annotations={annotations} setAnnotations={setAnnotations} />);
  } else if (project.task == 'ELM') {
    data = MultiVariateTimeSeriesDataSchema.parse(data);
    return (<ELMView data={data} annotations={annotations} setAnnotations={setAnnotations} />);
  } else if (project.task == 'MHD') {
    data = CompositeDataSchema.parse(data)
    let mhdData = SpectrogramDataSchema.parse(data.values['mirnov']);
    return (<SpectrogramView data={mhdData} annotations={annotations} setAnnotations={setAnnotations}/>);
  }
}


type SamplePageInfo = {
  params: Promise<{ project_id: string, sample_id: string }>;
};

export default function SamplePage({ params }: SamplePageInfo) {
  const props = use(params);
  const project_id = props.project_id;
  const sample_id = props.sample_id;

  const [project, setProject] = useState<Project | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [annotations, setAnnotations] = useState<Annotations>([]);
  const [viewParams, setViewParams] = useState<ViewParams>({name: 'identity'});

  const refreshData = async ( viewParams: ViewParams ) => {
    const project = await getProject(project_id);
    setProject(project);

    const sample = await getSample(project_id, sample_id);
    setSample(sample);

    const dbAnnotations = await getAnnotations(project_id, sample_id);
    setAnnotations(dbAnnotations);
    
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