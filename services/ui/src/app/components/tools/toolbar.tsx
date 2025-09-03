"use client";
import { useEffect, useState } from "react";
import {
  Provider,
  defaultTheme,
  ButtonGroup,
  ToastQueue,
  Button,
  SearchField,
  ComboBox,
  Item,
  Key,
  Switch,
  Flex,
  NumberField,
  ActionButton,
} from "@adobe/react-spectrum";
import {
  Annotations,
  CompositeDataSchema,
  Data,
  MultiVariateTimeSeriesDataSchema,
  PlotProps,
  Project,
  Sample,
  SpectrogramData,
  SpectrogramDataSchema,
  SpectrogramViewParamsSchema,
  ViewParams,
} from "@/types";
import { FindPeaksTool } from "@/app/components/peaks";
import { DataRangeSlider } from "@/app/components/tools/dataRangeSlider";
import { useNavigate } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";

async function saveAnnotations(
  project_id: string,
  sample_id: string,
  annotations: Annotations
) {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(annotations),
  });
}

async function getNextSample(project_id: string) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/next`;
  const sampleResult = await fetch(NEXT_URL);
  const sample = await sampleResult.json();
  return sample;
}

async function getShotSample(project_id: string, shot_id: string) {
  const NEXT_URL = `${BACKEND_API_URL}/projects/${project_id}/samples?shot_id=${shot_id}`;
  const sampleResult = await fetch(NEXT_URL);
  const sampleArray = await sampleResult.json();
  let sample = null;
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
  const navigate = useNavigate();

  const handleClick = async () => {
    try {
      await saveAnnotations(project_id, sample_id, annotations);
      const sample = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sample._id}`;
      navigate(NEXT_SAMPLE_URL);
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

