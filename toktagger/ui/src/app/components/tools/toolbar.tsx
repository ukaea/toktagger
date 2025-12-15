"use client";
import { useEffect, useMemo, useCallback, useRef, useState } from "react";
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

// UFO imports (frame annotator stack)
import {
  w3cToCocoFrames,
  cocoFramesToVideoBBoxes,
  loadClassRegistry,
  loadLastClassName,
  saveLastClassName,
  scanInstanceCountsChunked,
  canonicalizeTrackId,
  uniqueReadableId,
  LABEL_MAP,
  FIXED_CLASS_REG,
  type ClassRegistry,
  type VideoBoundingBox,
} from "@/app/frames/components/lib";
import {
  ClassPanel,
  InstancePanel,
  type Profile as InstancePanelProfile,
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
    Math.log10(Math.max(x, smallPrecisionFactor)),
  );

  const displayAmplitudeValues = (val: number) => {
    return `${Math.round(Math.pow(10, val) * largePrecisionFactor) / largePrecisionFactor}`;
  };

  const ampRangeTool = (
    <DataRangeSlider
      name={"Amplitude Range"}
      data={ampValues}
      onChange={onAmplitudeRangeChange}
      getValueLabel={(val) =>
        `${displayAmplitudeValues(val.start)} - ${displayAmplitudeValues(val.end)}`
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

// ------------------------------
// UFO helpers + UI wiring
// ------------------------------

type UfoInstanceProfile = {
  id: string; // stable ID used by FrameView selection: `${class_name}:${track_id}`
  class_id: number;
  class_name: string;
  track_id: string; // canonicalized
};

function resolveClassId(className: string, classRegistry: ClassRegistry): number {
  const keyLower = (className || "").toLowerCase();
  const fromLabelMap =
    LABEL_MAP.categories.find((c) => c.name.toLowerCase() === keyLower)?.id ??
    undefined;

  const fromRegistry = classRegistry[keyLower]?.id ?? classRegistry[className]?.id;
  const regId = fromRegistry !== undefined ? Number(fromRegistry) : undefined;

  const fixed = FIXED_CLASS_REG[keyLower] ?? FIXED_CLASS_REG[className.toLowerCase()];
  const fixedId = typeof fixed === "number" ? fixed : undefined;

  return (
    (typeof fromLabelMap === "number" ? fromLabelMap : undefined) ??
    (typeof regId === "number" && !Number.isNaN(regId) ? regId : undefined) ??
    fixedId ??
    1
  );
}

function makeProfileId(className: string, trackId: string): string {
  // Keep className human-friendly; track id canonical
  return `${className}:${canonicalizeTrackId(trackId)}`;
}

function makeCountsKey(className: string, trackId: string): string {
  return `${(className || "").toLowerCase()}:${canonicalizeTrackId(trackId)}`;
}

async function saveUfoAnnotations(project_id: string, sample_id: string): Promise<{
  boxes: VideoBoundingBox[];
}> {
  if (typeof window === "undefined") {
    throw new Error("UFO save is only available in the browser.");
  }

  const collect = (window as any).ufoCollectForSave as undefined | (() => Promise<any[]>);
  if (!collect) {
    throw new Error("UFO annotator not ready (missing window.ufoCollectForSave).");
  }

  // Collect all frames (and force-save current frame inside FrameView)
  const w3cList = (await collect()) ?? [];

  const cocoFrames = w3cToCocoFrames(w3cList as any[], true);
  const boxes = cocoFramesToVideoBBoxes(cocoFrames as any[]) as VideoBoundingBox[];

  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    // Backend expects VideoBoundingBox[] for UFO; keep TS relaxed here.
    body: JSON.stringify(boxes),
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const payload = await response.json();
      detail = (payload as any)?.detail;
    } catch {
      detail = undefined;
    }
    throw new Error(detail ? `Failed to save: ${detail}` : `Failed to save: ${response.statusText}`);
  }

  (window as any).ufoMarkSaved?.();

  return { boxes };
}

function ufoHasUnsavedChanges(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).ufoHasUnsavedChanges?.());
}

async function ufoClearCurrent(): Promise<void> {
  if (typeof window === "undefined") return;
  await (window as any).ufoClearCurrent?.();
}

