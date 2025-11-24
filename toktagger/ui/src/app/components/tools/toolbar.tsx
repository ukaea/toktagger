"use client";
<<<<<<< HEAD:toktagger/ui/src/app/components/tools/toolbar.tsx
import { useEffect, useState } from "react";
=======
import { useEffect, useState, useMemo, FormEvent } from "react";
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
import { ShotLabels } from "../annotators/labels";
import { OutlierDetectionTool } from "../annotators/outliers";
import { ChangePointDetectionTool } from "../annotators/changepoints";
import { JumpDetectionTool } from "../annotators/jump";
import { useNavigate } from "react-router-dom";
import { BACKEND_API_URL } from "@/app/core";
=======
import type {
  ProfileMap,
  ClassRegistry,
  ClassCounts,
  ProfileId
} from "@/app/frames/components/lib";
import {
  w3cToCocoFrames,
  cocoFramesToVideoBBoxes,
  loadProfiles,
  saveProfiles,
  ensureDefaultProfile,
  loadClassRegistry,
  saveClassRegistry,
  loadLastClassName,
  saveLastClassName,
  scanCrossFrameCountsChunked
} from "@/app/frames/components/lib";
>>>>>>> d70c17e4 (first draft of reimplementing toolbar instance profiles):services/ui/src/app/components/tools/toolbar.tsx

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
 * Phase 4: UFO-specific save helper. Uses the frame annotator via window.*
 */
