"use client";

import { useEffect, useMemo, useState } from "react";
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

// UFO converters + label map (used for class_id + correct save payload)
import {
  LABEL_MAP,
  w3cToCocoFrames,
  cocoFramesToVideoBBoxes,
} from "@/app/frames/components/lib";

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
        `${displayAmplitudeValues(val.start)} - ${displayAmplitudeValues(
          val.end,
        )}`
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

/** ---------------------- UFO support (layout + minimal state) ---------------------- */

/**
 * IMPORTANT: this matches what FrameView expects via window.ufoInstanceProfiles:
 * { id, class_name, class_id, track_id } (displayName is UI-only).
 */
type InstanceProfile = {
  id: string; // `${class_name}:${track_id}`
  class_name: string;
  class_id: number;
  track_id: string;
  displayName: string; // UI only
};

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeLocalStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Backup-ish behavior: keep per-class instance seed in localStorage.
 * Key matches the naming style used elsewhere in the project ("anno::instance-seed::*").
 */
function getAndBumpInstanceSeed(className: string): number {
  const seedKey = `anno::instance-seed::${className}`;
  const raw = safeLocalStorageGet(seedKey);
  const current = raw ? Number(raw) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;
  safeLocalStorageSet(seedKey, String(next));
  return next;
}

type ClassPanelProps = {
  selectedClassName: string | null;
  setSelectedClassName: (name: string | null) => void;
  classOptions: { id: string; name: string }[];
};

function ClassPanel({
  selectedClassName,
  setSelectedClassName,
  classOptions,
}: ClassPanelProps) {
  const onSelectionChange = (key: Key | null) => {
    if (!key) {
      setSelectedClassName(null);
      return;
    }
    const k = key.toString();
    const found = classOptions.find((c) => c.id === k);
    setSelectedClassName(found ? found.name : k);
  };

  return (
    <ComboBox
      label="Class"
      defaultItems={classOptions}
      inputValue={selectedClassName ?? ""}
      onSelectionChange={onSelectionChange}
      onInputChange={(val) => {
        // allow typing a class name directly
        setSelectedClassName(val && val.trim().length ? val : null);
      }}
      allowsCustomValue
    >
      {(item) => <Item key={item.id}>{item.name}</Item>}
    </ComboBox>
  );
}

type InstancePanelProps = {
  profiles: InstanceProfile[];
  selectedKey: string | null; // holds profile.id
  onSelect: (key: string) => void;
  onCreateProfile: (className: string, label: string) => void;
  onRequestBulkDelete: (keys: string[]) => void;
  onRequestDeleteAllInstances: () => void;
  profileCounts: Record<string, number>;
  showCreator: boolean;
};

