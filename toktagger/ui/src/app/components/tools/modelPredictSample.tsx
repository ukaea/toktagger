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
  const { setAnnotations } = useSample();
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const scheduleTask = async () => {
      if (selectedModel == null || !isEnabled) {
        return;
      }
      const response = await startSamplePredictions(
        project_id,
        sample_id,
        selectedModel
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
  }, [project_id, sample_id, selectedModel, isEnabled]);

  useEffect(() => {
    const fetchData = async () => {
      if (taskId == null || !isEnabled) {
        // Remove previous annotations from this model
        setAnnotations((previousAnnotations: Annotations) => {
          const otherAnnotations = previousAnnotations.filter(
            (annotation: Annotation) => annotation.created_by !== selectedModel
          );
          return otherAnnotations;
        });
        return;
      }
      let pollCounter = 0;
      // Poll for result from GET predictions endpoint
      const interval = setInterval(async () => {
        const response = await getSamplePredictions(
          project._id,
          sample_id,
          selectedModel,
          taskId
        );
        const payload = await response.json();

        if (response.status === 202) {
          // Predictions queued but not done yet, so continue to poll
          pollCounter += 1;
          console.log("Poll counter", pollCounter);
          if (pollCounter > 20) {
            setErrorMessage("Failed to retrieve predictions result.");
            clearInterval(interval);
            setIsLoading(false);
          }
        } else if (response.ok) {
          setAnnotations((previousAnnotations: Annotations) => {
            const otherAnnotations = previousAnnotations.filter(
              (annotation: Annotation) =>
                annotation.created_by !== selectedModel
            );
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
  }, [
    project._id,
    sample_id,
    selectedModel,
    taskId,
    setAnnotations,
    isEnabled,
  ]);

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
