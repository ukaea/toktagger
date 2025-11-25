"use client";
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
import { useEffect, useState } from "react";
=======
=======

<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
>>>>>>> e2ccd11c (Replace the new ClassPanel New class text input with a dropdown in toolbar.tsx):services/ui/src/app/components/tools/toolbar.tsx
import { useEffect, useState, useMemo, FormEvent } from "react";
=======
import { useEffect, useState } from "react";
>>>>>>> b225fa68 (updated instances / toolbar UI):services/ui/src/app/components/tools/toolbar.tsx
import { useRouter } from "next/navigation";
>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx
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
  ActionButton
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
  ViewParams
} from "@/types";
import { PeakDetectionTool } from "@/app/components/annotators/peaks";
import { DataRangeSlider } from "@/app/components/tools/dataRangeSlider";
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
import { ShotLabels } from "../annotators/labels";
import { OutlierDetectionTool } from "../annotators/outliers";
import { ChangePointDetectionTool } from "../annotators/changepoints";
import { JumpDetectionTool } from "../annotators/jump";
import { useNavigate } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";
=======
import type {
  ClassRegistry
} from "@/app/frames/components/lib";
=======
import type { ClassRegistry } from "@/app/frames/components/lib";
>>>>>>> c33a0f4d (Wire counts into the UFO toolbar):services/ui/src/app/components/tools/toolbar.tsx
import {
  w3cToCocoFrames,
  cocoFramesToVideoBBoxes,
  loadClassRegistry,
  saveClassRegistry,
  loadLastClassName,
  saveLastClassName,
  LABEL_MAP,
  FIXED_CLASS_REG,
  canonicalizeTrackId,
  uniqueReadableId,
  scanInstanceCountsChunked
} from "@/app/frames/components/lib";
>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx

/** NEW: shared UFO UI from frames/components/ui.tsx */
import {
  ClassPanel as UFOClassPanel,
  InstancePanel as UFOInstancePanel
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
      "Content-Type": "application/json"
    },
    body: JSON.stringify(annotations)
  });
  return response;
}
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
=======

/**
 * Phase 4 + 10: UFO-specific save helper.
 * Uses the frame annotator via window.* and now sweeps ALL frames in this sample.
 */
async function saveUfoAnnotations(
  project_id: string,
  sample_id: string
): Promise<number> {
  if (typeof window === "undefined") return 0;

  const collect = (window as any).ufoCollectForSave;
  if (!collect) {
    console.warn("ufoCollectForSave is not available yet");
    return 0;
  }

  // 1. Get W3C annotations for ALL frames in this sample
  const w3cList = (await collect()) ?? [];

  // 2. Convert W3C → COCO → VideoBoundingBox[]
  //    includeTracks=true to preserve per-instance tracking info
  const cocoFrames = w3cToCocoFrames(
    w3cList as any,
    true /* includeTracks */
  );
  const videoBoxes = cocoFramesToVideoBBoxes(cocoFrames as any);
  const count = videoBoxes.length;

  const ANNOTATIONS_URL = `${process.env.NEXT_PUBLIC_API_URL}/backend-api/projects/${project_id}/samples/${sample_id}/annotations`;

  // 3. PUT to backend
  await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(videoBoxes)
  });

  // 4. Mark as saved in the bridge
  (window as any).ufoMarkSaved?.();

  return count;
}