function InstancePanel({
  profiles,
  selectedKey,
  onSelect,
  onRequestBulkDelete,
  onRequestDeleteAllInstances,
  profileCounts,
  showCreator,
}: InstancePanelProps) {
  // showCreator exists to match your backup API; backup wants it off.
  // We do not render any creator UI when showCreator === false.
  return (
    <View>
      <Flex direction="column" gap="size-100">
        <Flex direction="row" justifyContent="space-between" alignItems="center">
          <Header height="size-300" marginBottom="size-100">
            <span style={{ fontSize: "1rem" }}>Instances</span>
          </Header>

          <Button
            isQuiet
            variant="negative"
            UNSAFE_className="!px-2.5 !py-1.5 text-xs"
            onPress={() => onRequestDeleteAllInstances()}
          >
            Delete All
          </Button>
        </Flex>

        {showCreator ? (
          <View UNSAFE_className="text-xs opacity-70">
            {/* Intentionally blank in this project’s backup mode */}
          </View>
        ) : null}

        <Flex direction="column" gap="size-50">
          {profiles.length === 0 ? (
            <View UNSAFE_className="text-sm opacity-70">
              No instances yet. Pick a class to create one.
            </View>
          ) : (
            profiles.map((p) => {
              const isSelected = p.id === selectedKey;
              const count = profileCounts[p.id] ?? 0;
              return (
                <Flex
                  key={p.id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Button
                    variant={isSelected ? "primary" : "secondary"}
                    isQuiet={!isSelected}
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                    onPress={() => onSelect(p.id)}
                  >
                    {p.displayName}
                    {Number.isFinite(count) ? ` (${count})` : ""}
                  </Button>

                  <Button
                    variant="negative"
                    isQuiet
                    UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                    onPress={() => onRequestBulkDelete([p.id])}
                  >
                    Delete
                  </Button>
                </Flex>
              );
            })
          )}
        </Flex>
      </Flex>
    </View>
  );
}

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

  /** UFO minimal state (MIRRORED to window.* for FrameView) */
  const [selectedClassName, setSelectedClassName] = useState<string | null>(
    null,
  );
  const [profiles, setProfiles] = useState<InstanceProfile[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const instancePanelProfiles = profiles;

  const classOptions = useMemo(() => {
    // Try to derive class list from project (supports multiple possible shapes).
    // If none exist, still allow custom class entry in ComboBox.
    const anyProject: any = project as any;

    const raw =
      anyProject?.classes ??
      anyProject?.class_names ??
      anyProject?.labels ??
      anyProject?.label_names ??
      [];

    if (Array.isArray(raw)) {
      // strings
      if (raw.every((x) => typeof x === "string")) {
        return (raw as string[]).map((name) => ({
          id: name,
          name: name,
        }));
      }
      // objects with name/id-ish
      return raw
        .map((x: any, idx: number) => {
          const name = x?.name ?? x?.label ?? x?.id ?? String(idx);
          const id = x?.id ?? x?.name ?? x?.label ?? String(idx);
          return { id: String(id), name: String(name) };
        })
        .filter((x: any) => x && x.id && x.name);
    }

    return [] as { id: string; name: string }[];
  }, [project]);

  const instanceCounts = useMemo(() => {
    // If your UFO annotator stores per-instance counts elsewhere, wire it in here.
    // For now, keep a stable shape.
    const counts: Record<string, number> = {};
    for (const p of profiles) counts[p.id] = counts[p.id] ?? 0;
    return counts;
  }, [profiles]);

  const saveLastClassNameForProject = (name: string) => {
    safeLocalStorageSet(`anno::ufo::last-class::${project_id}`, name);
  };

  useEffect(() => {
    if (!isUfo) return;
    const last = safeLocalStorageGet(`anno::ufo::last-class::${project_id}`);
    if (last && last.trim().length) {
      setSelectedClassName(last.trim());
    }
  }, [isUfo, project_id]);

  // ---- (1) Mirror toolbar state to window.* so FrameView can draw + normalize ----
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const w = window as any;

    w.ufoInstanceProfiles = profiles;
    w.ufoSelectedProfileId = selectedKey;
    w.ufoSelectedClassName = selectedClassName;

    w.ufoSelectedTrackId =
      profiles.find((p) => p.id === selectedKey)?.track_id ?? null;

    w.ufoNotifySelectionChanged?.();
  }, [isUfo, profiles, selectedKey, selectedClassName]);

  // Optional: seed initial toolbar state from any existing window globals
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const w = window as any;
    const list = Array.isArray(w.ufoInstanceProfiles)
      ? (w.ufoInstanceProfiles as any[])
      : [];

    if (list.length === 0) return;

    const nextProfiles: InstanceProfile[] = list
      .map((p: any) => {
        if (!p) return null;

        const class_name = String(p.class_name ?? "");
        const track_id = String(p.track_id ?? "");
        const class_id = Number(p.class_id ?? 1) || 1;

        if (!class_name || !track_id) return null;

        const id = String(p.id ?? `${class_name}:${track_id}`);
        const displayName = String(
          p.displayName ?? `${class_name} ${track_id}`,
        );

        return { id, class_name, class_id, track_id, displayName };
      })
      .filter(Boolean) as InstanceProfile[];

    if (nextProfiles.length > 0) {
      setProfiles(nextProfiles);
      const sel = String(w.ufoSelectedProfileId ?? "");
      setSelectedKey(sel || null);

      const selProfile = nextProfiles.find((p) => p.id === sel) || null;
      if (selProfile) setSelectedClassName(selProfile.class_name);
    }
  }, [isUfo]);

  // ---- (2) Listen to FrameView "ufo:state" so toolbar UI stays in sync ----
  useEffect(() => {
    if (!isUfo) return;
    if (typeof window === "undefined") return;

    const onState = (e: any) => {
      const d = e?.detail;
      if (!d) return;

      const nextProfiles: InstanceProfile[] = (d.profiles ?? []).map((p: any) => {
        const class_name = String(p.class_name ?? "");
        const track_id = String(p.track_id ?? "");
        const class_id = Number(p.class_id ?? 1) || 1;
        const id = `${class_name}:${track_id}`;
        return {
          id,
          class_name,
          class_id,
          track_id,
          displayName: `${class_name} ${track_id}`,
        };
      });

      setProfiles(nextProfiles);

      const sel = String(d.selectedKey ?? "");
      const [c0, t0] = sel.split(":");
      const match = nextProfiles.find(
        (p) => p.class_name.toLowerCase() === String(c0 || "").toLowerCase() && p.track_id === String(t0 || ""),
      );

      setSelectedKey(match?.id ?? null);
      setSelectedClassName(d.selectedClassName ?? null);
    };

    window.addEventListener("ufo:state", onState as any);
    return () => window.removeEventListener("ufo:state", onState as any);
  }, [isUfo]);

  const onSelectInstanceKey = (key: string) => {
    setSelectedKey(key);
    const p = profiles.find((x) => x.id === key) || null;
    if (p) {
      setSelectedClassName(p.class_name);
      saveLastClassNameForProject(p.class_name);
    }
  };

  const onCreateProfile = (className: string, _label: string) => {
    const cls = (className || "").trim();
    if (!cls) return;

    const class_id =
      (LABEL_MAP as any)?.categories?.find?.((c: any) => c?.name === cls)?.id ??
      1;

    const n = getAndBumpInstanceSeed(cls);
    const track_id = String(n); // ok for now
    const id = `${cls}:${track_id}`;
    const displayName = `${cls} ${track_id}`;

    setProfiles((prev) => {
      // avoid duplicates if called twice quickly
      if (prev.some((p) => p.id === id)) return prev;
      return [...prev, { id, class_name: cls, class_id, track_id, displayName }];
    });

    setSelectedKey(id);
    setSelectedClassName(cls);
    saveLastClassNameForProject(cls);
  };

  // ---- (3) Delete flows: delegate to FrameView via events ----
  const onRequestBulkDelete = (keys: string[]) => {
    if (typeof window === "undefined") return;

    for (const k of keys) {
      const p = profiles.find((x) => x.id === k);
      if (!p) continue;

      window.dispatchEvent(
        new CustomEvent("ufo:requestBulkDelete", {
          detail: { profile: { class_name: p.class_name, track_id: p.track_id } },
        }),
      );
    }
  };

  const onRequestDeleteAllInstances = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ufo:deleteAllInstances"));
  };

  // ---- (3) Clear flows: call FrameView window API (NOT local annotations) ----
  const ufoClearCurrent = async () => {
    await (window as any).ufoClearCurrent?.();
  };

  const ufoClearAllFrames = async () => {
    await (window as any).ufoClearAllFrames?.();
  };

  // ---- (4) UFO Save/Next/Jump: save from ufoCollectForSave(), not annotations[] ----
  const collectUfoPayloadForBackend = async (): Promise<Annotation[]> => {
    if (typeof window === "undefined") return annotations;

    const w = window as any;
    if (typeof w.ufoCollectForSave !== "function") {
      // fallback (should not happen once FrameView mounts)
      return annotations;
    }

    const w3c = await w.ufoCollectForSave();
    const toCocoFrames = (w3cToCocoFrames as any) ?? null;
    const toVideoBBoxes = (cocoFramesToVideoBBoxes as any) ?? null;

    if (typeof toCocoFrames !== "function" || typeof toVideoBBoxes !== "function") {
      // fallback
      return annotations;
    }

    // Pass extra context as optional params (safe even if ignored)
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
        // ---------------- UFO (backup layout restored) ----------------
        <div className="h-screen text-center w-72 shrink-0 overflow-y-auto">
          {/* Top: Save / Next (ONLY) */}
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

          {/* Jump to Shot */}
          <div className="pl-4 pr-4 pb-4 pt-2">
            <UfoShotSearch />
          </div>

          {/* Frame controls block: Rectangle + Clear buttons */}
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

            {/* Class picker (selecting a class creates/selects an instance like backup) */}
            <div className="mb-3">
              <ClassPanel
                selectedClassName={selectedClassName}
                classOptions={classOptions}
                setSelectedClassName={(name) => {
                  const next = (name || "").trim();
                  if (!next) {
                    setSelectedClassName(null);
                    return;
                  }
                  setSelectedClassName(next);
                  saveLastClassNameForProject(next);
                  // Backup behavior: picking a class immediately creates a new instance
                  onCreateProfile(next, "");
                }}
              />
            </div>

            {/* Instances list (NO "Add Profile" editor in backup) */}
            <InstancePanel
              profiles={instancePanelProfiles}
              selectedKey={selectedKey}
              onSelect={onSelectInstanceKey}
              onCreateProfile={onCreateProfile}
              onRequestBulkDelete={onRequestBulkDelete}
              onRequestDeleteAllInstances={onRequestDeleteAllInstances}
              profileCounts={instanceCounts}
              showCreator={false}
            />
          </div>
        </div>
      ) : (
        // ---------------- Non-UFO (existing UI preserved) ----------------
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
