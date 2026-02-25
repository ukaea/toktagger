import { useState, useEffect } from "react";
import {
  Provider,
  defaultTheme,
  ComboBox,
  Item,
  Flex,
  ProgressCircle,
  Switch,
} from "@adobe/react-spectrum";
import { Annotations, Annotation } from "@/types";
import { startSamplePredictions, getSamplePredictions } from "@/app/core";
import { useSample } from "@/app/contexts/SampleContext";

type ModelPredictInfo = {
  project_id: string;
  sample_id: string;
};

export function ModelPredictTool({ project_id, sample_id }: ModelPredictInfo) {
  const { annotations, project, setAnnotations } = useSample();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    return annotations.some(
      (ann) => project?.model_types.includes(ann.created_by) || false,
    );
  });
  const [taskId, setTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const scheduleTask = async () => {
      if (!selectedModel) {
        return;
      }
      if (!isEnabled) {
        // Remove previous annotations from this model
        setAnnotations((previousAnnotations: Annotations) => {
          const otherAnnotations = previousAnnotations.filter(
            (annotation: Annotation) =>
              annotation.created_by !== selectedModel || annotation.validated,
          );
          return otherAnnotations;
        });
        return;
      }

      const response = await startSamplePredictions(
        project_id,
        sample_id,
        selectedModel,
      );
      const payload = await response.json();

      if (response.ok) {
        setIsLoading(true);
        setTaskId(payload.task_id);
        setErrorMessage(null);
      } else {
        setErrorMessage(payload.detail);
      }
    };
    scheduleTask();
  }, [project_id, sample_id, selectedModel, isEnabled, setAnnotations]);

  useEffect(() => {
    const fetchData = async () => {
      if (!taskId || !selectedModel || !isEnabled) return;

      let pollCounter = 0;
      // Poll for result from GET predictions endpoint
      const interval = setInterval(async () => {
        if (selectedModel == null) {
          clearInterval(interval);
          setIsLoading(false);
          return;
        }
        const response = await getSamplePredictions(
          project_id,
          sample_id,
          selectedModel,
          taskId,
        );
        const payload = await response.json();

        if (response.status === 202) {
          // Predictions queued but not done yet, so continue to poll
          pollCounter += 1;
          if (pollCounter > 20) {
            setErrorMessage("Failed to retrieve predictions result.");
            clearInterval(interval);
            setIsLoading(false);
          }
        } else if (response.ok) {
          setAnnotations((previousAnnotations: Annotations) => {
            const otherAnnotations = previousAnnotations.filter(
              (annotation: Annotation) =>
                annotation.created_by !== selectedModel,
            );
            console.log("payload being set", payload);
            console.log("concatted", otherAnnotations.concat(payload));
            return otherAnnotations.concat(payload);
          });
          clearInterval(interval);
          setIsLoading(false);
          setErrorMessage(null);
        } else {
          setErrorMessage(payload.detail);
          clearInterval(interval);
          setIsLoading(false);
        }
      }, 1000);
    };
    fetchData();
  }, [project_id, sample_id, selectedModel, taskId, setAnnotations, isEnabled]);

  if (!project) {
    return;
  }

  return (
    <Provider theme={defaultTheme}>
      <div className="m-4">
        <Flex direction="column">
          <Switch isSelected={isEnabled} onChange={setIsEnabled}>
            Enable Tool
          </Switch>
          <ComboBox
            label="Select Model Type"
            validationState={errorMessage ? "invalid" : ""}
            errorMessage={errorMessage}
            onSelectionChange={setSelectedModel}
            isDisabled={!isEnabled}
          >
            {project.model_types.map((model_type) => (
              <Item key={model_type}>{model_type}</Item>
            ))}
          </ComboBox>
          <br />
          {isLoading ? (
            <ProgressCircle aria-label="Loading…" isIndeterminate />
          ) : null}
        </Flex>
      </div>
    </Provider>
  );
}
