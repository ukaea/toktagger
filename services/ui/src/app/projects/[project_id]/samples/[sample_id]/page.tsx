"use client";
import {Provider, defaultTheme, Breadcrumbs, Item, Button, ButtonGroup, ToastContainer, ToastQueue } from '@adobe/react-spectrum'
import { Disruption } from '@/app/disruption/components/disruption';
import { ElmGraph } from '@/app/elm/components/elms';
import { getSample, getProject, getSampleData } from '@/app/core';
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FindPeaksTool } from '@/app/components/peaks';
import { DataRangeSlider } from '@/app/components/tools/dataRangeSlider';
import { LockedMode } from '@/app/locked-mode/components/locked-mode';
import { ModelTrainModal } from '@/app/components/tools/modelTrain';
import { ModelPredictModal } from '@/app/components/tools/modelPredict';
import { ModelPredictTool } from '@/app/components/tools/modelPredictSample';

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
  if (!args.project) return null;
  if (args.project.task == 'disruption') {
    return (<Disruption data={args.data} annotations={args.annotations} setAnnotations={args.setAnnotations} />);
  } else if (args.project.task == 'ELM') {
    return (<ElmGraph data={args.data} annotations={args.annotations} setAnnotations={args.setAnnotations} />);
  } else if (args.project.task == 'MHD') {
    return (<LockedMode data={args.data.values['mirnov']} viewParams={args.viewParams} annotations={args.annotations} setAnnotations={args.setAnnotations}/>);
  }
}

type Props = {
  params: { project_id: string, sample_id: string };
};

async function saveAnnotations(project_id: string, sample_id: string, annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    annotations.validated = true;
    const response = await fetch(ANNOTATIONS_URL, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotations),
    });
    return response
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
    const response = await saveAnnotations(project_id, sample_id, annotations);
    if (response.ok) {
        ToastQueue.positive(`Saved ${annotations.length} annotations!`, {timeout: 5000})
    } else {
        const payload = await response.json();
        ToastQueue.negative(`Failed to save ${annotations.length} annotations - ${payload.detail}`, {timeout: 5000})
    }
  };

  return <Button variant="primary" onPress={handleClick} >Save</Button>
}


function ToolBar({ project, sample_id, data, annotations, setAnnotations, viewParams, setViewParams}) {
  const project_id = project._id;


  let tools = [];
  const modelPredictTool = (
    <ModelPredictTool project={project} sample_id={sample_id} setAnnotations={setAnnotations}></ModelPredictTool>
  )
  tools.push(modelPredictTool);
  if (project.task == 'ELM') {
    const findPeaksTool = (
        <FindPeaksTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></FindPeaksTool>
    );
    tools.push(findPeaksTool); 
  } else if (project.task == 'MHD') {

    let mhdData = data.values['mirnov'];

    const onAmplitudeRangeChange = async (ampRange) => {
        viewParams.amplitude_min = Math.pow(10, ampRange.start);
        viewParams.amplitude_max = Math.pow(10, ampRange.end);
        setViewParams(viewParams);
    };

    let ampValues = mhdData.amplitude.flat();
    ampValues = ampValues.map(x => Math.log10(Math.max(x, 1e-6)));
    const ampRangeTool = (
        <DataRangeSlider name={'Amplitude Range'} data={ampValues} onChange={onAmplitudeRangeChange} 
        getValueLabel={val => `${Math.round(Math.pow(10, val.start)*10000, 2)/10000} - ${Math.round(Math.pow(10, val.end)*10000, 2)/10000}`}/>
    );
    tools.push(ampRangeTool);
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
          {tools.map((item, i) => <div  key={i}>{item}</div>)}
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

async function getAnnotations(project_id: string, sample_id: string) {
    return await getData(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`);
}


export default function SamplePage({ params }: Props) {
  const props = use(params);
  const project_id = props.project_id;
  const sample_id = props.sample_id;

  const [project, setProject] = useState<any>(null);
  const [sample, setSample] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [annotations, setAnnotations] = useState<any>([]);
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
    const data = await response.json();
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
        <ModelTrainModal project={project}></ModelTrainModal>
        <ModelPredictModal project={project}></ModelPredictModal>

          <div className='flex'>
            <ToolBar project={project} sample_id={sample_id} data={data} annotations={annotations} setAnnotations={setAnnotations} viewParams={viewParams} setViewParams={refreshData}/>
            <div className="flex-1 justify-center">
              <SampleView project={project} data={data} annotations={annotations} setAnnotations={setAnnotations}/>
            </div>
          </div>
      </Provider>
    </div>
  );
}