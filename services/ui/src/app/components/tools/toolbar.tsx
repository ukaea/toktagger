"use client";
import { useRouter } from 'next/navigation';
import { View, Header, Flex, Provider, defaultTheme,  ButtonGroup, ToastQueue, Button, Disclosure, Accordion, DisclosureTitle, DisclosurePanel } from '@adobe/react-spectrum'
import { Annotations, Data, Project, Sample } from "@/types";
import { DataRangeSlider } from '@/app/components/tools/dataRangeSlider';
import { PeakDetectionTool } from '@/app/components/peaks';
import { OutlierDetectionTool } from '@/app/components/outliers';
import { ChangePointDetectionTool } from '@/app/components/changepoints';
import { JumpDetectionTool } from '@/app/components/jump';
import { ShotLabels } from '@/app/components/labels';
import { use, useEffect, useState } from 'react';
import {Key} from '@react-types/shared';

async function saveAnnotations(project_id: string, sample_id: string, annotations: Annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    const response = await fetch(ANNOTATIONS_URL, {
        method: 'PUT',
        headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotations),
    });
    if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
    }
}

async function getNextSample(project_id: str) {
    const NEXT_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/next`;
    const sampleResult = await fetch(NEXT_URL);
    const sample = await sampleResult.json();
    return sample;
}

type NextButtonInfo = {
  project_id: string
  sample_id: string
  annotations: Annotations
};
export function NextButton({project_id, sample_id, annotations} : NextButtonInfo) {
  const router = useRouter();

  const handleClick = async () => {
      await saveAnnotations(project_id, sample_id, annotations);
      const sample = await getNextSample(project_id)
      const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
      router.push(NEXT_SAMPLE_URL);
  };

  return <Button variant="primary" onPress={handleClick} >Next</Button>
}

type SaveButtonInfo = {
  project_id: string
  sample_id: string
  annotations: Annotations
};
export function SaveButton({project_id, sample_id, annotations}: SaveButtonInfo) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      await saveAnnotations(project_id, sample_id, annotations);
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {timeout: 5000})
    } catch (err) {
      ToastQueue.negative(`Failed to save annotations: ${err.message}`, {timeout: 5000});
    }
  };

  return <Button variant="primary" onPress={handleClick} >Save</Button>
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


const loadToolbarProps = (name: string): Set<string> => {
    const props = sessionStorage.getItem(name);
    return props ? new Set(JSON.parse(props)) : new Set([]);
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
  const toolBarProps = loadToolbarProps(`toolbarProps_${project_id}`);
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(toolBarProps);

  let tools = [];

  if (project.task == 'ELM' || project.task == 'disruption') {
    const labels = (project.task == 'ELM') ? ['No ELMs', 'Type I', 'Type II', 'Type III'] : ['No Disruptions', 'Disruption'];
    tools.push({
      name: 'Shot Labels',
      component: (
        <ShotLabels labels={labels} annotations={annotations} setAnnotations={setAnnotations}></ShotLabels>
      )
    });

    tools.push({
      name: 'Peak Detection',
      component: (
        <PeakDetectionTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></PeakDetectionTool>
    )}); 

    tools.push({
      name: 'Outlier Detection',
      component: (
        <OutlierDetectionTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></OutlierDetectionTool>
    )});

    tools.push({
      name: 'Change Point Detection',
      component: (
        <ChangePointDetectionTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></ChangePointDetectionTool>
      )
    })

    tools.push({
      name: 'Jump Detection',
      component: (
        <JumpDetectionTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></JumpDetectionTool>
      )
    });

  } else if (project.task == 'MHD') {
    let mhdData = data.values['mirnov'];
    const ampRangeTool = <AmplitudeSlider data={mhdData} viewParams={viewParams} setViewParams={setViewParams}/>
    tools.push({
      name: 'Amplitude Range',
      component: ampRangeTool
    });
  }

  const clearAnnotations = () => {
      setAnnotations([]);
  };

  useEffect(() => {
    sessionStorage.setItem(`toolbarProps_${project_id}`, JSON.stringify(Array.from(expandedKeys)));
  }, [expandedKeys]);

  return (
        <Provider theme={defaultTheme} height="100vh">
          <View direction='column' gap='size-100' overflow="auto" height="100vh">
            <Flex direction='column' alignItems="center" justifyContent="center" gap="size-100" width="100%">
              <Flex direction='column' alignItems="center" justifyContent="center" gap="size-100">
                  <Header height="size-300" marginBottom="size-100">
                    <span style={{ fontSize: '1.2rem' }}>Controls</span>
                  </Header>
                  <ButtonGroup>
                    <SaveButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
                    <NextButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
                    <Button variant="primary" onPress={clearAnnotations} >Clear</Button>
                  </ButtonGroup>
              </Flex>
              <Flex justifyContent="center" alignItems="center">
                  <Header height="size-300" marginBottom="size-100">
                    <span style={{ fontSize: '1.2rem' }}>Toolbox</span>
                  </Header>
              </Flex>
              <Accordion allowsMultipleExpanded={true} defaultExpandedKeys={expandedKeys} onExpandedChange={setExpandedKeys} width="100%">
                {tools.map((item, i) => (
                    <Disclosure key={i} id={item.name}>
                        <DisclosureTitle>
                        <span style={{ fontSize: '0.8rem' }}>{item.name}</span>
                        </DisclosureTitle>
                      <DisclosurePanel>
                        {item.component}
                      </DisclosurePanel>
                    </Disclosure>
                ))}
              </Accordion>
            </Flex>
          </View>
        </Provider>
  );
}
