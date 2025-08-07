"use client";
import { Annotations } from "@/types";
import { ActionButton, Button, ButtonGroup, ToastQueue, Text, View } from "@adobe/react-spectrum";
import { saveSampleAnnotations } from "../core";
import { useRouter } from 'next/navigation';
import StepForward from '@spectrum-icons/workflow/StepForward';
import StepBackward from '@spectrum-icons/workflow/StepBackward';
import SaveFloppy from '@spectrum-icons/workflow/SaveFloppy';
import Delete from '@spectrum-icons/workflow/Delete';

async function getNextSample(project_id: string, current_sample_id: string) {
    const NEXT_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/next?current_sample_id=${current_sample_id}`;
    const sampleResult = await fetch(NEXT_URL);
    if (sampleResult.status === 204) {
        return null; // No next sample available
    }
    const sample = await sampleResult.json();
    return sample;
}

async function getPreviousSample(project_id: string, current_sample_id: string) {
    const PREVIOUS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/previous?current_sample_id=${current_sample_id}`;
    const sampleResult = await fetch(PREVIOUS_URL);
    if (sampleResult.status === 204) {
        return null; // No previous sample available
    }
    const sample = await sampleResult.json();
    return sample;
}

type ButtonInfo = {
  project_id: string;
  sample_id: string;
  annotations: Annotations;
};

function NextButton({ project_id, sample_id, annotations }: ButtonInfo) {
  const router = useRouter();

  const handleClick = async () => {
      await saveSampleAnnotations(project_id, sample_id, annotations);
      const sample = await getNextSample(project_id, sample_id);
      if (!sample) {
          ToastQueue.negative("No more samples available!", {timeout: 3000});
          return;
      }
      const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
      router.push(NEXT_SAMPLE_URL);
  };

  return (
    <View marginStart="size-100">
      <ActionButton onPress={handleClick}>
        <StepForward />
      </ActionButton>
    </View>
  );
}

function PreviousButton({ project_id, sample_id, annotations }: ButtonInfo) {
  const router = useRouter();

  const handleClick = async () => {
      await saveSampleAnnotations(project_id, sample_id, annotations);
      const sample = await getPreviousSample(project_id, sample_id);
      if (!sample) {
          ToastQueue.negative("No earlier samples available!", {timeout: 3000});
          return;
      }
      const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
      router.push(NEXT_SAMPLE_URL);
  };

  return (
    <View marginStart="size-100">
      <ActionButton onPress={handleClick}>
        <StepBackward />
      </ActionButton>
    </View>
  );
}


function SaveButton({ project_id, sample_id, annotations }: ButtonInfo) {
  const handleClick = async () => {
    try {
      await saveSampleAnnotations(project_id, sample_id, annotations);
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {
        timeout: 5000,
      });
    } catch (err) {
      ToastQueue.negative(`Failed to save annotations: ${err.message}`, {timeout: 5000});
    }
  };

  return (
    <View marginStart="size-100">
      <ActionButton onPress={handleClick}>
        <SaveFloppy /><Text>Save</Text>
      </ActionButton>
    </View>
  );
}

function ClearButton({ setAnnotations }: { setAnnotations: (annotations: Annotations) => void }) {
  const handleClick = () => {
    setAnnotations([]);
  };

  return (
    <View marginStart="size-100">
      <ActionButton onPress={handleClick}>
        <Delete /><Text>Clear</Text>
      </ActionButton>
    </View>
  );
}


type NavigationBarInfo = {  
  project_id: string;
  sample_id: string;
  annotations: Annotations;
  setAnnotations: (annotations: Annotations) => void;
};
export function NavigationBar({ project_id, sample_id, annotations, setAnnotations }: NavigationBarInfo) {
    return (
        <ButtonGroup>
            <SaveButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
            <PreviousButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
            <NextButton project_id={project_id} sample_id={sample_id} annotations={annotations}/>
            <ClearButton setAnnotations={setAnnotations} />
        </ButtonGroup>
    )
}