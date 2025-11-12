"use client";
import { Annotation } from "@/types";
import {
  ActionButton,
  ButtonGroup,
  ToastQueue,
  Text,
  View,
} from "@adobe/react-spectrum";
import { useCallback, useEffect } from "react";
import StepForward from "@spectrum-icons/workflow/StepForward";
import StepBackward from "@spectrum-icons/workflow/StepBackward";
import SaveFloppy from "@spectrum-icons/workflow/SaveFloppy";
import Delete from "@spectrum-icons/workflow/Delete";
import { BACKEND_API_URL, saveSampleAnnotations } from "@/app/core";
import { useNavigate } from "react-router-dom";

async function getNextSample(project_id: string, current_sample_id: string) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/next?current_sample_id=${current_sample_id}`;
  const sampleResult = await fetch(NEXT_URL);
  if (sampleResult.status === 204) {
    return null; // No next sample available
  }
  const sample = await sampleResult.json();
  return sample;
}

async function getPreviousSample(
  project_id: string,
  current_sample_id: string
) {
  const PREVIOUS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/previous?current_sample_id=${current_sample_id}`;
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
  annotations: Annotation[];
};

function NextButton({ project_id, sample_id, annotations }: ButtonInfo) {
  const navigate = useNavigate();

  const moveNextShot = useCallback(async () => {
    await saveSampleAnnotations(project_id, sample_id, annotations);
    const sample = await getNextSample(project_id, sample_id);
    if (!sample) {
      ToastQueue.negative("No more samples available!", { timeout: 3000 });
      return;
    }
    const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
    navigate(NEXT_SAMPLE_URL);
  }, [project_id, sample_id, annotations, navigate]);

  useEffect(() => {
    function handleKeyDown(e) {
      // Check for Shift + Right Arrow
      if (e.shiftKey && e.key === "ArrowRight") {
        e.preventDefault();
        moveNextShot();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotations, sample_id, project_id, navigate, moveNextShot]);

  return (
    <View marginStart="size-100">
      <ActionButton onPress={moveNextShot}>
        <StepForward />
      </ActionButton>
    </View>
  );
}

function PreviousButton({ project_id, sample_id, annotations }: ButtonInfo) {
  const navigate = useNavigate();

  const movePreviousShot = useCallback(async () => {
    await saveSampleAnnotations(project_id, sample_id, annotations);
    const sample = await getPreviousSample(project_id, sample_id);
    if (!sample) {
      ToastQueue.negative("No earlier samples available!", { timeout: 3000 });
      return;
    }
    const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
    navigate(NEXT_SAMPLE_URL);
  }, [project_id, sample_id, annotations, navigate]);

  useEffect(() => {
    function handleKeyDown(e) {
      // Check for Shift + Left Arrow
      if (e.shiftKey && e.key === "ArrowLeft") {
        e.preventDefault();
        movePreviousShot();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotations, sample_id, project_id, navigate, movePreviousShot]);

  return (
    <View marginStart="size-100">
      <ActionButton onPress={movePreviousShot}>
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
      ToastQueue.negative(`Failed to save annotations: ${err.message}`, {
        timeout: 5000,
      });
    }
  };

  return (
    <View marginStart="size-100">
      <ActionButton onPress={handleClick}>
        <SaveFloppy />
        <Text>Save</Text>
      </ActionButton>
    </View>
  );
}

function ClearButton({
  setAnnotations,
}: {
  setAnnotations: (annotations: Annotation[]) => void;
}) {
  const handleClick = () => {
    setAnnotations([]);
  };

  return (
    <View marginStart="size-100">
      <ActionButton onPress={handleClick}>
        <Delete />
        <Text>Clear</Text>
      </ActionButton>
    </View>
  );
}

type NavigationBarInfo = {
  project_id: string;
  sample_id: string;
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
};
export function NavigationBar({
  project_id,
  sample_id,
  annotations,
  setAnnotations,
}: NavigationBarInfo) {
  return (
    <ButtonGroup>
      <SaveButton
        project_id={project_id}
        sample_id={sample_id}
        annotations={annotations}
      />
      <PreviousButton
        project_id={project_id}
        sample_id={sample_id}
        annotations={annotations}
      />
      <NextButton
        project_id={project_id}
        sample_id={sample_id}
        annotations={annotations}
      />
      <ClearButton setAnnotations={setAnnotations} />
    </ButtonGroup>
  );
}
