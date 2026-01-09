"use client";
import { Annotation } from "@/types";
import {
  Flex,
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
import { useNavigate } from "react-router-dom";
import { useSample } from "@/app/contexts/sampleContext";

const TOAST_TIMEOUT = 5000;

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
  validateOnNavigate?: boolean;
};

function NextButton({
  project_id,
  sample_id,
  annotations,
  validateOnNavigate,
}: ButtonInfo) {
  const navigate = useNavigate();

  const moveNextShot = useCallback(async () => {
    await saveSampleAnnotations(
      project_id,
      sample_id,
      annotations,
      validateOnNavigate
    );
    const sample = await getNextSample(project_id, sample_id);
    if (!sample) {
      ToastQueue.negative("No more samples available!", {
        timeout: TOAST_TIMEOUT,
      });
      return;
    }
    const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
    navigate(NEXT_SAMPLE_URL);
  }, [project_id, sample_id, annotations, navigate, validateOnNavigate]);

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
      <ActionButton onPress={moveNextShot}>
        <StepForward />
      </ActionButton>
    </View>
  );
}

function PreviousButton({
  project_id,
  sample_id,
  annotations,
  validateOnNavigate,
}: ButtonInfo) {
  const navigate = useNavigate();

  const movePreviousShot = useCallback(async () => {
    await saveSampleAnnotations(
      project_id,
      sample_id,
      annotations,
      validateOnNavigate
    );

    const sample = await getPreviousSample(project_id, sample_id);
    if (!sample) {
      ToastQueue.negative("No earlier samples available!", {
        timeout: TOAST_TIMEOUT,
      });
      return;
    }
    const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
    navigate(NEXT_SAMPLE_URL);
  }, [project_id, sample_id, annotations, navigate, validateOnNavigate]);

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
      <ActionButton onPress={movePreviousShot}>
        <StepBackward />
      </ActionButton>
    </View>
  );
}

function SaveButton({
  project_id,
  sample_id,
  annotations,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateOnNavigate,
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
  setAnnotations: (
    updater: (annotations: Annotation[]) => Annotation[]
  ) => void;
}) {
  const handleClick = () => {
    setAnnotations(() => []);
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

type SaveInfo = {
  project_id: string;
  sample_id: string;
  annotations: Annotation[];
  validateOnNavigate?: boolean;
};

export function ShotSearch({
  project_id,
  sample_id,
  annotations,
  validateOnNavigate,
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
            validateOnNavigate
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
  const { annotations, setAnnotations } = useSample();
  const [validateOnNavigate, setValidateOnNavigate] = useState(true);
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
          validateOnNavigate={validateOnNavigate}
        />
        <NextButton
          project_id={project_id}
          sample_id={sample_id}
          annotations={annotations}
          validateOnNavigate={validateOnNavigate}
        />
        <ClearButton setAnnotations={setAnnotations} />
      </ButtonGroup>
      <TooltipTrigger delay={1000} placement="bottom">
        <Checkbox
          isSelected={validateOnNavigate}
          onChange={setValidateOnNavigate}
        >
          Validate on Navigate
        </Checkbox>
        <Tooltip>
          When enabled, annotations will be marked as validated when navigating
          to another sample.
        </Tooltip>
      </TooltipTrigger>
      <ShotSearch
        project_id={project_id}
        sample_id={sample_id}
        annotations={annotations}
        validateOnNavigate={validateOnNavigate}
      />
    </Flex>
  );
}