export function ShotSearch({ project_id, sample_id, annotations }: SaveInfo) {
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
          await saveAnnotations(project_id, sample_id, annotations);
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

type AmplitudeSliderInfo = {
  data: SpectrogramData;
  viewParams: ViewParams;
  setViewParams: (viewParams: ViewParams) => void;
  plotProps: PlotProps;
};

function AmplitudeSlider({
  data,
  viewParams,
  setViewParams,
  plotProps,
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

  const numDigits = plotProps.numSignificantDigits || 4;
  const smallPrecisionFactor = Math.pow(10, -1 * numDigits);
  const largePrecisionFactor = Math.pow(10, numDigits);

  let ampValues = data.amplitude.flat();
  ampValues = ampValues.map((x: number) =>
    Math.log10(Math.max(x, smallPrecisionFactor))
  );

  const displayAmplitudeValues = (val: number) => {
    // Convert the log10 amplitude value back to linear scale and round to the specified number of significant digits
    return `${Math.round(Math.pow(10, val) * largePrecisionFactor) / largePrecisionFactor}`;
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

type ColorMapPickerInfo = {
  plotProps: PlotProps;
  setPlotProps: (props: PlotProps) => void;
};

function ColorMapPicker({ plotProps, setPlotProps }: ColorMapPickerInfo) {
  const options = [
    { id: 1, name: "Viridis" },
    { id: 2, name: "Plasma" },
    { id: 3, name: "Inferno" },
    { id: 4, name: "Magma" },
    { id: 5, name: "Cividis" },
  ];

  const onColorMapChange = (key: Key | null) => {
    if (key) {
      const selectedColorMap = Number(key.toString());
      const value = options.find((item) => item.id === selectedColorMap);
      setPlotProps({ ...plotProps, colorMap: value?.name || "Cividis" });
    }
  };

  return (
    <ComboBox
      label="Color Map"
      defaultItems={options}
      inputValue={plotProps.colorMap || "Cividis"}
      onSelectionChange={onColorMapChange}
    >
      {(item) => <Item key={item.id}>{item.name}</Item>}
    </ComboBox>
  );
}

type SpectrogramThresholdToolInfo = {
  project_id: string;
  sample_id: string;
  signal_name: string;
  plotProps: PlotProps;
  setPlotProps: (props: PlotProps) => void;
  setAnnotations: (annotations: Annotations) => void;
};

function SpectrogramThresholdTool({
  project_id,
  sample_id,
  signal_name,
  plotProps,
  setPlotProps,
  setAnnotations,
}: SpectrogramThresholdToolInfo) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState(95);

  const onThresholdChange = (value: boolean) => {
    setActive(value);
    setPlotProps({ ...plotProps, thresholdActive: value });
  };

  const incrementValue = (increment: number) => {
    setValue((prevValue) => {
      const newValue = prevValue + increment;
      if (newValue < 0) return 0;
      if (newValue > 99) return 99;
      return newValue;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!active) {
        setAnnotations([]);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotator/spectrogram_threshold`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signal_name: signal_name,
            percentile: value,
          }),
        }
      );

      const payload = await response.json();
      setAnnotations([payload]);
    };

    fetchData();
  }, [project_id, sample_id, active, value, signal_name, setAnnotations]);

  return (
    <>
      <Switch isSelected={active} onChange={onThresholdChange}>
        Thresholding
      </Switch>
      {active && (
        <Flex
          direction="column"
          gap="size-100"
          margin={"size-200"}
          alignItems={"center"}
        >
          <NumberField
            label="Percentile"
            value={value}
            onChange={setValue}
            minValue={0}
            maxValue={99}
            hideStepper={true}
          />
          <Flex direction="row" gap="size-100">
            <ActionButton
              onPress={() => {
                incrementValue(-5);
              }}
            >
              -5
            </ActionButton>
            <ActionButton
              onPress={() => {
                incrementValue(-1);
              }}
            >
              -1
            </ActionButton>
            <ActionButton
              onPress={() => {
                incrementValue(1);
              }}
            >
              +1
            </ActionButton>
            <ActionButton
              onPress={() => {
                incrementValue(5);
              }}
            >
              +5
            </ActionButton>
          </Flex>
        </Flex>
      )}
    </>
  );
}

type ToolBarInfo = {
  project: Project;
  sample: Sample;
  data: Data;
  annotations: Annotations;
  setAnnotations: (annotations: Annotations) => void;
  viewParams: ViewParams;
  setViewParams: (viewParams: ViewParams) => void;
  plotProps: PlotProps;
  setPlotProps: (props: PlotProps) => void;
};
export default function ToolBar({
  project,
  sample,
  data,
  annotations,
  setAnnotations,
  viewParams,
  setViewParams,
  plotProps,
  setPlotProps,
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
      <>
        <ColorMapPicker plotProps={plotProps} setPlotProps={setPlotProps} />
        <hr className="m-4 h-px opacity-30 border-gray-200" />
        <AmplitudeSlider
          data={mhdData.data}
          viewParams={viewParams}
          setViewParams={setViewParams}
          plotProps={plotProps}
        />
        <hr className="m-4 h-px opacity-30 border-gray-200" />
        <SpectrogramThresholdTool
          project_id={project_id}
          sample_id={sample_id}
          signal_name={"mirnov"}
          plotProps={plotProps}
          setPlotProps={setPlotProps}
          setAnnotations={setAnnotations}
        />
      </>
    );
    tools.push(ampRangeTool);
  }

  return (
    <Provider theme={defaultTheme}>
      <div className="h-screen text-center">
        <div className="pl-4 pr-4 pt-4">
          <ButtonGroup>
            <SaveButton
              project_id={project_id}
              sample_id={sample_id}
              annotations={annotations}
            />
            <NextButton
              project_id={project_id}
              sample_id={sample_id}
              annotations={annotations}
            />
          </ButtonGroup>
        </div>
        <div className="pl-4 pr-4 pb-4 pt-2">
          <ShotSearch
            project_id={project_id}
            sample_id={sample_id}
            annotations={annotations}
          />
        </div>
        <hr className="m-4" />
        {tools.map((item, i) => (
          <div key={i}>{item}</div>
        ))}
      </div>
    </Provider>
  );
}