async function ufoClearAllFrames(): Promise<void> {
  if (typeof window === "undefined") return;
  await (window as any).ufoClearAllFrames?.();
}

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
  setDataParams,
  plotProps,
  setPlotProps,
}: ToolBarInfo) {
  const navigate = useNavigate();

  const project_id = project._id as string;
  const sample_id = sample._id as string;

  const isUfo = project.task === "UFO";

  // ------------------------------
  // UFO instance state (toolbar-owned)
  // ------------------------------
  const [classRegistry, setClassRegistry] = useState<ClassRegistry>(() =>
    loadClassRegistry(),
  );

  const [selectedClassName, setSelectedClassName] = useState<string | null>(() => {
    const last = loadLastClassName();
    return last && last.trim().length > 0 ? last : null;
  });

  const [instanceProfiles, setInstanceProfiles] = useState<UfoInstanceProfile[]>([]);
  // SelectedKey is the *counts key* (lowercased class + canonical track id) because
  // scanInstanceCountsChunked uses that key shape.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [instanceCounts, setInstanceCounts] = useState<Record<string, number>>({});

  const keyPrefix = useMemo(() => {
    if (!isUfo || !project_id || !sample_id) return undefined;
    return `anno::w3c::app://p/${project_id}/s/${sample_id}/`;
  }, [isUfo, project_id, sample_id]);

  const pushUfoGlobals = useCallback(
    (profiles: UfoInstanceProfile[], nextSelectedKey: string | null, nextSelectedClass: string | null) => {
      if (typeof window === "undefined") return;

      const w = window as any;

      // Publish profiles in the format FrameView expects: list objects with `.id` and label fields
      w.ufoInstanceProfiles = profiles.map((p) => ({
        id: p.id,
        class_name: p.class_name,
        class_id: p.class_id,
        track_id: p.track_id,
      }));

      const selectedProfile =
        nextSelectedKey &&
        profiles.find((p) => makeCountsKey(p.class_name, p.track_id) === nextSelectedKey);

      w.ufoSelectedProfileId = selectedProfile ? selectedProfile.id : null;
      w.ufoSelectedClassName = selectedProfile ? selectedProfile.class_name : nextSelectedClass ?? null;
      w.ufoSelectedTrackId = selectedProfile ? selectedProfile.track_id : null;

      // Notify FrameView to re-check selection/drawingEnabled
      w.ufoNotifySelectionChanged?.();

      // Dispatch state snapshot so any listener can sync
      const profilePayload = profiles.map((p) => ({
        class_name: p.class_name,
        class_id: p.class_id,
        track_id: p.track_id,
      }));

      window.dispatchEvent(
        new CustomEvent("ufo:state", {
          detail: {
            includeTrackIds: true,
            profiles: profilePayload,
            selectedKey: nextSelectedKey,
            selectedClassName: w.ufoSelectedClassName ?? null,
            lastClassName: nextSelectedClass ?? w.ufoSelectedClassName ?? null,
            classRegistry,
          },
        }),
      );
    },
    [classRegistry],
  );

  // Sync selection + class changes into window/globals
  useEffect(() => {
    if (!isUfo) return;
    saveLastClassName(selectedClassName ?? "");
  }, [isUfo, selectedClassName]);

  useEffect(() => {
    if (!isUfo) return;
    pushUfoGlobals(instanceProfiles, selectedKey, selectedClassName);
  }, [isUfo, instanceProfiles, selectedKey, selectedClassName, pushUfoGlobals]);

  // Listen for FrameView-emitted ufo:state updates (auto quick-add, deletes)
  useEffect(() => {
    if (!isUfo || typeof window === "undefined") return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      if (!detail || typeof detail !== "object") return;

      const nextRegistry = detail.classRegistry;
      if (nextRegistry && typeof nextRegistry === "object") {
        setClassRegistry(nextRegistry as ClassRegistry);
      } else {
        // Fallback: refresh from localStorage (AnnoBridge may have updated it)
        setClassRegistry(loadClassRegistry());
      }

      const profArr = Array.isArray(detail.profiles) ? detail.profiles : [];
      const rebuilt: UfoInstanceProfile[] = profArr
        .map((p: any) => {
          const class_name = typeof p?.class_name === "string" ? p.class_name : null;
          const track_id = typeof p?.track_id === "string" ? canonicalizeTrackId(p.track_id) : null;
          const class_id = typeof p?.class_id === "number" ? p.class_id : null;
          if (!class_name || !track_id || !class_id) return null;

          return {
            id: makeProfileId(class_name, track_id),
            class_name,
            class_id,
            track_id,
          } as UfoInstanceProfile;
        })
        .filter(Boolean) as UfoInstanceProfile[];

      setInstanceProfiles(rebuilt);

      const nextSelectedKey = typeof detail.selectedKey === "string" ? detail.selectedKey : null;
      setSelectedKey(nextSelectedKey);

      const nextSelectedClass =
        typeof detail.selectedClassName === "string" && detail.selectedClassName.trim().length > 0
          ? detail.selectedClassName
          : null;
      if (nextSelectedClass !== null) {
        setSelectedClassName(nextSelectedClass);
      }
    };

    window.addEventListener("ufo:state", handler as any);
    return () => {
      window.removeEventListener("ufo:state", handler as any);
    };
  }, [isUfo]);

  // Cross-frame instance count scanner (chunked)
  useEffect(() => {
    if (!isUfo || !keyPrefix) return;

    setInstanceCounts({});

    let cancelScan: (() => void) | null = null;
    let interval: number | null = null;

    const startScan = () => {
      cancelScan?.();
      cancelScan = scanInstanceCountsChunked({
        keyPrefix,
        onUpdate: (counts) => setInstanceCounts(counts),
        chunkSize: 24,
      });
    };

    startScan();

    interval = window.setInterval(() => {
      startScan();
    }, 2000);

    return () => {
      cancelScan?.();
      if (interval) window.clearInterval(interval);
    };
  }, [isUfo, keyPrefix]);

  // Ensure we have a sensible initial selection when profiles appear
  useEffect(() => {
    if (!isUfo) return;

    if (instanceProfiles.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (selectedKey) {
      const exists = instanceProfiles.some(
        (p) => makeCountsKey(p.class_name, p.track_id) === selectedKey,
      );
      if (exists) return;
    }

    const last = instanceProfiles[instanceProfiles.length - 1];
    setSelectedKey(makeCountsKey(last.class_name, last.track_id));
  }, [isUfo, instanceProfiles, selectedKey]);

  const instancePanelProfiles: InstancePanelProfile[] = useMemo(() => {
    return instanceProfiles.map((p) => ({
      key: makeCountsKey(p.class_name, p.track_id),
      class_id: p.class_id,
      class_name: p.class_name,
      track_id: p.track_id,
    }));
  }, [instanceProfiles]);

  const onSelectInstanceKey = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  const onCreateProfile = useCallback(
    (classNameRaw: string, _trackIdRaw: string) => {
      const className = (classNameRaw || "").trim();
      if (!className) return;

      // Make track IDs readable + unique within the class (backup behavior)
      const existingForClass = instanceProfiles
        .filter((p) => p.class_name.toLowerCase() === className.toLowerCase())
        .map((p) => p.track_id);

      const readable = uniqueReadableId(existingForClass);
      const track_id = canonicalizeTrackId(readable);

      const class_id = resolveClassId(className, classRegistry);

      const next: UfoInstanceProfile = {
        id: makeProfileId(className, track_id),
        class_name: className,
        class_id,
        track_id,
      };

      setInstanceProfiles((prev) => [...prev, next]);
      setSelectedClassName(className);
      setSelectedKey(makeCountsKey(className, track_id));

      ToastQueue.positive(`New ${className} instance: #${track_id}`, { timeout: 2500 });
    },
    [instanceProfiles, classRegistry],
  );

  const onRequestBulkDelete = useCallback((profile: InstancePanelProfile) => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("ufo:requestBulkDelete", {
        detail: {
          profile: {
            class_name: profile.class_name,
            track_id: profile.track_id,
          },
        },
      }),
    );
  }, []);

  const onRequestDeleteAllInstances = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ufo:deleteAllInstances"));
  }, []);

  const maybeSaveUfoBestEffort = useCallback(async () => {
    if (!isUfo) return;

    // Best-effort: only try when dirty, but still safe if the bridge chooses to mark dirty often.
    const shouldSave = ufoHasUnsavedChanges();

    if (!shouldSave) return;

    try {
      const { boxes } = await saveUfoAnnotations(project_id, sample_id);
      ToastQueue.positive(`Saved ${boxes.length} boxes (all frames).`, { timeout: 3500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save UFO annotations.";
      ToastQueue.negative(msg, { timeout: 5000 });
      // still "best effort" — do not throw, so Next/Jump can proceed if you want
    }
  }, [isUfo, project_id, sample_id]);

  const handleUfoSave = useCallback(async () => {
    try {
      const { boxes } = await saveUfoAnnotations(project_id, sample_id);
      ToastQueue.positive(`Saved ${boxes.length} boxes (all frames).`, { timeout: 3500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save UFO annotations.";
      ToastQueue.negative(msg, { timeout: 5000 });
    }
  }, [project_id, sample_id]);

  const handleUfoNextSample = useCallback(async () => {
    await maybeSaveUfoBestEffort();
    try {
      const next = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${next._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error("Failed to fetch next sample:", err);
      ToastQueue.negative("Failed to load next sample.", { timeout: 5000 });
    }
  }, [maybeSaveUfoBestEffort, navigate, project_id]);

  const handleUfoShotJump = useCallback(
    async (shot_id: string) => {
      await maybeSaveUfoBestEffort();

      const sampleHit = await getShotSample(project_id, shot_id);
      if (sampleHit !== null) {
        const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${sampleHit._id}`;
        navigate(NEXT_SAMPLE_URL);
      } else {
        throw new Error("Shot not found!");
      }
    },
    [maybeSaveUfoBestEffort, navigate, project_id],
  );

  const clearAnnotations = () => {
    setAnnotations([]);
  };

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
            dataParams={dataParams}
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
            dataParams={dataParams}
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
            dataParams={dataParams}
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
            dataParams={dataParams}
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

  // UFO-aware ShotSearch component (awaits best-effort save before navigating)
  const UfoShotSearch = () => {
    const [errorMessage, setErrorMessage] = useState<string>("");

    const onSearchSubmit = async (newValue: string) => {
      if (newValue === "") {
        setErrorMessage("");
        return;
      }

      if (!/^[0-9]*$/.test(newValue)) {
        setErrorMessage("Please enter a number.");
        return;
      }

      setErrorMessage("");
      try {
        await handleUfoShotJump(newValue);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Shot not found!";
        setErrorMessage(msg);
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

            {isUfo ? (
              <>
                {/* UFO instance manager UI */}
                <div className="w-full px-2">
                  <div className="mb-3">
                    <ClassPanel
                      selectedClassName={selectedClassName}
                      setSelectedClassName={setSelectedClassName}
                    />
                  </div>

                  <div className="mb-2">
                    <InstancePanel
                      profiles={instancePanelProfiles}
                      selectedKey={selectedKey}
                      onSelect={onSelectInstanceKey}
                      onCreateProfile={onCreateProfile}
                      onRequestBulkDelete={onRequestBulkDelete}
                      onRequestDeleteAllInstances={onRequestDeleteAllInstances}
                      profileCounts={instanceCounts}
                      showCreator={true}
                    />
                  </div>
                </div>

                {/* UFO controls row */}
                <ButtonGroup>
                  <Button variant="primary" onPress={handleUfoSave}>
                    Save
                  </Button>

                  <Button variant="primary" onPress={handleUfoNextSample}>
                    Next
                  </Button>

                  <Button
                    variant="primary"
                    onPress={async () => {
                      try {
                        await ufoClearCurrent();
                        ToastQueue.positive("Cleared current frame.", { timeout: 2500 });
                      } catch {
                        ToastQueue.negative("Failed to clear current frame.", { timeout: 5000 });
                      }
                    }}
                  >
                    Clear Frame
                  </Button>

                  <Button
                    variant="primary"
                    onPress={async () => {
                      try {
                        await ufoClearAllFrames();
                        ToastQueue.positive("Cleared all frames (local).", { timeout: 2500 });
                      } catch {
                        ToastQueue.negative("Failed to clear all frames.", { timeout: 5000 });
                      }
                    }}
                  >
                    Clear All
                  </Button>
                </ButtonGroup>

                <UfoShotSearch />
              </>
            ) : (
              <>
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
              </>
            )}
          </Flex>

          {!isUfo && (
            <>
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
            </>
          )}
        </Flex>
      </View>
    </Provider>
  );
}
