"use client";
import {Provider, defaultTheme, Breadcrumbs, Item, Button, ButtonGroup, ToastContainer, ToastQueue } from '@adobe/react-spectrum'
import { Disruption } from '@/app/disruption/components/disruption';
import { ElmGraph } from '@/app/elm/components/elms';
import { getSample, getProject, getSampleData } from '@/app/core';
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FindPeaksTool from '@/app/components/peaks';
import { LockedMode } from '@/app/locked-mode/components/locked-mode';

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
    return (<ElmGraph data={args.data} annotations={args.annotations} setAnnotations={args.setAnnotations}/>);
  } else if (args.project.task == 'MHD') {
    return (<LockedMode data={args.data.values['mirnov']}/>);
  }
}

type Props = {
  params: { project_id: string, sample_id: string };
};

async function saveAnnotations(project_id: string, sample_id: string, annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotations),
    });
}

async function getNextSample(project_id: str) {
    const NEXT_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/next`;
    const sampleResult = await fetch(NEXT_URL);
    const sample = await sampleResult.json();
    return sample;
}

export function NextButton({project_id, sample_id, annotations}) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      await saveAnnotations(project_id, sample_id, annotations);
      const sample = await getNextSample(project_id)
      const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
      router.push(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  return <Button variant="primary" onPress={handleClick} >Next</Button>
}

export function SaveButton({project_id, sample_id, annotations}) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      await saveAnnotations(project_id, sample_id, annotations);
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {timeout: 5000})
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  return <Button variant="primary" onPress={handleClick} >Save</Button>
}


function ToolBar({ project, sample_id, data, annotations, setAnnotations}) {
  const project_id = project._id;
  const findPeaksTool = (
      <FindPeaksTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></FindPeaksTool>
  );

  let tools = [];
  if (project.task == 'ELM') {
    tools.push(findPeaksTool); 
  } 

  return (
        <Provider theme={defaultTheme}>
        <div className='h-screen text-center'>
          <div className='p-4'>
            <ButtonGroup>
              <SaveButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
              <NextButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
            </ButtonGroup>
          </div>
          <hr className='m-4'/>
          {tools.map((item, i) => <div className='h-screen' key={i}>{item}</div>)}
        </div>
        </Provider>
  );
}

export async function getData(url) {
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



export default function SamplePage({ params }: Props) {
  const props = use(params);
  const project_id = props.project_id;
  const sample_id = props.sample_id;

  const [project, setProject] = useState<any>(null);
  const [sample, setSample] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [annotations, setAnnotations] = useState<any>([]);

  useEffect(() => {
    const fetchData = async () => {
      const project = await getProject(project_id);
      setProject(project);

      const sample = await getSample(project_id, sample_id)
      setSample(sample);

      let viewParams = null;
      if (project.task == 'MHD') {
        viewParams = {name: 'spectrogram', 'nperseg': 256, 'amplitude_min': 1e-4};
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/data`, {
          method: 'POST',
          headers: {
          'Content-Type': 'application/json',
          },
          body: JSON.stringify(viewParams),
      });
      const data = await response.json();
      setData(data);
    };

    fetchData();
  }, []);

  if (!data) {
    return;
  }
  console.log(data);

  return (
    <div>
      <Provider theme={defaultTheme}>
        <ToastContainer placement="top" />
        <SampleDataBreadCrumbs project={project} sample={sample}></SampleDataBreadCrumbs>
          <div className='flex'>
            <ToolBar project={project} sample_id={sample_id} data={data} annotations={annotations} setAnnotations={setAnnotations}/>
            <div className="flex-1 justify-center">
              <SampleView project={project} data={data} annotations={annotations} setAnnotations={setAnnotations} />
            </div>
          </div>
      </Provider>
    </div>
  );
}