async function saveUfoAnnotations(project_id: string, sample_id: string) {
  if (typeof window === "undefined") return;

  const collect = (window as any).ufoCollectForSave;
  if (!collect) {
    console.warn("ufoCollectForSave is not available yet");
    return;
  }

  // 1. Get W3C annotations for the current frame
  const w3cList = (await collect()) ?? [];

  // 2. Convert W3C → COCO → VideoBoundingBox[]
  const cocoFrames = w3cToCocoFrames(w3cList);
  const videoBoxes = cocoFramesToVideoBBoxes(cocoFrames);

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
      await saveUfoAnnotations(project_id, sample_id);
      ToastQueue.positive(`Saved UFO frame annotations!`, {
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

/**
 * ClassPanel + InstancePanel for Profiles / Classes / Counts
 */

type ClassPanelProps = {
  profiles: ProfileMap;
  setProfiles: (next: ProfileMap) => void;
  selectedProfileId: string | null;
  setSelectedProfileId: (id: string | null) => void;

  classRegistry: ClassRegistry;
  setClassRegistry: (next: ClassRegistry) => void;

  selectedClassName: string | null;
  setSelectedClassName: (name: string | null) => void;

  classCounts: ClassCounts;
};

export const ClassPanel: React.FC<ClassPanelProps> = ({
  profiles,
  setProfiles,
  selectedProfileId,
  setSelectedProfileId,
  classRegistry,
  setClassRegistry,
  selectedClassName,
  setSelectedClassName,
  classCounts
}) => {
  const [newClassName, setNewClassName] = useState("");
  const [newProfileName, setNewProfileName] = useState("");

  const orderedProfiles = useMemo(
    () => Object.values(profiles),
    [profiles]
  );

  const classesForProfile = useMemo(() => {
    const entries = Object.values(classRegistry);
    if (!selectedProfileId) return entries;
    return entries.filter((c) => c.profileId === selectedProfileId);
  }, [classRegistry, selectedProfileId]);

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id);
  };

  const handleCreateProfile = (e: FormEvent) => {
    e.preventDefault();
    const name = newProfileName.trim();
    if (!name) return;

    let id: ProfileId = name;
    if (profiles[id]) {
      // ensure unique id
      let idx = 2;
      while (profiles[`${name}-${idx}`]) idx++;
      id = `${name}-${idx}`;
    }

    const nextProfiles: ProfileMap = {
      ...profiles,
      [id]: { id, name }
    };
    setProfiles(nextProfiles);
    setSelectedProfileId(id);
    setNewProfileName("");
  };

  const handleCreateClass = (e: FormEvent) => {
    e.preventDefault();
    const raw = newClassName.trim();
    if (!raw) return;

    const name = raw;
    if (classRegistry[name]) {
      // Just select it if it already exists
      setSelectedClassName(name);
      setNewClassName("");
      return;
    }

    const nextRegistry: ClassRegistry = {
      ...classRegistry,
      [name]: {
        id: name,
        name,
        profileId: selectedProfileId ?? undefined
      }
    };

    setClassRegistry(nextRegistry);
    setSelectedClassName(name);
    setNewClassName("");
  };

  return (
    <div className="flex flex-col gap-2 border border-gray-300 rounded-lg p-2 bg-white">
      <div className="flex flex-wrap items-center gap-3">
        {/* Profiles */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600">
            Profile
          </span>
          <select
            className="border border-gray-300 rounded px-1 py-0.5 text-xs"
            value={selectedProfileId ?? ""}
            onChange={(e) =>
              handleSelectProfile(e.target.value || "")
            }
          >
            {orderedProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <form
            onSubmit={handleCreateProfile}
            className="flex items-center gap-1"
          >
            <input
              className="border border-gray-300 rounded px-1 py-0.5 text-xs"
              placeholder="New profile"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
            />
            <button
              type="submit"
              className="px-2 py-0.5 rounded text-xs border border-gray-400"
            >
              +
            </button>
          </form>
        </div>

        {/* Add class */}
        <form
          onSubmit={handleCreateClass}
          className="flex items-center gap-1"
        >
          <span className="text-xs font-semibold text-gray-600">
            Class
          </span>
          <input
            className="border border-gray-300 rounded px-1 py-0.5 text-xs"
            placeholder="New class"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
          />
          <button
            type="submit"
            className="px-2 py-0.5 rounded text-xs border border-gray-400"
          >
            +
          </button>
        </form>
      </div>

      {/* Class list with counts */}
      <div className="flex flex-wrap gap-1">
        {classesForProfile.map((cls) => {
          const isActive = cls.name === selectedClassName;
          const count = classCounts[cls.name] ?? 0;
          return (
            <button
              key={cls.id}
              type="button"
              onClick={() => setSelectedClassName(cls.name)}
              className={`px-2 py-0.5 rounded-full text-xs border ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-gray-50 text-gray-800 border-gray-300"
              }`}
            >
              {cls.name}
              {count > 0 && (
                <span className="ml-1 text-[10px] opacity-80">
                  ({count})
                </span>
              )}
            </button>
          );
        })}
        {classesForProfile.length === 0 && (
          <span className="text-xs text-gray-500 italic">
            No classes yet – add one above.
          </span>
        )}
      </div>
    </div>
  );
};

type InstancePanelProps = {
  selectedClassName: string | null;
  classCounts: ClassCounts;
};

export const InstancePanel: React.FC<InstancePanelProps> = ({
  selectedClassName,
  classCounts
}) => {
  const totalForSelected =
    selectedClassName && classCounts[selectedClassName]
      ? classCounts[selectedClassName]
      : 0;

  const totalAll = Object.values(classCounts).reduce(
    (acc, n) => acc + n,
    0
  );

  if (!selectedClassName && totalAll === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-2 text-xs text-gray-500">
        No instances counted yet. As you annotate and save frames, the
        cross-frame counter will populate.
      </div>
    );
  }

  return (
    <div className="border border-gray-300 rounded-lg p-2 bg-gray-50 text-xs text-gray-700 flex justify-between">
      <div>
        {selectedClassName ? (
          <>
            <div className="font-semibold">
              {selectedClassName}:{" "}
              <span className="font-normal">
                {totalForSelected} instance
                {totalForSelected === 1 ? "" : "s"}
              </span>
            </div>
          </>
        ) : (
          <div className="font-semibold">
            No class selected – pick one above to see its count.
          </div>
        )}
      </div>
      <div className="text-right">
        <div>
          Total instances (all classes):{" "}
          <span className="font-semibold">{totalAll}</span>
        </div>
      </div>
    </div>
  );
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

  // UFO profiles / classes / counts state (lives on the left toolbar)
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [classRegistry, setClassRegistry] = useState<ClassRegistry>({});
  const [selectedClassName, setSelectedClassName] = useState<string | null>(
    null
  );
  const [classCounts, setClassCounts] = useState<ClassCounts>({});

  // Load profiles, classes, last class, and start cross-frame scan for UFO
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const loadedProfiles = loadProfiles();
    const { profiles: withDefault, defaultId } =
      ensureDefaultProfile(loadedProfiles);
    setProfiles(withDefault);
    setSelectedProfileId(defaultId);
    (window as any).ufoSelectedProfileId = defaultId;

    const registry = loadClassRegistry();
    setClassRegistry(registry);

    const last = loadLastClassName();
    if (last) {
      setSelectedClassName(last);
      (window as any).ufoSelectedClassName = last;
    }

    const cancel = scanCrossFrameCountsChunked({
      onUpdate: (counts) => {
        setClassCounts(counts);
      },
      chunkSize: 24
    });

    return () => {
      cancel();
    };
  }, [isUfo]);

  // Mirror selection to window so FrameView / AnnoBridge can read it
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;
    (window as any).ufoSelectedProfileId = selectedProfileId;
  }, [isUfo, selectedProfileId]);

  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;
    (window as any).ufoSelectedClassName = selectedClassName;
  }, [isUfo, selectedClassName]);

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

        {/* UFO profiles / classes / instance counts on the left toolbar */}
        {isUfo && (
          <div className="pl-4 pr-4 pb-4">
            <ClassPanel
              profiles={profiles}
              setProfiles={(next) => {
                setProfiles(next);
                saveProfiles(next);
              }}
              selectedProfileId={selectedProfileId}
              setSelectedProfileId={setSelectedProfileId}
              classRegistry={classRegistry}
              setClassRegistry={(next) => {
                setClassRegistry(next);
                saveClassRegistry(next);
              }}
              selectedClassName={selectedClassName}
              setSelectedClassName={(name) => {
                setSelectedClassName(name);
                saveLastClassName(name ?? "");
              }}
              classCounts={classCounts}
            />
            <div className="mt-2">
              <InstancePanel
                selectedClassName={selectedClassName}
                classCounts={classCounts}
              />
            </div>
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
