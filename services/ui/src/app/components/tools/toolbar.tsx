"use client";
import { View, Header, Flex, Provider, defaultTheme,  ButtonGroup, ToastQueue, Button, Disclosure, Accordion, DisclosureTitle, DisclosurePanel, Text } from '@adobe/react-spectrum'
import { Annotations, Data, Project, Sample, SpectrogramData, SpectrogramViewParamsSchema, ViewParams, MultiVariateTimeSeriesData, CompositeData } from "@/types";
import { DataRangeSlider } from '@/app/components/tools/dataRangeSlider';
import { PeakDetectionTool } from '@/app/components/peaks';
import { OutlierDetectionTool } from '@/app/components/outliers';
import { ChangePointDetectionTool } from '@/app/components/changepoints';
import { JumpDetectionTool } from '@/app/components/jump';
import { ShotLabels } from '@/app/components/labels';
import { ExportTool } from '@/app/components/export';
import { useEffect, useState } from 'react';
import {Key} from '@react-types/shared';
import { getAnnotationsForSample } from '@/app/core';
import { ImportTool } from '../import';
import { NavigationBar } from '../nav';

type AmplitudeSliderInfo = {
  data: SpectrogramData;
  viewParams: ViewParams;
  setViewParams: (viewParams: ViewParams) => void;
};

function AmplitudeSlider({
  data,
  viewParams,
  setViewParams,
}: AmplitudeSliderInfo) {
  const onAmplitudeRangeChange = async ({
    start,
    end,
  }: {
    start: number;
    end: number;
  }) => {
    const params = SpectrogramViewParamsSchema.parse(viewParams);
    params.amplitude_min = Math.pow(10, start);
    params.amplitude_max = Math.pow(10, end);
    setViewParams(params);
  };

  let ampValues = data.amplitude.flat();
  ampValues = ampValues.map((x: number) => Math.log10(Math.max(x, 1e-6)));

  const displayAmplitudeValues = (val: number) => {
    // Convert the log10 amplitude value back to linear scale and round to 4 decimal places
    return `${Math.round(Math.pow(10, val) * 10000) / 10000}`;
  };

  const ampRangeTool = (
    <DataRangeSlider
      name={"Amplitude Range"}
      data={ampValues}
      onChange={onAmplitudeRangeChange}
      getValueLabel={(val) =>
        `${displayAmplitudeValues(val.start)} - ${displayAmplitudeValues(
          val.end
        )}`
      }
    />
  );
  return ampRangeTool;
}


const loadToolbarProps = (name: string): Set<string> => {
    const props = sessionStorage.getItem(name);
    return props ? new Set(JSON.parse(props)) : new Set([]);
}

type ToolBarInfo = {
  project: Project;
  sample: Sample;
  data: Data;
  annotations: Annotations;
  setAnnotations: (annotations: Annotations | ((prev: Annotations) => Annotations)) => void;
  viewParams: ViewParams;
  setViewParams: (viewParams: ViewParams) => void;
};
export default function ToolBar({
  project,
  sample,
  data,
  annotations,
  setAnnotations,
  viewParams,
  setViewParams,
}: ToolBarInfo) {
  const project_id = project._id;
  const sample_id = sample._id;
  const toolBarProps = loadToolbarProps(`toolbarProps_${project_id}`);
  const [expandedKeys, setExpandedKeys] = useState<Set<Key>>(toolBarProps);
  const tools: { name: string; component: React.ReactNode }[] = [];

  if (project.task == 'ELM' || project.task == 'disruption') {
    const tsData = data as MultiVariateTimeSeriesData;

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
        <PeakDetectionTool project_id={project_id} sample_id={sample_id} data={tsData} setAnnotations={setAnnotations}></PeakDetectionTool>
    )}); 

    tools.push({
      name: 'Outlier Detection',
      component: (
        <OutlierDetectionTool project_id={project_id} sample_id={sample_id} data={tsData} setAnnotations={setAnnotations}></OutlierDetectionTool>
    )});

    tools.push({
      name: 'Change Point Detection',
      component: (
        <ChangePointDetectionTool project_id={project_id} sample_id={sample_id} data={tsData} setAnnotations={setAnnotations}></ChangePointDetectionTool>
      )
    })

    tools.push({
      name: 'Jump Detection',
      component: (
        <JumpDetectionTool project_id={project_id} sample_id={sample_id} data={tsData} setAnnotations={setAnnotations}></JumpDetectionTool>
      )
    });

  } else if (project.task == 'MHD') {
    const compositeData = data as CompositeData;
    const mhdData = compositeData.values['mhd'] as SpectrogramData;
    const ampRangeTool = <AmplitudeSlider data={mhdData} viewParams={viewParams} setViewParams={setViewParams}/>
    tools.push({
      name: 'Amplitude Range',
      component: ampRangeTool
    });
  }


  const refreshAnnotations = async () => {
    const dbAnnotations = await getAnnotationsForSample(project_id, sample_id);
    console.log('Refreshed Annotations:', dbAnnotations);
    setAnnotations(dbAnnotations);
  }

  useEffect(() => {
    sessionStorage.setItem(`toolbarProps_${project_id}`, JSON.stringify(Array.from(expandedKeys)));
  }, [expandedKeys]);


  return (
        <Provider theme={defaultTheme} height="100vh">
          <View overflow="auto" height="100vh">
            <Flex direction='column' alignItems="center" justifyContent="center" gap="size-100" width="100%">
              <Flex direction='column' alignItems="center" justifyContent="center" gap="size-100">
                  <Header height="size-300" marginBottom="size-100">
                    <span style={{ fontSize: '1.2rem' }}>Controls</span>
                  </Header>
                  <NavigationBar project_id={project_id} sample_id={sample_id} annotations={annotations} setAnnotations={setAnnotations} />
              </Flex>
              <Accordion allowsMultipleExpanded={true} width="100%">
                  <Disclosure>
                      <DisclosureTitle>
                        <span style={{ fontSize: '0.8rem' }}>Export Annotations</span>
                      </DisclosureTitle>
                    <DisclosurePanel>
                      <ExportTool project={project} sample={sample} current_annotations={annotations}/>
                    </DisclosurePanel>
                  </Disclosure>
                  <Disclosure>
                      <DisclosureTitle>
                        <span style={{ fontSize: '0.8rem' }}>Import Annotations</span>
                      </DisclosureTitle>
                    <DisclosurePanel>
                      <ImportTool project_id={project_id} refreshAnnotations={refreshAnnotations}/>
                    </DisclosurePanel>
                  </Disclosure>
              </Accordion>
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