>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx
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
      const response = await saveAnnotations(
        project_id,
        sample_id,
        annotations,
      );

      if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
      }
      ToastQueue.positive(`Saved ${annotations.length} annotations!`, {
        timeout: 5000
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

/**
 * Phase 4: UFO toolbar buttons
 */

function UfoSaveButton({
  project_id,
  sample_id
}: {
  project_id: string;
  sample_id: string;
}) {
  const handleClick = async () => {
    try {
      const count = await saveUfoAnnotations(project_id, sample_id);
      ToastQueue.positive(`Saved ${count} UFO annotations!`, {
        timeout: 5000
      });
    } catch (err) {
      console.error("UFO save failed:", err);
      ToastQueue.negative("Failed to save UFO annotations", { timeout: 5000 });
    }
  };

  return (
    <Button variant="primary" onPress={handleClick}>
      Save
    </Button>
  );
}

function UfoNextButton({
  project_id,
  sample_id
}: {
  project_id: string;
  sample_id: string;
}) {
  const router = useRouter();

  const handleClick = async () => {
    try {
      // 1) If dirty, fire a background save (do not block navigation)
      if (typeof window !== "undefined") {
        const hasUnsaved =
          (window as any).ufoHasUnsavedChanges?.() ?? false;

        if (hasUnsaved) {
          // fire-and-forget, no await on purpose
          void saveUfoAnnotations(project_id, sample_id);
        }
      }

      // 2) Navigate to next sample
      const sample = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
      router.push(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error("Failed to go to next UFO sample:", err);
    }
  };

  return (
    <Button variant="primary" onPress={handleClick}>
      Next
    </Button>
  );
}

function UfoShotSearch({
  project_id,
  sample_id
}: {
  project_id: string;
  sample_id: string;
}) {
  const router = useRouter();
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

    const shot_id = newValue;

    try {
      // Foreground save: await before navigating
      await saveUfoAnnotations(project_id, sample_id);

      const sample = await getShotSample(project_id, shot_id);
      if (sample !== null) {
        const NEXT_SAMPLE_URL = `${process.env.NEXT_PUBLIC_API_URL}/projects/${project_id}/samples/${sample._id}`;
        router.push(NEXT_SAMPLE_URL);
      } else {
        setErrorMessage("Shot not found!");
      }
    } catch (err) {
      console.error("Failed to jump to UFO shot:", err);
      setErrorMessage("Failed to save or jump to shot.");
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
  plotProps
}: AmplitudeSliderInfo) {
  const onAmplitudeRangeChange = async ({
    start,
    end
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
    // Convert the log10 amplitude value back to linear scale and round to the specified number of significant digits
    return `${
      Math.round(Math.pow(10, val) * largePrecisionFactor) /
      largePrecisionFactor
    }`;
  };

  const ampRangeTool = (
    <DataRangeSlider
      name={"Amplitude Range"}
      data={ampValues}
      onChange={onAmplitudeRangeChange}
      getValueLabel={(val) =>
        `${displayAmplitudeValues(val.start)} - ${displayAmplitudeValues(
          val.end,
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
    { id: 5, name: "Cividis" }
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
  setAnnotations
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
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            signal_name: signal_name,
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
            percentile: value,
          }),
        },
=======
            percentile: value
          })
        }
>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx
      );

      const payload = await response.json();
      setAnnotations([payload]);
    };

    fetchData();
  }, [project_id, sample_id, active, value, signal_name, setAnnotations, plotProps]);

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

/**
 * Instance profiles (tracking) — previous in-memory list.
 * Kept as-is; now mapped into the shared InstancePanel UI.
 */
type InstanceProfile = {
  id: string; // e.g. "Minor UFO:#young-vortex-2"
  class_name: string;
  class_id: number;
  track_id: string; // canonicalized slug
};

const instanceKey = (inst: InstanceProfile) =>
  `${inst.class_name.toLowerCase()}:${inst.track_id}`;

/** Shared dispatch helper for UFO events (for future phases) */
const dispatchUfoEvent = (name: string, detail?: any) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

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
  setPlotProps
}: ToolBarInfo) {
  const project_id = project._id;
  const sample_id = sample._id;
  const tools: { name: string; component: React.ReactNode }[] = [];

  // UFO class registry and selection state (lives on the left toolbar)
  const [classRegistry, setClassRegistry] = useState<ClassRegistry>({});
  const [selectedClassName, setSelectedClassName] = useState<string | null>(
    null
  );

  // Instance profiles for tracking mode (class + track_id)
  const [instanceProfiles, setInstanceProfiles] = useState<InstanceProfile[]>(
    []
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null
  );

  // Per-instance usage counts across all frames in this sample
  const [instanceCounts, setInstanceCounts] = useState<
    Record<string, number>
  >({});

  // Optional future: accept state snapshots from Frames via "ufo:state"
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onState = (e: Event) => {
      const d = (e as CustomEvent<any>).detail || {};

      // profiles: map from FrameView-style profiles into our InstanceProfile
      if (Array.isArray(d.profiles)) {
        const next: InstanceProfile[] = d.profiles.map((p: any) => ({
          id: `${p.class_name}:${p.track_id}`,
          class_name: p.class_name,
          class_id: p.class_id,
          track_id: p.track_id
        }));
        setInstanceProfiles(next);
      }

      // selectedKey -> selectedInstanceId
      if (typeof d.selectedKey === "string") {
        const key = d.selectedKey;
        const inst = (Array.isArray(d.profiles)
          ? (d.profiles as any[])
          : []
        )
          .map((p: any) => ({
            id: `${p.class_name}:${p.track_id}`,
            class_name: p.class_name,
            class_id: p.class_id,
            track_id: p.track_id
          }))
          .find(
            (p: InstanceProfile) => instanceKey(p) === key
          );
        if (inst) {
          setSelectedInstanceId(inst.id);
        }
      }

      if ("selectedClassName" in d) {
        setSelectedClassName(d.selectedClassName ?? null);
      }

      if ("lastClassName" in d && d.lastClassName) {
        saveLastClassName(d.lastClassName);
      }

      if (d.classRegistry) {
        // Old-frame style: Record<string, number> -> current ClassRegistry
        const reg: ClassRegistry = {};
        Object.entries(
          d.classRegistry as Record<string, number>
        ).forEach(([name, idVal]) => {
          reg[name.toLowerCase()] = {
            id: String(idVal),
            name
          };
        });
        setClassRegistry(reg);
      }

      if (d.profileCounts) {
        setInstanceCounts(
          d.profileCounts as Record<string, number>
        );
      }
    };

    window.addEventListener("ufo:state", onState);
    return () => window.removeEventListener("ufo:state", onState);
  }, []);

  // Load classes + last class for UFO (current-branch logic)
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const registry = loadClassRegistry();
    setClassRegistry(registry);

    const last = loadLastClassName();
    if (last) {
      setSelectedClassName(last);
    }
  }, [isUfo]);

  // Start per-instance usage scanner when we're in UFO mode
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const keyPrefix =
      "anno::w3c::" + `app://p/${project_id}/s/${sample_id}/`;

    const stop = scanInstanceCountsChunked({
      keyPrefix,
      onUpdate: (counts) => {
        setInstanceCounts(counts);
      }
    });

    return () => {
      stop();
    };
  }, [isUfo, project_id, sample_id]);

  // Helper: create or reselect an instance for a given class
  const createInstanceForClass = (
    clsName: string,
    opts: { reselectOnlyIfExisting?: boolean } = {}
  ) => {
    if (!clsName) return;

    const keyLower = clsName.toLowerCase();

    const fromRegistryLower = classRegistry[keyLower];
    const fromRegistryExact = classRegistry[clsName];

    const regIdStr =
      fromRegistryLower?.id ?? fromRegistryExact?.id ?? undefined;
    const regId =
      regIdStr !== undefined ? Number(regIdStr) : undefined;

    const fixedId =
      FIXED_CLASS_REG[clsName] ?? FIXED_CLASS_REG[keyLower];

    const class_id =
      (typeof regId === "number" && !Number.isNaN(regId)
        ? regId
        : undefined) ??
      (typeof fixedId === "number" ? fixedId : undefined) ??
      1;

    // Ensure class is in registry
    if (!fromRegistryLower && !fromRegistryExact) {
      const nextRegistry: ClassRegistry = {
        ...classRegistry,
        [keyLower]: { id: String(class_id), name: clsName }
      };
      setClassRegistry(nextRegistry);
      saveClassRegistry(nextRegistry);
    }

    // If requested, and an instance already exists for this class, just select the last one
    if (opts.reselectOnlyIfExisting) {
      const existing = instanceProfiles.filter(
        (p) => p.class_name === clsName
      );
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

    // Generate a new readable track id
    const existingTrackIds = instanceProfiles.map((p) => p.track_id);
    const readable = uniqueReadableId(existingTrackIds);
    const track_id = canonicalizeTrackId(readable);
    const id = `${clsName}:${track_id}`;

    const nextInstances: InstanceProfile[] = [
      ...instanceProfiles,
      { id, class_name: clsName, class_id, track_id }
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

  // Mirror selection to window so FrameView / AnnoBridge can read it
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    (window as any).ufoSelectedProfileId = selectedInstanceId ?? null;
  }, [isUfo, selectedInstanceId]);

  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;
    (window as any).ufoSelectedClassName = selectedClassName;
  }, [isUfo, selectedClassName]);

  // Expose instance profiles array so FrameView / AnnoBridge can use it later
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;
    (window as any).ufoInstanceProfiles = instanceProfiles;
  }, [isUfo, instanceProfiles]);

  if (project.task == "ELM") {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);

    if (!result.success) {
      console.warn("ELM data is not available");
      return (
        <Provider theme={defaultTheme}>
          <div className="h-screen text-center" />
        </Provider>
      );
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
      return (
        <Provider theme={defaultTheme}>
          <div className="h-screen text-center" />
        </Provider>
      );
    }

    const resultSpec = SpectrogramDataSchema.safeParse(
      resultComposite.data.values["mirnov"],
    );
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
    if (!resultSpec.success) {
      console.warn("MHD spectrogram data is not available");
      return;
=======

    if (!mhdData.success) {
      console.warn("MHD data is not available");
      return (
        <Provider theme={defaultTheme}>
          <div className="h-screen text-center" />
        </Provider>
      );
>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx
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

  const clearAnnotations = () => {
    setAnnotations([]);
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
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
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
=======
          )}
        </div>

        {/* UFO class + instance controls on the left toolbar */}
        {isUfo && (
          <div className="pl-4 pr-4 pb-4">
            {/* Shape + clear controls (frameControls-style block) */}
            <div className="max-w-[16rem] mx-auto mb-4">
              {/* Annotation shape tools (smaller sizing) */}
              <div className="mb-2">
                <Flex gap="size-100" alignItems="center" wrap>
                  <Button
                    isQuiet
                    isDisabled
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                  >
                    Rectangle
                  </Button>
                  {/* Future: Polygon / Lasso etc. */}
                </Flex>
              </div>

              {/* Divider between shape tools and destructive actions */}
              <hr className="m-4 h-px opacity-30 border-gray-200" />

              {/* Destructive actions: Clear ALL / Clear Current */}
              <div className="mb-1">
                <Flex gap="size-100" alignItems="center" wrap>
                  <Button
                    variant="negative"
                    isQuiet
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                    onPress={() => {
                      // Current-branch behavior:
                      if (typeof window !== "undefined") {
                        (window as any).ufoClearAllFrames?.();
                      }
                      // Old-branch event pattern (for future phases):
                      dispatchUfoEvent("ufo:openClearAll");
                    }}
                  >
                    Clear ALL
                  </Button>

                  <Button
                    isQuiet
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                    onPress={() => {
                      // Current-branch behavior:
                      if (typeof window !== "undefined") {
                        (window as any).ufoClearCurrent?.();
                      }
                      // Old-branch event pattern:
                      dispatchUfoEvent("ufo:clearCurrent");
                    }}
                  >
                    Clear Current
                  </Button>
                </Flex>
              </div>

              {/* Divider before class / instance controls */}
              <hr className="m-4 h-px opacity-30 border-gray-200" />
            </div>

            {/* Class picker (shared ClassPanel) */}
            <UFOClassPanel
              selectedClassName={selectedClassName}
              setSelectedClassName={(name) => {
                if (!name) return;
                // Current logic: keep existing behavior
                setSelectedClassName(name);
                saveLastClassName(name ?? "");
                createInstanceForClass(name);

                // Old event pattern for future integration:
                dispatchUfoEvent("ufo:autoCreateProfile", {
                  className: name
                });
                dispatchUfoEvent("ufo:setSelectedClassName", {
                  name: null
                });
              }}
            />

            {/* Instance profiles (class + track_id) */}
            <UFOInstancePanel
              profiles={instanceProfiles.map((inst) => ({
                key: instanceKey(inst),
                class_id: inst.class_id,
                class_name: inst.class_name,
                track_id: inst.track_id
              }))}
              selectedKey={
                (() => {
                  const inst = instanceProfiles.find(
                    (p) => p.id === selectedInstanceId
                  );
                  return inst ? instanceKey(inst) : null;
                })()
              }
              onSelect={(key) => {
                // Old event pattern:
                dispatchUfoEvent("ufo:selectProfile", { key });

                // Current behavior: map key -> instance & mirror to window
                const inst = instanceProfiles.find(
                  (p) => instanceKey(p) === key
                );
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
              onCreateProfile={(
                className: string,
                trackId: string
              ) => {
                // If we ever show creator, hook into current logic:
                const cls = className;
                const existingTrackIds = instanceProfiles.map(
                  (p) => p.track_id
                );
                const canonicalTrackId =
                  canonicalizeTrackId(trackId) ||
                  canonicalizeTrackId(
                    uniqueReadableId(existingTrackIds)
                  );
                const id = `${cls}:${canonicalTrackId}`;
                const keyLower = cls.toLowerCase();

                const fromRegistryLower =
                  classRegistry[keyLower];
                const fromRegistryExact =
                  classRegistry[cls];
                const regIdStr =
                  fromRegistryLower?.id ??
                  fromRegistryExact?.id ??
                  undefined;
                const regId =
                  regIdStr !== undefined
                    ? Number(regIdStr)
                    : undefined;
                const fixedId =
                  FIXED_CLASS_REG[cls] ??
                  FIXED_CLASS_REG[keyLower];

                const class_id =
                  (typeof regId === "number" &&
                  !Number.isNaN(regId)
                    ? regId
                    : undefined) ??
                  (typeof fixedId === "number"
                    ? fixedId
                    : undefined) ??
                  1;

                const nextInstances: InstanceProfile[] = [
                  ...instanceProfiles,
                  {
                    id,
                    class_name: cls,
                    class_id,
                    track_id: canonicalTrackId
                  }
                ];

                setInstanceProfiles(nextInstances);
                setSelectedInstanceId(id);

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
                // Right-click on an instance row: ask FrameView to open
                // the "Delete instance annotations?" modal for this profile.
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("ufo:requestBulkDelete", {
                      detail: {
                        profile: {
                          class_name: profile.class_name,
                          track_id: profile.track_id
                        }
                      }
                    })
                  );
                }
              }}
              onRequestDeleteAllInstances={() => {
                // Trigger global "Delete ALL instances & annotations?" flow.
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("ufo:deleteAllInstances")
                  );
                }
              }}
              profileCounts={instanceCounts}
              showCreator={false}
            />
          </div>
        )}

        <hr className="m-4" />

        {tools.map((item, i) => (
          <div key={i}>{item}</div>
        ))}
      </div>
>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx
    </Provider>
  );
}
