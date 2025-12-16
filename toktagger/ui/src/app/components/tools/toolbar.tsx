"use client";

import { useEffect, useState } from "react";
import {
  Provider,
  defaultTheme,
  ButtonGroup,
  ToastQueue,
  Button,
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
  DataParams,
  MultiVariateTimeSeriesDataSchema,
  PlotProps,
  Project,
  Sample,
  SpectrogramData,
  SpectrogramDataSchema,
  SpectrogramViewParamsSchema,
  ViewParams,
} from "@/types";
import { PeakDetectionTool } from "@/app/components/annotators/peaks";
import { DataRangeSlider } from "@/app/components/tools/dataRangeSlider";
import { ShotLabels } from "../annotators/labels";
import { OutlierDetectionTool } from "../annotators/outliers";
import { ChangePointDetectionTool } from "../annotators/changepoints";
import { JumpDetectionTool } from "../annotators/jump";
import { useNavigate } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";

// UFO converters + class/registry helpers (restore the known-good dropdown + instance panel)
import type { ClassRegistry } from "@/app/frames/components/lib";
import {
  LABEL_MAP,
  w3cToCocoFrames,
  cocoFramesToVideoBBoxes,
  loadClassRegistry,
  saveClassRegistry,
  loadLastClassName,
  saveLastClassName,
  FIXED_CLASS_REG,
  canonicalizeTrackId,
  uniqueReadableId,
  scanInstanceCountsChunked,
} from "@/app/frames/components/lib";
import {
  ClassPanel as UFOClassPanel,
  InstancePanel as UFOInstancePanel,
} from "@/app/frames/components/ui";

async function saveAnnotations(
  project_id: string,
  sample_id: string,
  annotations: Annotation[],
) {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(annotations),
  });
  return response;
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
  annotations: Annotation[];
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
      const response = await saveAnnotations(project_id, sample_id, annotations);

      if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
      }
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {
        timeout: 5000,
      });
    } catch (err) {
      if (err instanceof Error) {
        ToastQueue.negative(`${err.message}`, {
          timeout: 5000,
        });
      }
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
    />
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
    Math.log10(Math.max(x, smallPrecisionFactor)),
  );

  const displayAmplitudeValues = (val: number) => {
    return `${Math.round(Math.pow(10, val) * largePrecisionFactor) / largePrecisionFactor}`;
  };

  return (
    <DataRangeSlider
      name={"Amplitude Range"}
      data={ampValues}
      onChange={onAmplitudeRangeChange}
      getValueLabel={(val) =>
        `${displayAmplitudeValues(val.start)} - ${displayAmplitudeValues(val.end)}`
      }
    />
  );
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
  dataParams: DataParams;
  plotProps: PlotProps;
  setPlotProps: (props: PlotProps) => void;
  setAnnotations: (annotations: Annotation[]) => void;
};

function SpectrogramThresholdTool({
  project_id,
  sample_id,
  signal_name,
  dataParams,
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
            annotator_params: {
              signal_name: signal_name,
              percentile: value,
            },
            data_params: dataParams,
          }),
        },
      );

      const payload = await response.json();
      setAnnotations([payload]);
    };

    fetchData();
  }, [
    project_id,
    sample_id,
    active,
    value,
    signal_name,
    dataParams,
    setAnnotations,
  ]);

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
            <ActionButton onPress={() => incrementValue(-5)}>-5</ActionButton>
            <ActionButton onPress={() => incrementValue(-1)}>-1</ActionButton>
            <ActionButton onPress={() => incrementValue(1)}>+1</ActionButton>
            <ActionButton onPress={() => incrementValue(5)}>+5</ActionButton>
          </Flex>
        </Flex>
      )}
    </>
  );
}

/** ---------------------- UFO support (restore known-good ClassPanel + InstancePanel) ---------------------- */

/**
 * Toolbar-side instance profiles used by FrameView via window.ufoInstanceProfiles.
 * FrameView expects: { id, class_name, class_id, track_id }.
 */
type InstanceProfile = {
  id: string; // `${class_name}:${track_id}`
  class_name: string;
  class_id: number;
  track_id: string; // canonicalized slug
};

/**
 * Stable key used by the shared UFOInstancePanel and FrameView events.
 * Shape: "<class_name lowercase>:<canonical track_id>"
 */
const instanceKey = (inst: InstanceProfile) =>
  `${inst.class_name.toLowerCase()}:${inst.track_id}`;

/** ---------------------- Main ToolBar ---------------------- */

