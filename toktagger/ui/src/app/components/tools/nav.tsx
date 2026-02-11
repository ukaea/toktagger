"use client";
import { Annotation, Project } from "@/types";
import {
  Flex,
  Button,
  ActionButton,
  ButtonGroup,
  ToastQueue,
  Text,
  View,
  Checkbox,
  Tooltip,
  TooltipTrigger,
  SearchField,
} from "@adobe/react-spectrum";
import { useCallback, useEffect, useState } from "react";
import StepForward from "@spectrum-icons/workflow/StepForward";
import StepBackward from "@spectrum-icons/workflow/StepBackward";
import SaveFloppy from "@spectrum-icons/workflow/SaveFloppy";
import Delete from "@spectrum-icons/workflow/Delete";
import {
  BACKEND_API_URL,
  getShotSample,
  saveSampleAnnotations,
} from "@/app/core";
import { useNavigate, NavigateFunction } from "react-router-dom";
import { useSample } from "@/app/contexts/SampleContext";

const TOAST_TIMEOUT = 5000;

async function getNextSample(project_id: string, seen_sample_ids: string[]) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/next`;
  const sampleResult = await fetch(NEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(seen_sample_ids),
  });

  if (sampleResult.status === 204) {
    return null; // No next sample available
  } else if (!sampleResult.ok) {
    throw new Error(
      `Failed to fetch next sample: ${sampleResult.status} ${sampleResult.statusText}`,
    );
  }
  const sample = await sampleResult.json();
  return sample;
}

async function navigateToNextSample(
  project_id: string,
  navigate: NavigateFunction,
  seen_sample_ids: string[],
) {
  try {
    const sample = await getNextSample(project_id, seen_sample_ids);
    if (!sample) {
      ToastQueue.negative("No more samples available!", {
        timeout: TOAST_TIMEOUT,
      });
      return;
    }
    const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
    navigate(NEXT_SAMPLE_URL);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ToastQueue.negative(`Failed to fetch next sample: ${message}`, {
      timeout: TOAST_TIMEOUT,
    });
  }
}

type ButtonInfo = {
  project_id: string;
  sample_id: string;
  annotations: Annotation[];
  saveOnNavigate?: boolean;
};

type NextButtonInfo = ButtonInfo & {
  visitedSampleIds: string[];
};

type PreviousButtonInfo = ButtonInfo & {
  isDisabled: boolean;
  popvisitedSampleId: () => string | null;
};

function NextButton({
  project_id,
  sample_id,
  annotations,
  visitedSampleIds,
  saveOnNavigate,
}: NextButtonInfo) {
  const navigate = useNavigate();

  const moveNextShot = useCallback(async () => {
    await saveSampleAnnotations(
      project_id,
      sample_id,
      annotations,
      saveOnNavigate,
    );
    await navigateToNextSample(project_id, navigate, visitedSampleIds);
  }, [
    project_id,
    sample_id,
    annotations,
    navigate,
    saveOnNavigate,
    visitedSampleIds,
  ]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
      <ActionButton aria-label="Next Sample" onPress={moveNextShot}>
        <StepForward />
      </ActionButton>
    </View>
  );
}

export function JumpToNextButton({ project }: { project: Project }) {
  const navigate = useNavigate();

  const moveNextShot = useCallback(async () => {
    await navigateToNextSample(project._id, navigate, []);
  }, [project._id, navigate]);

  return (
    <View marginStart="size-100">
      <Button variant="primary" aria-label="Next Sample" onPress={moveNextShot}>
        <Text>Jump to Next Sample</Text> <StepForward />
      </Button>
    </View>
  );
}

function PreviousButton({
  project_id,
  sample_id,
  annotations,
  isDisabled,
  popvisitedSampleId,
  saveOnNavigate,
}: PreviousButtonInfo) {
  const navigate = useNavigate();

  const movePreviousShot = useCallback(async () => {
    await saveSampleAnnotations(
      project_id,
      sample_id,
      annotations,
      saveOnNavigate,
    );

    try {
      const previous_sample_id: string | null = popvisitedSampleId();

      if (!previous_sample_id) {
        ToastQueue.negative("No earlier samples available!", {
          timeout: TOAST_TIMEOUT,
        });
        return;
      }
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${previous_sample_id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ToastQueue.negative(`Failed to fetch previous sample: ${message}`, {
        timeout: TOAST_TIMEOUT,
      });
    }
  }, [
    project_id,
    sample_id,
    annotations,
    navigate,
    saveOnNavigate,
    popvisitedSampleId,
  ]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
      <ActionButton
        isDisabled={isDisabled}
        aria-label="Previous Sample"
        onPress={movePreviousShot}
      >
        <StepBackward />
      </ActionButton>
    </View>
  );
}

function SaveButton({
  project_id,
  sample_id,
  annotations,
  saveOnNavigate: _saveOnNavigate,
}: ButtonInfo) {
  const handleClick = async () => {
    try {
      await saveSampleAnnotations(project_id, sample_id, annotations, true);
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {
        timeout: TOAST_TIMEOUT,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ToastQueue.negative(`Failed to save annotations: ${message}`, {
        timeout: TOAST_TIMEOUT,
      });
    }
  };

  return (
    <View marginStart="size-100">
      <ActionButton aria-label="Save" onPress={handleClick}>
        <SaveFloppy />
        <Text>Save</Text>
      </ActionButton>
    </View>
  );
}

function ClearButton({
  setAnnotations,
}: {
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[],
  ) => void;
}) {
  const handleClick = () => {
    setAnnotations(() => []);
  };

  return (
    <View marginStart="size-100">
      <ActionButton aria-label="Clear" onPress={handleClick}>
        <Delete />
        <Text>Clear</Text>
      </ActionButton>
    </View>
  );
}

type SaveInfo = {
  project_id: string;
  sample_id: string;
  annotations: Annotation[];
  saveOnNavigate?: boolean;
};

export function ShotSearch({
  project_id,
  sample_id,
  annotations,
  saveOnNavigate,
}: SaveInfo) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onSearchSubmit = async (newValue: string) => {
    if (newValue == "") {
      setErrorMessage("");
    } else if (/^[0-9]*$/.test(newValue)) {
      setErrorMessage("");
      const shot_id = newValue;
      try {
        const sample = await getShotSample(project_id, shot_id);
        if (sample !== null) {
          await saveSampleAnnotations(
            project_id,
            sample_id,
            annotations,
            saveOnNavigate,
          );
          const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
          navigate(NEXT_SAMPLE_URL);
        } else {
          setErrorMessage("Shot not found!");
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    } else {
      setErrorMessage("Please enter a number.");
    }
  };

  return (
    <SearchField
      label="Jump to Shot"
      onSubmit={onSearchSubmit}
      validationState={errorMessage ? "invalid" : undefined}
      errorMessage={errorMessage}
    ></SearchField>
  );
}

type NavigationBarInfo = {
  project_id: string;
  sample_id: string;
};
export function NavigationBar({ project_id, sample_id }: NavigationBarInfo) {
  const { annotations, setAnnotations, visitedSampleIds, popvisitedSampleId } =
    useSample();
  const [SaveOnNavigate, setSaveOnNavigate] = useState(true);
  return (
    <Flex alignItems="center" direction="column" gap="size-100">
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
          isDisabled={visitedSampleIds.length == 1}
          popvisitedSampleId={popvisitedSampleId}
          saveOnNavigate={SaveOnNavigate}
        />
        <NextButton
          project_id={project_id}
          sample_id={sample_id}
          annotations={annotations}
          visitedSampleIds={visitedSampleIds}
          saveOnNavigate={SaveOnNavigate}
        />
        <ClearButton setAnnotations={setAnnotations} />
      </ButtonGroup>
      <TooltipTrigger delay={1000} placement="bottom">
        <Checkbox isSelected={SaveOnNavigate} onChange={setSaveOnNavigate}>
          Save on Navigate
        </Checkbox>
        <Tooltip>
          When enabled, annotations will be saved when navigating to another
          sample.
        </Tooltip>
      </TooltipTrigger>
      <ShotSearch
        project_id={project_id}
        sample_id={sample_id}
        annotations={annotations}
        saveOnNavigate={SaveOnNavigate}
      />
    </Flex>
  );
}
