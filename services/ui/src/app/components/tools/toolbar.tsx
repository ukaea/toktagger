"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {Provider, defaultTheme,  ButtonGroup, ToastQueue, Button, SearchField } from '@adobe/react-spectrum'
import { Annotations, Data, Project, Sample } from "@/types";
import { FindPeaksTool } from '@/app/components/peaks';
import { DataRangeSlider } from '@/app/components/tools/dataRangeSlider';

async function saveAnnotations(project_id: string, sample_id: string, annotations: Annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL, {
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

async function getShotSample(project_id: string, shot_id: string) {
    const NEXT_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/?shot_id=${shot_id}`;
    const sampleResult = await fetch(NEXT_URL);
    const sampleArray = await sampleResult.json();
    let sample = null
    if (sampleArray.length > 0) {
      sample = sampleArray[0];
    }
    return sample;
}

type SaveInfo = {
  project_id: string
  sample_id: string
  annotations: Annotations
};
export function NextButton({project_id, sample_id, annotations} : SaveInfo) {
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

export function SaveButton({project_id, sample_id, annotations}: SaveInfo) {
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

export function ShotSearch({project_id, sample_id, annotations} : SaveInfo) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const onSearchSubmit = async (newValue: string) => {
    if (newValue == '') {
      setErrorMessage("")
    } else if (/^[0-9]*$/.test(newValue)) {
      setErrorMessage("")
      const shot_id = newValue 
      try {
        await saveAnnotations(project_id, sample_id, annotations);
        const sample = await getShotSample(project_id, shot_id);
        if (sample !== null) {
          const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
          router.push(NEXT_SAMPLE_URL);
        } else {
          setErrorMessage("Shot not found!");
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    } else {
      setErrorMessage("Please enter a number.");
    }
    }

  return  <SearchField 
            label="Jump to Shot" 
            onSubmit={onSearchSubmit}
            validationState={errorMessage ? 'invalid' : ''}
            errorMessage={errorMessage} >
          </SearchField>
}

type AmplitudeSliderInfo = {
  data: Data,
  viewParams: any,
  setViewParams: (viewParams: any) => void
}

export function AmplitudeSlider({data, viewParams, setViewParams}: AmplitudeSliderInfo) {
    const onAmplitudeRangeChange = async (ampRange) => {
        viewParams.amplitude_min = Math.pow(10, ampRange.start);
        viewParams.amplitude_max = Math.pow(10, ampRange.end);
        setViewParams(viewParams);
    };

    let ampValues = data.amplitude.flat();
    ampValues = ampValues.map(x => Math.log10(Math.max(x, 1e-6)));
    const ampRangeTool = (
        <DataRangeSlider name={'Amplitude Range'} data={ampValues} onChange={onAmplitudeRangeChange} 
        getValueLabel={val => `${Math.round(Math.pow(10, val.start)*10000, 2)/10000} - ${Math.round(Math.pow(10, val.end)*10000, 2)/10000}`}/>
    );
    return ampRangeTool;
}

type ToolBarInfo = {
  project: Project
  sample: Sample
  data: Data,
  annotations: Annotations,
  setAnnotations: (annotations: Annotations) => void,
  viewParams: any,
  setViewParams: (viewParams: any) => void
}
export default function ToolBar({ project, sample, data, annotations, setAnnotations, viewParams, setViewParams} : ToolBarInfo) {
  const project_id = project._id;
  const sample_id = sample._id;


  let tools = [];
  if (project.task == 'ELM') {
    const findPeaksTool = (
        <FindPeaksTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></FindPeaksTool>
    );
    tools.push(findPeaksTool); 
  } else if (project.task == 'MHD') {
    let mhdData = data.values['mirnov'];
    const ampRangeTool = <AmplitudeSlider data={mhdData} viewParams={viewParams} setViewParams={setViewParams}/>
    tools.push(ampRangeTool);
  }

  return (
        <Provider theme={defaultTheme}>
        <div className='h-screen text-center'>
          <div className='pl-4 pr-4 pt-4'>
            <ButtonGroup>
              <SaveButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
              <NextButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
            </ButtonGroup>
          </div>
          <div className='pl-4 pr-4 pb-4'>
            <ShotSearch project_id={project_id} sample_id={sample_id} annotations={annotations}/>
          </div>
          <hr className='m-4'/>
          {tools.map((item, i) => <div  key={i}>{item}</div>)}
        </div>
        </Provider>
  );
}