type ToolBarInfo = {
  project: Project;
  sample: Sample;
  data: Data;
  annotations: Annotation[];
  setAnnotations: (
    annotations: Annotation[] | ((prev: Annotation[]) => Annotation[]),
  ) => void;
  viewParams: ViewParams;
  setViewParams: (viewParams: ViewParams) => void;
  dataParams: DataParams;
  setDataParams: (dataParams: DataParams) => void;
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
  dataParams,
  plotProps,
  setPlotProps,
}: ToolBarInfo) {
  const navigate = useNavigate();

  const project_id = project._id;
  const sample_id = sample._id;

  const isUfo = project.task === "UFO";

  const tools: { name: string; component: React.ReactNode }[] = [];

  if (!isUfo) {
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
          />
        ),
      });

      tools.push({
        name: "Peak Detection",
        component: (
          <PeakDetectionTool
            project_id={project_id}
            sample_id={sample_id}
            data={tsData}
            dataParams={dataParams}
            setAnnotations={setAnnotations}
          />
        ),
      });

      tools.push({
        name: "Outlier Detection",
        component: (
          <OutlierDetectionTool
            project_id={project_id}
            sample_id={sample_id}
            data={tsData}
            dataParams={dataParams}
            setAnnotations={setAnnotations}
          />
        ),
      });

      tools.push({
        name: "Change Point Detection",
        component: (
          <ChangePointDetectionTool
            project_id={project_id}
            sample_id={sample_id}
            data={tsData}
            dataParams={dataParams}
            setAnnotations={setAnnotations}
          />
        ),
      });

      tools.push({
        name: "Jump Detection",
        component: (
          <JumpDetectionTool
            project_id={project_id}
            sample_id={sample_id}
            data={tsData}
            dataParams={dataParams}
            setAnnotations={setAnnotations}
          />
        ),
      });
    } else if (project.task == "MHD") {
      const resultComposite = CompositeDataSchema.safeParse(data);
      if (!resultComposite.success) {
        console.warn("MHD data is not available");
        return;
      }

      const resultSpec = SpectrogramDataSchema.safeParse(
        resultComposite.data.values["mirnov"],
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
            dataParams={dataParams}
            plotProps={plotProps}
            setPlotProps={setPlotProps}
            setAnnotations={setAnnotations}
          />
        ),
      });
    }
  }

  const clearAnnotations = () => {
    setAnnotations([]);
  };

  /** ---------------- UFO state (restored to backup behavior) ---------------- */

  const [classRegistry, setClassRegistry] = useState<ClassRegistry>({});
  const [selectedClassName, setSelectedClassName] = useState<string | null>(null);

  const [instanceProfiles, setInstanceProfiles] = useState<InstanceProfile[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  const [instanceCounts, setInstanceCounts] = useState<Record<string, number>>(
    {},
  );

  /**
   * Listen to FrameView state events so toolbar stays in sync (instances, selection, counts, registry).
   */
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const onState = (e: Event) => {
      const d = (e as CustomEvent<any>).detail || {};

      if (Array.isArray(d.profiles)) {
        const next: InstanceProfile[] = d.profiles.map((p: any) => ({
          id: `${p.class_name}:${p.track_id}`,
          class_name: p.class_name,
          class_id: p.class_id,
          track_id: p.track_id,
        }));
        setInstanceProfiles(next);

        if (typeof d.selectedKey === "string") {
          const key = d.selectedKey;
          const inst = next.find((p) => instanceKey(p) === key);
          setSelectedInstanceId(inst ? inst.id : null);
        }
      }

      if ("selectedClassName" in d) {
        setSelectedClassName(d.selectedClassName ?? null);
      }

      if ("lastClassName" in d && d.lastClassName) {
        saveLastClassName(d.lastClassName);
      }

      if (d.classRegistry) {
        const reg: ClassRegistry = {};
        Object.entries(d.classRegistry as Record<string, number>).forEach(
          ([name, idVal]) => {
            reg[name.toLowerCase()] = { id: String(idVal), name };
          },
        );
        setClassRegistry(reg);
      }

      if (d.profileCounts) {
        setInstanceCounts(d.profileCounts as Record<string, number>);
      }
    };

    window.addEventListener("ufo:state", onState);
    return () => window.removeEventListener("ufo:state", onState);
  }, [isUfo]);

  /**
   * Initial load of registry + last-used class (shared with FrameView via lib.ts helpers).
   */
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const registry = loadClassRegistry();
    setClassRegistry(registry);

    const last = loadLastClassName();
    if (last) setSelectedClassName(last);
  }, [isUfo]);

  /**
   * Per-instance usage scanner (keeps the instance count badges updated).
   */
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const keyPrefix = "anno::w3c::" + `app://p/${project_id}/s/${sample_id}/`;

    let stopScan: (() => void) | null = null;

    const startScan = () => {
      if (stopScan) stopScan();
      stopScan = scanInstanceCountsChunked({
        keyPrefix,
        onUpdate: (counts) => setInstanceCounts(counts),
      });
    };

    startScan();

    const intervalId = window.setInterval(() => {
      startScan();
    }, 1000);

    return () => {
      if (stopScan) stopScan();
      window.clearInterval(intervalId);
    };
  }, [isUfo, project_id, sample_id]);

  /**
   * Create (or select) an instance for the chosen class, using the original
   * registry + readable track id flow.
   */
  const createInstanceForClass = (
    clsName: string,
    opts: { reselectOnlyIfExisting?: boolean } = {},
  ) => {
    if (!clsName) return;

    const keyLower = clsName.toLowerCase();

    const fromRegistryLower = classRegistry[keyLower];
    const fromRegistryExact = (classRegistry as any)[clsName];

    const regIdStr = fromRegistryLower?.id ?? fromRegistryExact?.id ?? undefined;
    const regId = regIdStr !== undefined ? Number(regIdStr) : undefined;

    const fixedId = (FIXED_CLASS_REG as any)[clsName] ?? (FIXED_CLASS_REG as any)[keyLower];

    const class_id =
      (typeof regId === "number" && !Number.isNaN(regId) ? regId : undefined) ??
      (typeof fixedId === "number" ? fixedId : undefined) ??
      ((LABEL_MAP as any)?.categories?.find?.((c: any) => c?.name === clsName)?.id ?? 1);

    // Ensure class is in registry
    if (!fromRegistryLower && !fromRegistryExact) {
      const nextRegistry: ClassRegistry = {
        ...classRegistry,
        [keyLower]: { id: String(class_id), name: clsName },
      };
      setClassRegistry(nextRegistry);
      saveClassRegistry(nextRegistry);
    }

    // Optionally reselect an existing instance for that class
    if (opts.reselectOnlyIfExisting) {
      const existing = instanceProfiles.filter((p) => p.class_name === clsName);
      if (existing.length > 0) {
        const last = existing[existing.length - 1];
        setSelectedInstanceId(last.id);

        if (typeof window !== "undefined") {
          const w = window as any;
          w.ufoSelectedProfileId = last.id;
          w.ufoSelectedClassName = last.class_name;
          w.ufoSelectedTrackId = last.track_id;
          w.ufoNotifySelectionChanged?.();
        }
        return;
      }
    }

    // Generate a new readable track id for this class
    const existingTrackIds = instanceProfiles
      .filter((p) => p.class_name === clsName)
      .map((p) => p.track_id);

    const readable = uniqueReadableId(existingTrackIds);
    const track_id = canonicalizeTrackId(readable);
    const id = `${clsName}:${track_id}`;

    const nextInstances: InstanceProfile[] = [
      ...instanceProfiles,
      { id, class_name: clsName, class_id, track_id },
    ];

    setInstanceProfiles(nextInstances);
    setSelectedInstanceId(id);

    if (typeof window !== "undefined") {
      const w = window as any;
      w.ufoInstanceProfiles = nextInstances;
      w.ufoSelectedProfileId = id;
      w.ufoSelectedClassName = clsName;
      w.ufoSelectedTrackId = track_id;
      w.ufoNotifySelectionChanged?.();
    }
  };

  /**
   * Mirror toolbar selection + profiles into window.* for FrameView/AnnoBridge.
   */
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const w = window as any;
    w.ufoInstanceProfiles = instanceProfiles;
    w.ufoSelectedProfileId = selectedInstanceId ?? null;
    w.ufoSelectedClassName = selectedClassName ?? null;

    const sel = instanceProfiles.find((p) => p.id === selectedInstanceId) || null;
    w.ufoSelectedTrackId = sel?.track_id ?? null;

    w.ufoNotifySelectionChanged?.();
  }, [isUfo, instanceProfiles, selectedInstanceId, selectedClassName]);

  /** ---------------- UFO delete/clear/save navigation (unchanged) ---------------- */

  const onRequestBulkDelete = (profile: {
    class_name?: string;
    track_id?: string;
  }) => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("ufo:requestBulkDelete", {
        detail: { profile: { class_name: profile.class_name, track_id: profile.track_id } },
      }),
    );
  };

  const onRequestDeleteAllInstances = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ufo:deleteAllInstances"));
  };

  const ufoClearCurrent = async () => {
    await (window as any).ufoClearCurrent?.();
  };

  const ufoClearAllFrames = async () => {
    await (window as any).ufoClearAllFrames?.();
  };

  const collectUfoPayloadForBackend = async (): Promise<Annotation[]> => {
    if (typeof window === "undefined") return annotations;

    const w = window as any;
    if (typeof w.ufoCollectForSave !== "function") {
      return annotations;
    }

    const w3c = await w.ufoCollectForSave();
    const toCocoFrames = (w3cToCocoFrames as any) ?? null;
    const toVideoBBoxes = (cocoFramesToVideoBBoxes as any) ?? null;

    if (typeof toCocoFrames !== "function" || typeof toVideoBBoxes !== "function") {
      return annotations;
    }

    const cocoFrames = toCocoFrames(w3c, {
      projectId: project_id,
      sampleId: sample_id,
      labelMap: LABEL_MAP,
    });

    const videoBBoxes = toVideoBBoxes(cocoFrames, {
      projectId: project_id,
      sampleId: sample_id,
    });

    return Array.isArray(videoBBoxes) ? (videoBBoxes as Annotation[]) : [];
  };

  const handleUfoSave = async () => {
    try {
      const payload = await collectUfoPayloadForBackend();
      const response = await saveAnnotations(project_id, sample_id, payload);
      if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
      }
      ToastQueue.positive(`Saved ${payload.length} annotations!`, {
        timeout: 5000,
      });
    } catch (err) {
      if (err instanceof Error) {
        ToastQueue.negative(`${err.message}`, { timeout: 5000 });
      } else {
        ToastQueue.negative("Failed to save annotations.", { timeout: 5000 });
      }
    }
  };

  const handleUfoNextSample = async () => {
    try {
      const payload = await collectUfoPayloadForBackend();
      await saveAnnotations(project_id, sample_id, payload);

      const next = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${next._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error("Failed to fetch next sample:", err);
      ToastQueue.negative("Failed to load next sample.", { timeout: 5000 });
    }
  };

  function UfoShotSearch() {
    const [errorMessage, setErrorMessage] = useState<string>("");

    const onSearchSubmit = async (newValue: string) => {
      if (newValue == "") {
        setErrorMessage("");
      } else if (/^[0-9]*$/.test(newValue)) {
        setErrorMessage("");
        const shot_id = newValue;
        try {
          const nextSample = await getShotSample(project_id, shot_id);
          if (nextSample !== null) {
            const payload = await collectUfoPayloadForBackend();
            await saveAnnotations(project_id, sample_id, payload);

            const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${nextSample._id}`;
            navigate(NEXT_SAMPLE_URL);
          } else {
            setErrorMessage("Shot not found!");
          }
        } catch (err) {
          console.error("Failed to fetch data:", err);
          setErrorMessage("Failed to fetch shot.");
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
      />
    );
  }

  return (
    <Provider theme={defaultTheme} height="100vh">
      {isUfo ? (
        <div className="h-screen text-center w-72 shrink-0 overflow-y-auto">
          <div className="pl-4 pr-4 pt-4">
            <ButtonGroup>
              <Button variant="primary" onPress={handleUfoSave}>
                Save
              </Button>
              <Button variant="primary" onPress={handleUfoNextSample}>
                Next
              </Button>
            </ButtonGroup>
          </div>

          <div className="pl-4 pr-4 pb-4 pt-2">
            <UfoShotSearch />
          </div>

          <div className="pl-4 pr-4 pb-4">
            <div className="max-w-[16rem] mx-auto mb-4">
              <div className="mb-2">
                <Flex gap="size-100" alignItems="center" wrap>
                  <Button
                    isQuiet
                    isDisabled
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                  >
                    Rectangle
                  </Button>
                </Flex>
              </div>

              <hr className="m-4 h-px opacity-30 border-gray-200" />

              <div className="mb-1">
                <Flex gap="size-100" alignItems="center" wrap>
                  <Button
                    variant="negative"
                    isQuiet
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                    onPress={async () => {
                      try {
                        await ufoClearAllFrames();
                        ToastQueue.positive("Cleared all frames.", {
                          timeout: 2500,
                        });
                      } catch {
                        ToastQueue.negative("Failed to clear all frames.", {
                          timeout: 5000,
                        });
                      }
                    }}
                  >
                    Clear ALL
                  </Button>

                  <Button
                    isQuiet
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                    onPress={async () => {
                      try {
                        await ufoClearCurrent();
                        ToastQueue.positive("Cleared current frame.", {
                          timeout: 2500,
                        });
                      } catch {
                        ToastQueue.negative("Failed to clear current frame.", {
                          timeout: 5000,
                        });
                      }
                    }}
                  >
                    Clear Current
                  </Button>
                </Flex>
              </div>

              <hr className="m-4 h-px opacity-30 border-gray-200" />
            </div>

            {/* Restored: shared ClassPanel (hardcoded/registry-driven; no custom typing hack) */}
            <UFOClassPanel
              selectedClassName={selectedClassName}
              setSelectedClassName={(name) => {
                if (!name) return;
                setSelectedClassName(name);
                saveLastClassName(name ?? "");
                createInstanceForClass(name);
              }}
            />

            {/* Restored: shared InstancePanel (vertical list, auto-scroll via container) */}
            <UFOInstancePanel
              profiles={instanceProfiles.map((inst) => ({
                key: instanceKey(inst),
                class_id: inst.class_id,
                class_name: inst.class_name,
                track_id: inst.track_id,
              }))}
              selectedKey={() => {
                const inst = instanceProfiles.find((p) => p.id === selectedInstanceId);
                return inst ? instanceKey(inst) : null;
              }}
              onSelect={(key) => {
                const inst = instanceProfiles.find((p) => instanceKey(p) === key);
                if (!inst) return;

                setSelectedInstanceId(inst.id);
                setSelectedClassName(inst.class_name);
                saveLastClassName(inst.class_name);

                if (typeof window !== "undefined") {
                  const w = window as any;
                  w.ufoSelectedProfileId = inst.id;
                  w.ufoSelectedClassName = inst.class_name;
                  w.ufoSelectedTrackId = inst.track_id;
                  w.ufoNotifySelectionChanged?.();
                }
              }}
              onCreateProfile={(className: string, trackId: string) => {
                // Creator UI is off, but keep wiring compatible.
                const cls = className;

                const keyLower = cls.toLowerCase();
                const fromRegistryLower = classRegistry[keyLower];
                const fromRegistryExact = (classRegistry as any)[cls];

                const regIdStr = fromRegistryLower?.id ?? fromRegistryExact?.id ?? undefined;
                const regId = regIdStr !== undefined ? Number(regIdStr) : undefined;

                const fixedId =
                  (FIXED_CLASS_REG as any)[cls] ?? (FIXED_CLASS_REG as any)[keyLower];

                const class_id =
                  (typeof regId === "number" && !Number.isNaN(regId) ? regId : undefined) ??
                  (typeof fixedId === "number" ? fixedId : undefined) ??
                  ((LABEL_MAP as any)?.categories?.find?.((c: any) => c?.name === cls)?.id ?? 1);

                const existingTrackIds = instanceProfiles.map((p) => p.track_id);
                const canonicalTrackId =
                  canonicalizeTrackId(trackId) ||
                  canonicalizeTrackId(uniqueReadableId(existingTrackIds));

                const id = `${cls}:${canonicalTrackId}`;

                const nextInstances: InstanceProfile[] = [
                  ...instanceProfiles,
                  { id, class_name: cls, class_id, track_id: canonicalTrackId },
                ];

                setInstanceProfiles(nextInstances);
                setSelectedInstanceId(id);
                setSelectedClassName(cls);
                saveLastClassName(cls);

                if (typeof window !== "undefined") {
                  const w = window as any;
                  w.ufoInstanceProfiles = nextInstances;
                  w.ufoSelectedProfileId = id;
                  w.ufoSelectedClassName = cls;
                  w.ufoSelectedTrackId = canonicalTrackId;
                  w.ufoNotifySelectionChanged?.();
                }
              }}
              onRequestBulkDelete={(profile) => {
                onRequestBulkDelete(profile);
              }}
              onRequestDeleteAllInstances={() => {
                onRequestDeleteAllInstances();
              }}
              profileCounts={instanceCounts}
              showCreator={false}
            />
          </div>
        </div>
      ) : (
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
                <Button variant="primary" onPress={clearAnnotations}>
                  Clear
                </Button>
              </ButtonGroup>
              <ShotSearch
                project_id={project_id}
                sample_id={sample_id}
                annotations={annotations}
              />
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
      )}
    </Provider>
  );
}
