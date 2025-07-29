"use client";
import { useRouter } from 'next/navigation';
import { React } from 'react';
import {Provider, defaultTheme,  ButtonGroup, ToastQueue, Button } from '@adobe/react-spectrum'
import { Annotations, CompositeDataSchema, Data, MultiVariateTimeSeriesDataSchema, Project, Sample, SpectrogramData, SpectrogramDataSchema, SpectrogramViewParams, ViewParams } from "@/types";
import { FindPeaksTool } from '@/app/components/peaks';
import { DataRangeSlider } from '@/app/components/tools/dataRangeSlider';

async function saveAnnotations(project_id: string, sample_id: string, annotations: Annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    await fetch(ANNOTATIONS_URL, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotations),
    });
}

async function getNextSample(project_id: string) {
    const NEXT_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/next`;
    const sampleResult = await fetch(NEXT_URL);
    const sample = await sampleResult.json();
    return sample;
}

type ButtonInfo = {
  project_id: string
  sample_id: string
  annotations: Annotations
};

function NextButton({project_id, sample_id, annotations} : ButtonInfo) {
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

function SaveButton({project_id, sample_id, annotations}: ButtonInfo) {
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

type AmplitudeSliderInfo = {
  data: SpectrogramData,
  viewParams: ViewParams,
  setViewParams: (viewParams: ViewParams) => void
}

function AmplitudeSlider({data, viewParams, setViewParams}: AmplitudeSliderInfo) {
    const onAmplitudeRangeChange = async ({start, end}: {start: number, end: number}) => {
        viewParams.amplitude_min = Math.pow(10, start);
        viewParams.amplitude_max = Math.pow(10, end);
        setViewParams(viewParams);
    };

    let ampValues = data.amplitude.flat();
    ampValues = ampValues.map((x: number) => Math.log10(Math.max(x, 1e-6)));

    const displayAmplitudeValues = (val: number) => {
        // Convert the log10 amplitude value back to linear scale and round to 4 decimal places
        return `${Math.round(Math.pow(10, val)*10000)/10000}`;
    }

    const ampRangeTool = (
        <DataRangeSlider name={'Amplitude Range'} data={ampValues} onChange={onAmplitudeRangeChange} 
        getValueLabel={val => `${displayAmplitudeValues(val.start)} - ${displayAmplitudeValues(val.end)}`}/>
    );
    return ampRangeTool;
}

type ToolBarInfo = {
  project: Project
  sample: Sample
  data: Data,
  annotations: Annotations,
  setAnnotations: (annotations: Annotations) => void,
  viewParams: ViewParams,
  setViewParams: (viewParams: ViewParams) => void
}
export default function ToolBar({ project, sample, data, annotations, setAnnotations, viewParams, setViewParams} : ToolBarInfo) {
  const project_id = project._id;
  const sample_id = sample._id;
  const tools: React.ReactNode[] = [];

  if (project.task == 'ELM') {
    data = MultiVariateTimeSeriesDataSchema.safeParse(data);

    if (!data.success) {
      console.warn('ELM data is not available');
      return;
    }

    data = data.data;
    console.log('ELM data', data);

    const findPeaksTool = (
        <FindPeaksTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></FindPeaksTool>
    );
    tools.push(findPeaksTool); 
  } else if (project.task == 'MHD') {
    data = CompositeDataSchema.safeParse(data);

    if (!data.success || !('mirnov' in data.data.values)) {
      console.warn('MHD data is not available');
      return;
    }

    const mhdData = SpectrogramDataSchema.safeParse(data.data.values['mirnov']);

    if (!mhdData.success) {
      console.warn('MHD data is not available');
      return;
    }

    const ampRangeTool = <AmplitudeSlider data={mhdData.data} viewParams={viewParams} setViewParams={setViewParams}/>
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
