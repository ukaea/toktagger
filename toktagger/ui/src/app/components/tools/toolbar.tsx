"use client";
import { useEffect, useState } from "react";
import {
  Provider,
  defaultTheme,
  Flex,
  View,
  Header,
  Accordion,
  Disclosure,
  DisclosureTitle,
  DisclosurePanel,
  SearchField,
  ComboBox,
  Item,
  Key,
  Switch,
  NumberField,
  ActionButton,
} from "@adobe/react-spectrum";
import {
  Annotation,
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
import { BACKEND_API_URL, getAnnotationsForSample } from "@/app/core";
import { PeakDetectionTool } from "@/app/components/annotators/peaks";
import { DataRangeSlider } from "@/app/components/tools/dataRangeSlider";
import { ShotLabels } from "../annotators/labels";
import { OutlierDetectionTool } from "../annotators/outliers";
import { ChangePointDetectionTool } from "../annotators/changepoints";
import { JumpDetectionTool } from "../annotators/jump";
import { ExportTool } from "./export";
import { ImportTool } from "./import";
import { NavigationBar } from "./nav";

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
  setAnnotations: (annotations: Annotation[]) => void;
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
        `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotator/spectrogram_threshold`,
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
  annotations: Annotation[];
  setAnnotations: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[])
  ) => void;
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
  const tools: { name: string; component: React.ReactNode }[] = [];

  if (project.task == "ELM") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);

    if (!result.success) {
      console.warn("ELM data is not available");
      return;
    }

    const tsData = result.data;

    const labels = ["No ELMs", "Type I", "Type II", "Type III"];
    tools.push({
      name: "Shot Labels",
      component: (
        <ShotLabels
          labels={labels}
          annotations={annotations}
          setAnnotations={setAnnotations}
        ></ShotLabels>
      ),
    });

    tools.push({
      name: "Peak Detection",
      component: (
        <PeakDetectionTool
          project_id={project_id}
          sample_id={sample_id}
          data={tsData}
          setAnnotations={setAnnotations}
        ></PeakDetectionTool>
      ),
    });

    tools.push({
      name: "Outlier Detection",
      component: (
        <OutlierDetectionTool
          project_id={project_id}
          sample_id={sample_id}
          data={tsData}
          setAnnotations={setAnnotations}
        ></OutlierDetectionTool>
      ),
    });

    tools.push({
      name: "Change Point Detection",
      component: (
        <ChangePointDetectionTool
          project_id={project_id}
          sample_id={sample_id}
          data={tsData}
          setAnnotations={setAnnotations}
        ></ChangePointDetectionTool>
      ),
    });

    tools.push({
      name: "Jump Detection",
      component: (
        <JumpDetectionTool
          project_id={project_id}
          sample_id={sample_id}
          data={tsData}
          setAnnotations={setAnnotations}
        ></JumpDetectionTool>
      ),
    });
  } else if (project.task == "MHD") {
    const resultComposite = CompositeDataSchema.safeParse(data);
    if (!resultComposite.success) {
      console.warn("MHD data is not available");
      return;
    }

    const resultSpec = SpectrogramDataSchema.safeParse(
      resultComposite.data.values["mirnov"]
    );
    if (!resultSpec.success) {
      console.warn("MHD spectrogram data is not available");
      return;
    }

    const mhdData = resultSpec.data;
    tools.push({
      name: "Amplitude Range",
      component: (
        <AmplitudeSlider
          data={mhdData}
          viewParams={viewParams}
          setViewParams={setViewParams}
          plotProps={plotProps}
        />
      ),
    });

    tools.push({
      name: "Color Map",
      component: (
        <ColorMapPicker plotProps={plotProps} setPlotProps={setPlotProps} />
      ),
    });

    tools.push({
      name: "Threshold",
      component: (
        <SpectrogramThresholdTool
          project_id={project_id}
          sample_id={sample_id}
          signal_name={"mirnov"}
          plotProps={plotProps}
          setPlotProps={setPlotProps}
          setAnnotations={setAnnotations}
        />
      ),
    });
  }

  const refreshAnnotations = async () => {
    const dbAnnotations = await getAnnotationsForSample(project_id, sample_id);
    setAnnotations(dbAnnotations);
  };

  return (
    <Provider theme={defaultTheme} height="100vh">
      <View overflow="auto" height="100vh">
        <Flex
          direction="column"
          alignItems="center"
          justifyContent="center"
          gap="size-100"
          width="100%"
        >
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-100"
          >
            <Header height="size-300" marginBottom="size-100">
              <span style={{ fontSize: "1.2rem" }}>Controls</span>
            </Header>
            <NavigationBar
              project_id={project_id}
              sample_id={sample_id}
              annotations={annotations}
              setAnnotations={setAnnotations}
            />
            <Accordion allowsMultipleExpanded={true} width="100%">
              <Disclosure>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Export Annotations</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <ExportTool
                    project={project}
                    sample={sample}
                    current_annotations={annotations}
                  />
                </DisclosurePanel>
              </Disclosure>
              <Disclosure>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Import Annotations</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <ImportTool
                    project_id={project_id}
                    refreshAnnotations={refreshAnnotations}
                  />
                </DisclosurePanel>
              </Disclosure>
            </Accordion>
          </Flex>
          <Flex justifyContent="center" alignItems="center">
            <Header height="size-300" marginBottom="size-100">
              <span style={{ fontSize: "1.2rem" }}>Toolbox</span>
            </Header>
          </Flex>
          <Accordion allowsMultipleExpanded={true} width="100%">
            {tools.map((item, i) => (
              <Disclosure key={i}>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>{item.name}</span>
                </DisclosureTitle>
                <DisclosurePanel>{item.component}</DisclosurePanel>
              </Disclosure>
            ))}
          </Accordion>
        </Flex>
      </View>
    </Provider>
  );
}
