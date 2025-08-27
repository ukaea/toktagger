"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {Provider, defaultTheme,  ButtonGroup, ToastQueue, Button, SearchField } from '@adobe/react-spectrum'
import {
  Annotations,
  CompositeDataSchema,
  Data,
  MultiVariateTimeSeriesDataSchema,
  Project,
  Sample,
  SpectrogramData,
  SpectrogramDataSchema,
  SpectrogramViewParamsSchema,
  ViewParams,
} from "@/types";
import { FindPeaksTool } from '@/app/components/peaks';
import { DataRangeSlider } from '@/app/components/tools/dataRangeSlider';

async function saveAnnotations(project_id: string, sample_id: string, annotations: Annotations) {
    const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;
    await fetch(ANNOTATIONS_URL, {
        method: 'POST',
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
  project_id: string;
  sample_id: string;
  annotations: Annotations;
};

function NextButton({ project_id, sample_id, annotations }: SaveInfo) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      await saveAnnotations(project_id, sample_id, annotations);
      const sample = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
      router.push(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  };

  return (
    <Button variant="primary" onPress={handleClick}>
      Next
    </Button>
  );
}

function SaveButton({ project_id, sample_id, annotations }: SaveInfo) {
  const handleClick = async () => {
    try {
      await saveAnnotations(project_id, sample_id, annotations);
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {
        timeout: 5000,
      });
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  };

  return (
    <Button variant="primary" onPress={handleClick}>
      Save
    </Button>
  );
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
            validationState={errorMessage ? 'invalid' : undefined}
            errorMessage={errorMessage} >
          </SearchField>
}

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

type ToolBarInfo = {
  project: Project;
  sample: Sample;
  data: Data;
  annotations: Annotations;
  setAnnotations: (annotations: Annotations) => void;
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
  const tools: React.ReactNode[] = [];

  if (project.task == "ELM") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);

    if (!result.success) {
      console.warn("ELM data is not available");
      return;
    }

    const findPeaksTool = (
      <FindPeaksTool
        project_id={project_id}
        sample_id={sample_id}
        data={result.data}
        setAnnotations={setAnnotations}
      ></FindPeaksTool>
    );
    tools.push(findPeaksTool);
  } else if (project.task == "MHD") {
    const result = CompositeDataSchema.safeParse(data);

    if (!result.success || !("mirnov" in result.data.values)) {
      console.warn("MHD data is not available");
      return;
    }

    const mhdData = SpectrogramDataSchema.safeParse(
      result.data.values["mirnov"]
    );

    if (!mhdData.success) {
      console.warn("MHD data is not available");
      return;
    }

    const ampRangeTool = (
      <AmplitudeSlider
        data={mhdData.data}
        viewParams={viewParams}
        setViewParams={setViewParams}
      />
    );
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
        <div className='pl-4 pr-4 pb-4 pt-2'>
          <ShotSearch project_id={project_id} sample_id={sample_id} annotations={annotations}/>
        </div>
        <hr className='m-4'/>
        {tools.map((item, i) => <div  key={i}>{item}</div>)}
      </div>
    </Provider>
  );
}
