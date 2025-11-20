import { useEffect, useState } from "react";
import {
  Provider,
  defaultTheme,
  Slider,
  Flex,
  ComboBox,
  Item,
  Switch,
} from "@adobe/react-spectrum";
import { Annotation, MultiVariateTimeSeriesData } from "@/types";
import { AnnotatorTypes } from "./types";
import { BACKEND_API_URL } from "@/app/core";

enum ChangePointMethod {
  PELT = "pelt",
  HMM = "hmm",
}

type ChangePointDetectionType = {
  project_id: string;
  sample_id: string;
  data: MultiVariateTimeSeriesData;
  setAnnotations: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[]),
  ) => void;
};

export function ChangePointDetectionTool({
  project_id,
  sample_id,
  data,
  setAnnotations,
}: ChangePointDetectionType) {
  const methodOptions = [
    { id: 0, name: ChangePointMethod.PELT },
    { id: 1, name: ChangePointMethod.HMM },
  ];
  const signalOptions = Object.keys(data.values).map((value, index) => ({
    id: index,
    name: value,
  }));

  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [signalName, setSignalName] = useState<string | null>(null);
  const [penalty, setPenalty] = useState<number>(5);
  const [numPoints, setNumPoints] = useState<number>(500);
  const [method, setMethod] = useState<string>(ChangePointMethod.PELT);
  const [numComponents, setNumComponents] = useState<number>(3);
  const validSignalName = signalName && signalName in data.values;

  useEffect(() => {
    const fetchData = async () => {
      if (!validSignalName || !isEnabled) {
        setAnnotations((previousAnnotations) => {
          const otherAnnotations = previousAnnotations.filter(
            (annotation: Annotation) =>
              annotation.created_by !== AnnotatorTypes.CHANGE_POINT_DETECTION,
          );
          return otherAnnotations;
        });
        return;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotator/change_point_detection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signal_name: signalName,
            method: method,
            penalty: penalty,
            num_points: numPoints,
            num_components: numComponents,
          }),
        },
      );

      const payload: Annotation[] = await response.json();
      setAnnotations((previousAnnotations) => {
        const otherAnnotations = previousAnnotations.filter(
          (annotation: Annotation) =>
            annotation.created_by !== AnnotatorTypes.CHANGE_POINT_DETECTION,
        );
        return otherAnnotations.concat(payload);
      });
    };
    fetchData();
  }, [
    project_id,
    sample_id,
    signalName,
    penalty,
    method,
    numPoints,
    numComponents,
    isEnabled,
    validSignalName,
    setAnnotations,
  ]);

  return (
    <Provider theme={defaultTheme}>
      <div className="m-4">
        <Flex direction="column">
          <Switch isSelected={isEnabled} onChange={setIsEnabled}>
            Enable Tool
          </Switch>
          <ComboBox
            label="Signal Name"
            defaultItems={signalOptions}
            onInputChange={setSignalName}
          >
            {(x) => <Item>{x.name}</Item>}
          </ComboBox>
          <br />
          <ComboBox
            label="Method"
            defaultItems={methodOptions}
            defaultInputValue={method}
            onInputChange={setMethod}
          >
            {(x) => <Item>{x.name}</Item>}
          </ComboBox>
          <br />
          {method === ChangePointMethod.PELT && (
            <>
              <Slider
                label="Penalty"
                minValue={0.01}
                maxValue={30}
                defaultValue={penalty}
                step={0.001}
                onChangeEnd={setPenalty}
              />
              <br />
            </>
          )}
          {method === ChangePointMethod.HMM && (
            <>
              <Slider
                label="No. Components"
                minValue={1}
                maxValue={10}
                defaultValue={numComponents}
                step={1}
                onChangeEnd={setNumComponents}
              />
              <br />
            </>
          )}
          <Slider
            label="No. Points"
            minValue={100}
            maxValue={1000}
            defaultValue={numPoints}
            step={10}
            onChangeEnd={setNumPoints}
          />
        </Flex>
      </div>
    </Provider>
  );
}
