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

type OutlierDetectionType = {
  project_id: string;
  sample_id: string;
  data: MultiVariateTimeSeriesData;
  setAnnotations: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[]),
  ) => void;
};

export function OutlierDetectionTool({
  project_id,
  sample_id,
  data,
  setAnnotations,
}: OutlierDetectionType) {
  const methodOptions = [
    { id: 0, name: "mad" },
    { id: 1, name: "isoforest" },
  ];
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [signalName, setSignalName] = useState<string | null>(null);
  const signalOptions = Object.keys(data.values).map((value, index) => ({
    id: index,
    name: value,
  }));
  const [threshold, setThreshold] = useState<number>(3);
  const [contamination, setContamination] = useState<number>(0);
  const [method, setMethod] = useState<string>("mad");
  const validSignalName = signalName && signalName in data.values;

  useEffect(() => {
    const fetchData = async () => {
      if (!validSignalName || !isEnabled) {
        setAnnotations((previousAnnotations: Annotation[]) => {
          const otherAnnotations = previousAnnotations.filter(
            (annotation: Annotation) =>
              annotation.created_by !== AnnotatorTypes.OUTLIER_DETECTION,
          );
          return otherAnnotations;
        });
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/outlier_detection`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signal_name: signalName,
            method: method,
            threshold: threshold,
            contamination: contamination,
          }),
        },
      );

      const payload: Annotation[] = await response.json();
      setAnnotations((previousAnnotations: Annotation[]) => {
        const otherAnnotations = previousAnnotations.filter(
          (annotation: Annotation) =>
            annotation.created_by !== AnnotatorTypes.OUTLIER_DETECTION,
        );
        return otherAnnotations.concat(payload);
      });
    };
    fetchData();
  }, [
    project_id,
    sample_id,
    signalName,
    threshold,
    contamination,
    method,
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
          {method === "mad" && (
            <>
              <Slider
                label="Threshold"
                minValue={1}
                maxValue={100}
                defaultValue={threshold}
                step={0.001}
                onChangeEnd={setThreshold}
              />
              <br />
            </>
          )}
          {method === "isoforest" && (
            <>
              <Slider
                label="Contamination"
                minValue={0}
                maxValue={0.5}
                defaultValue={contamination}
                step={0.0001}
                onChangeEnd={setContamination}
              />
              <br />
            </>
          )}
        </Flex>
      </div>
    </Provider>
  );
}
