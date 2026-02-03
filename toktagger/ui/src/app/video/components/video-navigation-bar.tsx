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
import { BACKEND_API_URL, getShotSample } from "@/app/core";
import { useNavigate } from "react-router-dom";
import { useVideoSession } from "@/app/video/components/video-session";

const TOAST_TIMEOUT = 5000;

async function getNextSample(project_id: string, current_sample_id: string) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/next?current_sample_id=${current_sample_id}`;
  const sampleResult = await fetch(NEXT_URL);
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

async function getPreviousSample(
  project_id: string,
  current_sample_id: string,
) {
  const PREVIOUS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/previous?current_sample_id=${current_sample_id}`;
  const sampleResult = await fetch(PREVIOUS_URL);
  if (sampleResult.status === 204) {
    return null; // No previous sample available
  } else if (!sampleResult.ok) {
    throw new Error(
      `Failed to fetch previous sample: ${sampleResult.status} ${sampleResult.statusText}`,
    );
  }
  const sample = await sampleResult.json();
  return sample;
}

async function saveVideoAnnotations(
  project_id: string,
  sample_id: string,
  payload: Annotation[],
) {
  const url = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  return await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function saveVideoSessionAnnotations(
  project_id: string,
  sample_id: string,
  annotations: Annotation[],
  saveOnNavigate: boolean = true,
) {
  if (!saveOnNavigate) {
    return;
  }

  const updatedAnnotations = annotations.map((annotation: Annotation) => {
    return {
      ...annotation,
      created_by: "manual",
      validated: true,
    } as Annotation;
  });

  const response = await saveVideoAnnotations(
    project_id,
    sample_id,
    updatedAnnotations,
  );
  if (!response.ok) {
    throw new Error(`Failed to save annotations: ${response.statusText}`);
  }
}

type ButtonInfo = {
  project_id: string;
  sample_id: string;
  onSaved?: () => Promise<void> | void;
  saveOnNavigate?: boolean;
};

function NextButton({ project_id, sample_id, onSaved, saveOnNavigate }: ButtonInfo) {
  const navigate = useNavigate();
  const session = useVideoSession();

  const moveNextShot = useCallback(async () => {
    const payload = session.collectAllVideoBBoxes() as Annotation[];

    try {
      await saveVideoSessionAnnotations(
        project_id,
        sample_id,
        payload,
        saveOnNavigate,
      );

      const sample = await getNextSample(project_id, sample_id);
      if (!sample) {
        ToastQueue.negative("No more samples available!", {
          timeout: TOAST_TIMEOUT,
        });
        return;
      }

      if (saveOnNavigate) {
        session.markSaved();
        await onSaved?.();
      }

      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ToastQueue.negative(`Failed to fetch next sample: ${message}`, {
        timeout: TOAST_TIMEOUT,
      });
    }
  }, [project_id, sample_id, navigate, saveOnNavigate, session, onSaved]);

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
  }, [moveNextShot]);

  return (
    <View marginStart="size-100">
      <ActionButton aria-label="Next Sample" onPress={moveNextShot}>
        <StepForward />
      </ActionButton>
    </View>
  );
}

function PreviousButton({
  project_id,
  sample_id,
  onSaved,
  saveOnNavigate,
}: ButtonInfo) {
  const navigate = useNavigate();
  const session = useVideoSession();

  const movePreviousShot = useCallback(async () => {
    const payload = session.collectAllVideoBBoxes() as Annotation[];

    try {
      await saveVideoSessionAnnotations(
        project_id,
        sample_id,
        payload,
        saveOnNavigate,
      );

      const sample = await getPreviousSample(project_id, sample_id);
      if (!sample) {
        ToastQueue.negative("No earlier samples available!", {
          timeout: TOAST_TIMEOUT,
        });
        return;
      }

      if (saveOnNavigate) {
        session.markSaved();
        await onSaved?.();
      }

      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ToastQueue.negative(`Failed to fetch previous sample: ${message}`, {
        timeout: TOAST_TIMEOUT,
      });
    }
  }, [project_id, sample_id, navigate, saveOnNavigate, session, onSaved]);

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
  }, [movePreviousShot]);

  return (
    <View marginStart="size-100">
      <ActionButton aria-label="Previous Sample" onPress={movePreviousShot}>
        <StepBackward />
      </ActionButton>
    </View>
  );
}

function SaveButton({ project_id, sample_id, onSaved }: ButtonInfo) {
  const session = useVideoSession();

  const handleClick = async () => {
    const payload = session.collectAllVideoBBoxes() as Annotation[];
    try {
      await saveVideoSessionAnnotations(project_id, sample_id, payload, true);
      session.markSaved();
      ToastQueue.positive(`Saved ${payload.length} annotations!`, {
        timeout: TOAST_TIMEOUT,
      });
      await onSaved?.();
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

function ClearButton() {
  const session = useVideoSession();

  const handleClick = () => {
    session.clearAllFrames();
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
  onSaved?: () => Promise<void> | void;
  saveOnNavigate?: boolean;
};

export function VideoShotSearch({
  project_id,
  sample_id,
  onSaved,
  saveOnNavigate,
}: SaveInfo) {
  const navigate = useNavigate();
  const session = useVideoSession();
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
          const payload = session.collectAllVideoBBoxes() as Annotation[];
          await saveVideoSessionAnnotations(
            project_id,
            sample_id,
            payload,
            saveOnNavigate,
          );

          if (saveOnNavigate) {
            session.markSaved();
            await onSaved?.();
          }

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
  onSaved?: () => Promise<void> | void;
};

export function VideoNavigationBar({
  project_id,
  sample_id,
  onSaved,
}: NavigationBarInfo) {
  const [SaveOnNavigate, setSaveOnNavigate] = useState(true);

  return (
    <Flex alignItems="center" direction="column" gap="size-100">
      <ButtonGroup>
        <SaveButton
          project_id={project_id}
          sample_id={sample_id}
          onSaved={onSaved}
        />
        <PreviousButton
          project_id={project_id}
          sample_id={sample_id}
          onSaved={onSaved}
          saveOnNavigate={SaveOnNavigate}
        />
        <NextButton
          project_id={project_id}
          sample_id={sample_id}
          onSaved={onSaved}
          saveOnNavigate={SaveOnNavigate}
        />
        <ClearButton />
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

      <VideoShotSearch
        project_id={project_id}
        sample_id={sample_id}
        onSaved={onSaved}
        saveOnNavigate={SaveOnNavigate}
      />
    </Flex>
  );
}
