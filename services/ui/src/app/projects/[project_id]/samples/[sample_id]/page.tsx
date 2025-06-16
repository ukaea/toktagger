"use client";
import {Provider, defaultTheme, Breadcrumbs, Item, Button, ButtonGroup, Slider, Flex, Header, ToggleButton, RangeSlider} from '@adobe/react-spectrum'
import { Disruption } from '@/app/disruption/components/disruption';
import { ElmGraph } from '@/app/elm/components/elms';
import { getSample, getProject, getSampleData } from '@/app/core';
import { use } from 'react';
import { useEffect, useState } from 'react';
import FindPeaksTool from '@/app/components/peaks';

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
  const [prominence, setProminance] = useState(0.1);
  const [distance, setDistance] = useState(1);
  const [clearPeaks, setClearPeaks] = useState(false);

  const [timeMinDefault, setTimeMinDefault] = useState(null);
  const [timeMaxDefault, setTimeMaxDefault] = useState(null);
  const [timeRange, setTimeRange] = useState({start: 0, end: 100}); 

  useEffect(() => {
      if (data) {
        const tmin = Math.min(...data.time);
        const tmax = Math.max(...data.time)
        setTimeMinDefault(tmin);
        setTimeMaxDefault(tmax);
      }
  }, [data]);

  useEffect(() => {
      const fetchData = async () => {
        if (clearPeaks) {
          setAnnotations([]);
          return;
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/models/abc/predict/${sample_id}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                prominence: prominence,
                distance: distance,
                time_min: timeRange.start,
                time_max: timeRange.end,
            }),
        });

        const payload = await response.json();
        setAnnotations(payload);
      };

      fetchData();
  }, [prominence, distance, clearPeaks, timeRange]);

  if (!data) {
    return;
  }

  const findPeaksTool = (
      <FindPeaksTool project_id={project_id} sample_id={sample_id} data={data} setAnnotations={setAnnotations}></FindPeaksTool>
  );

  let tools = [];
  if (project.task == 'ELM') {
    tools.push(findPeaksTool); 
  } 

  return (
    <div>
      <SampleDataBreadCrumbs project={project} sample={sample}></SampleDataBreadCrumbs>
      <div className='flex'>
        <Provider theme={defaultTheme}>
        <div className='h-screen text-center'>
          <div className='p-4'>
            <ButtonGroup>
                <Button variant="primary">Next</Button>
            </ButtonGroup>
          </div>
          <hr className='m-4'/>
          {tools.map((item, i) => <div className='h-screen' key={i}>{item}</div>)}
        </div>
        </Provider>
        <div className="flex-1 justify-center">
          <SampleView project={project} data={data} annotations={annotations}/>
        </div>
      </div>
    </div>
  );
}