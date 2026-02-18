"use client";
import React, { useEffect, useMemo, useState } from "react";
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
  ComboBox,
  Item,
  Key,
  ButtonGroup,
  Button,
  ToastQueue,
  SearchField,
  Heading,
  InlineAlert,
} from "@adobe/react-spectrum";
import type { ImageAnnotation } from "@annotorious/react";
import {
  Annotation,
  MultiVariateTimeSeriesDataSchema,
  PlotProps,
  Project,
  Sample,
  SpectrogramData,
  SpectrogramDataSchema,
  SpectrogramViewParamsSchema,
  TaskType,
  ViewParams,
} from "@/types";

import { useNavigate } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";

import { BACKEND_API_URL, getAnnotationsForSample } from "@/app/core";
import { useSample } from "@/app/contexts/SampleContext";

import { PeakDetectionTool } from "@/app/components/annotators/peaks";
import { DataRangeSlider } from "@/app/components/tools/dataRangeSlider";
import { ModelPredictTool } from "@/app/components/tools/modelPredictSample";
import { ShotLabels } from "../annotators/labels";
import { OutlierDetectionTool } from "../annotators/outliers";
import { ChangePointDetectionTool } from "../annotators/changepoints";
import { JumpDetectionTool } from "../annotators/jump";
import { ExportTool } from "./export";
import { ImportButton } from "./import";
import { NavigationBar } from "./nav";
import SpectrogramThresholdTool from "../annotators/thresholding";

import type { ClassRegistry } from "@/app/frames/components/lib";
import {
  LABEL_MAP,
  w3cToCocoFrames,
  cocoFramesToVideoBBoxes,
  loadClassRegistry,
  loadLastClassName,
  saveLastClassName,
  FIXED_CLASS_REG,
  canonicalizeTrackId,
  uniqueReadableId,
  scanInstanceCountsChunked,
} from "@/app/frames/components/lib";
import {
  ClassPanel as VideoClassPanel,
  InstancePanel as VideoInstancePanel,
} from "@/app/frames/components/ui";
import { setVideoWorkingDirty } from "@/app/frames/components/adapters";

// ------------------------------
// Helpers: backend save + sample navigation
// ------------------------------

async function saveAnnotationsValidated(
  project_id: string,
  sample_id: string,
  annotations: Annotation[],
) {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;

  const validatedAnnotations: Annotation[] = annotations.map(
    (annotation: Annotation) => ({
      ...annotation,
      validated: true,
    }),
  );

  const response = await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validatedAnnotations),
  });
  return response;
}

// Video save writes the already-formed payload expected by the frame/video backend (COCO video bboxes).
async function saveVideoAnnotations(
  project_id: string,
  sample_id: string,
  annotations: Annotation[],
) {
  const ANNOTATIONS_URL = `${BACKEND_API_URL}/projects/${project_id}/samples/${sample_id}/annotations`;
  const response = await fetch(ANNOTATIONS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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

// ------------------------------
// Standard TS/Spectrogram controls
// ------------------------------

type SaveInfo = {
  project_id: string;
  sample_id: string;
  annotations: Annotation[];
};

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
          await saveAnnotationsValidated(project_id, sample_id, annotations);
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

type VideoShotSearchProps = {
  project_id?: string;
  sample_id?: string;
  navigate: NavigateFunction;
  // Collect all per-frame W3C annotations from localStorage and convert to backend payload.
  collectVideoPayloadForBackend: () => Promise<Annotation[]>;
};

// Video-only shot jump: save current local frame session before navigating to the requested shot.
function VideoShotSearch({
  project_id,
  sample_id,
  navigate,
  collectVideoPayloadForBackend,
}: VideoShotSearchProps) {
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [shotQuery, setShotQuery] = useState<string>("");

  const onSearchSubmit = async (rawValue: string) => {
    const newValue = rawValue.trim();

    if (newValue === "") {
      setErrorMessage("");
      setShotQuery("");
      return;
    }

    if (!/^[0-9]+$/.test(newValue)) {
      setErrorMessage("Please enter a number.");
      return;
    }

    if (!project_id || !sample_id) {
      ToastQueue.negative(
        "Cannot jump to shot: missing project or sample id.",
        { timeout: 5000 },
      );
      return;
    }

    try {
      const nextSample = await getShotSample(project_id, newValue);
      if (nextSample !== null) {
        const payload = await collectVideoPayloadForBackend();
        await saveVideoAnnotations(project_id, sample_id, payload);

        // Clear the "local session has diverged from backend" marker after a successful save.
        setVideoWorkingDirty(project_id, sample_id, false);

        const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${nextSample._id}`;
        navigate(NEXT_SAMPLE_URL);

        setShotQuery("");
        setErrorMessage("");
      } else {
        setErrorMessage("Shot not found!");
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setErrorMessage("Failed to fetch shot.");
    }
  };

  return (
    <SearchField
      label="Jump to Shot"
      value={shotQuery}
      onChange={(v) => {
        setShotQuery(v);
        if (errorMessage) setErrorMessage("");
      }}
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

// ------------------------------
// Video toolbar types + window contract
// ------------------------------

// Toolbar-side instance profiles used by FrameView via window.ufoInstanceProfiles.
// FrameView expects: { id, class_name, class_id, track_id }.
type VideoInstanceProfile = {
  id: string; // `${class_name}:${track_id}`
  class_name: string;
  class_id: number;
  track_id: string; // canonicalized slug
};

declare global {
  interface Window {
    // Shared state/events between the left VideoToolbar and the FrameView/AnnoBridge code.
    ufoInstanceProfiles?: VideoInstanceProfile[];
    ufoSelectedProfileId?: string | null;
    ufoSelectedClassName?: string | null;
    ufoSelectedTrackId?: string | null;
    ufoSelectionSource?: "auto" | "explicit" | null;
    ufoNotifySelectionChanged?: () => void;

    // FrameView exposes these helpers so the toolbar can trigger save/clear actions.
    ufoCollectForSave?: () => Promise<unknown>;
    ufoClearCurrent?: () => Promise<void>;
    ufoClearAllFrames?: () => Promise<void>;
  }
}

// Stable key shared between the VideoInstancePanel UI and FrameView events.
const instanceKey = (inst: VideoInstanceProfile) =>
  `${inst.class_name.toLowerCase()}:${inst.track_id}`;

type VideoWireProfile = {
  class_name: string;
  class_id: number;
  track_id: string;
};

// Event payload from FrameView -> toolbar: keeps profiles/selection/badges in sync.
type VideoStateDetail = {
  profiles?: VideoWireProfile[];
  selectedKey?: string;
  selectedClassName?: string | null;
  lastClassName?: string;
  classRegistry?: Record<string, number>;
  profileCounts?: Record<string, number>;
};

// ------------------------------
// Main ToolBar (Context-driven)
// ------------------------------

export default function ToolBar() {
  const {
    project,
    sample,
    data,
    annotations,
    setAnnotations,
    viewParams,
    setViewParams,
    plotProps,
    setPlotProps,
    isValidated,
  } = useSample();

  if (!project || !sample) {
    console.warn("Project or sample not found in ToolBar");
    return null;
  }

  // Video projects use the dedicated left-side toolbar which wires into FrameView via window.ufo*.
  if (project.task === TaskType.Video) {
    return (
      <VideoToolbar
        project={project}
        sample={sample}
        annotations={annotations}
      />
    );
  }

  const project_id = project._id;
  const sample_id = sample._id;

  if (!project_id || !sample_id) {
    console.warn("Invalid project_id or sample_id in ToolBar");
    return null;
  }

  const tools: { name: string; component: React.ReactNode }[] = [];

  if (data && project.task == TaskType.TimeSeries) {
    const result = MultiVariateTimeSeriesDataSchema.safeParse(data);

    if (!result.success) {
      console.warn("Time series data is not available");
      return null;
    }

    const tsData = result.data;

    const labels = ["Valid Shot", "Invalid Shot"];
    tools.push({
      name: "Shot Labels",
      component: <ShotLabels labels={labels}></ShotLabels>,
    });

    tools.push({
      name: "Peak Detection",
      component: (
        <PeakDetectionTool
          project_id={project_id}
          sample_id={sample_id}
          data={tsData}
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
        ></JumpDetectionTool>
      ),
    });

    tools.push({
      name: "Model Prediction",
      component: (
        <ModelPredictTool
          project_id={project_id}
          sample_id={sample_id}
        ></ModelPredictTool>
      ),
    });
  } else if (data && project.task == TaskType.Spectrogram) {
    const resultSpec = SpectrogramDataSchema.safeParse(data);
    if (!resultSpec.success) {
      console.warn("MHD spectrogram data is not available");
      return null;
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
        />
      ),
    });
  }

  const refreshAnnotations = async () => {
    const dbAnnotations = await getAnnotationsForSample(project_id, sample_id);
    setAnnotations(() => dbAnnotations);
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
          {isValidated !== null && (
            <Flex justifyContent="center" width="100%" marginTop="size-200">
              <InlineAlert
                variant={isValidated ? "positive" : "notice"}
                UNSAFE_style={{
                  paddingTop: "5px",
                  paddingBottom: "5px",
                  paddingLeft: "10px",
                  paddingRight: "10px",
                }}
              >
                <Heading>
                  {isValidated
                    ? "Annotations Validated"
                    : "Annotations Not Validated"}
                </Heading>
              </InlineAlert>
            </Flex>
          )}
          <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            gap="size-100"
          >
            <Header height="size-300" marginBottom="size-100">
              <span style={{ fontSize: "1.2rem" }}>Controls</span>
            </Header>
            <NavigationBar project_id={project_id} sample_id={sample_id} />
            <Accordion allowsMultipleExpanded={true} width="100%">
              <Disclosure>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Export Annotations</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <ExportTool project={project} sample={sample} />
                </DisclosurePanel>
              </Disclosure>
              <Disclosure>
                <DisclosureTitle>
                  <span style={{ fontSize: "0.8rem" }}>Import Annotations</span>
                </DisclosureTitle>
                <DisclosurePanel>
                  <ImportButton
                    project={project}
                    sample={sample}
                    refreshAnnotations={refreshAnnotations}
                  />
                </DisclosurePanel>
              </Disclosure>
            </Accordion>
          </Flex>
          {tools.length > 0 && (
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

// ------------------------------
// VideoToolbar: used only when project.task === TaskType.Video
// ------------------------------

// Left-side toolbar for video/frame annotation.
// Owns the instance list + selection; FrameView consumes selection from window.ufo*.
function VideoToolbar({
  project,
  sample,
  annotations,
}: {
  project: Project;
  sample: Sample;
  annotations: Annotation[];
}) {
  const navigate = useNavigate();

  const project_id = project._id;
  const sample_id = sample._id;

  // Class registry maps a display label to a stable numeric class_id used in exports/saves.
  const [classRegistry, setClassRegistry] = useState<ClassRegistry>({});
  const [selectedClassName, setSelectedClassName] = useState<string | null>(
    null,
  );

  // Instance profiles represent (class + track_id) pairs that annotations attach to.
  const [instanceProfiles, setInstanceProfiles] = useState<
    VideoInstanceProfile[]
  >([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );

  // Badge counts show how many boxes exist for each instance across all frames.
  const [instanceCounts, setInstanceCounts] = useState<Record<string, number>>(
    {},
  );

  // Subscribe to FrameView state broadcasts (profiles, selection, registry, counts).
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onState = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      const d = (
        detail && typeof detail === "object" ? detail : {}
      ) as VideoStateDetail;

      if (Array.isArray(d.profiles)) {
        const next: VideoInstanceProfile[] = d.profiles.map((p) => ({
          id: `${p.class_name}:${p.track_id}`,
          class_name: p.class_name,
          class_id: p.class_id,
          track_id: p.track_id,
        }));
        setInstanceProfiles(next);

        // FrameView reports selection as "<class>:<track>" (lowercased); map it back to our internal id.
        if ("selectedKey" in d) {
          if (typeof d.selectedKey === "string") {
            const inst = next.find((p) => instanceKey(p) === d.selectedKey);
            setSelectedInstanceId(inst ? inst.id : null);
          } else if (d.selectedKey == null) {
            setSelectedInstanceId(null);
          }
        }
      }

      setSelectedClassName(d.selectedClassName ?? null);

      // Persist last-selected class so new sessions can default to it.
      if ("lastClassName" in d && d.lastClassName) {
        saveLastClassName(d.lastClassName);
      }

      // Normalize registry keys to lowercase for consistent lookup across UI and storage.
      if (d.classRegistry) {
        const reg: ClassRegistry = {};
        Object.entries(d.classRegistry).forEach(([name, idVal]) => {
          reg[name.toLowerCase()] = { id: String(idVal), name };
        });
        setClassRegistry(reg);
      }

      // Counts are computed by a localStorage scan (FrameView/lib) and pushed up as an event payload.
      if (d.profileCounts) {
        setInstanceCounts(d.profileCounts);
      }
    };

    window.addEventListener("ufo:state", onState);
    return () => window.removeEventListener("ufo:state", onState);
  }, []);

  // Initial load of registry + last-used class for convenience on page refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const registry = loadClassRegistry();
    setClassRegistry(registry);

    const last = loadLastClassName();
    if (last) setSelectedClassName(last);
  }, []);

  // Periodically scan localStorage to keep per-instance badge counts updated.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const keyPrefix = "anno::w3c::" + `app://p/${project_id}/s/${sample_id}/`;

    let stopScan: (() => void) | null = null;

    const startScan = () => {
      if (stopScan) stopScan();
      stopScan = scanInstanceCountsChunked({
        keyPrefix,
        onUpdate: setInstanceCounts,
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
  }, [project_id, sample_id]);

  // Mirror toolbar state into window.ufo* so FrameView can read current profiles + selection.
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.ufoInstanceProfiles = instanceProfiles;
    window.ufoSelectedProfileId = selectedInstanceId ?? null;
    window.ufoSelectedClassName = selectedClassName ?? null;

    const sel =
      instanceProfiles.find((p) => p.id === selectedInstanceId) || null;
    window.ufoSelectedTrackId = sel?.track_id ?? null;

    // Ask FrameView to re-check selection and enable/disable drawing accordingly.
    window.ufoNotifySelectionChanged?.();
  }, [instanceProfiles, selectedInstanceId, selectedClassName]);

  // Request FrameView to delete a single instance (across all frames).
  const onRequestBulkDelete = (profile: {
    class_name?: string;
    track_id?: string;
  }) => {
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
  };

  // Request FrameView to delete all instances/annotations for this sample.
  const onRequestDeleteAllInstances = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ufo:deleteAllInstances"));
  };

  // Clear only the current frame overlay (implementation lives in FrameView).
  const videoClearCurrent = async () => {
    await window.ufoClearCurrent?.();
  };

  // Collect W3C per-frame annotations from FrameView, convert to COCO frames, then to backend "video bboxes".
  const collectVideoPayloadForBackend = async (): Promise<Annotation[]> => {
    if (typeof window === "undefined") return annotations;

    const collect = window.ufoCollectForSave;
    if (typeof collect !== "function") return annotations;

    const raw = await collect();
    const w3cList: ImageAnnotation[] = Array.isArray(raw)
      ? (raw as ImageAnnotation[])
      : [];

    const cocoFrames = w3cToCocoFrames(w3cList, true);
    const videoBBoxes = cocoFramesToVideoBBoxes(cocoFrames);

    return videoBBoxes as Annotation[];
  };

  const handleVideoSave = async () => {
    if (!project_id || !sample_id) {
      ToastQueue.negative("Cannot save: missing project or sample id.", {
        timeout: 5000,
      });
      return;
    }

    try {
      const payload = await collectVideoPayloadForBackend();

      const response = await saveVideoAnnotations(
        project_id,
        sample_id,
        payload,
      );
      if (!response.ok) {
        throw new Error(`Failed to save annotations: ${response.statusText}`);
      }

      // Mark local session as synced after a successful save.
      setVideoWorkingDirty(project_id, sample_id, false);

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

  const handleVideoNextSample = async () => {
    if (!project_id || !sample_id) {
      ToastQueue.negative(
        "Cannot load next sample: missing project or sample id.",
        { timeout: 5000 },
      );
      return;
    }

    try {
      // Persist current session before navigating away.
      const payload = await collectVideoPayloadForBackend();
      await saveVideoAnnotations(project_id, sample_id, payload);

      setVideoWorkingDirty(project_id, sample_id, false);

      const next = await getNextSample(project_id);
      const NEXT_SAMPLE_URL = `/ui/projects/${project_id}/samples/${next._id}`;
      navigate(NEXT_SAMPLE_URL);
    } catch (err) {
      console.error("Failed to fetch next sample:", err);
      ToastQueue.negative("Failed to load next sample.", { timeout: 5000 });
    }
  };

  // Convert internal selectedInstanceId into the "<class>:<track>" key used by the InstancePanel.
  const selectedInstanceKey = useMemo(() => {
    const inst = instanceProfiles.find((p) => p.id === selectedInstanceId);
    return inst ? instanceKey(inst) : null;
  }, [instanceProfiles, selectedInstanceId]);

  return (
    <Provider theme={defaultTheme} height="100vh">
      <div className="h-screen text-center w-72 shrink-0 overflow-y-auto">
        <div className="pl-4 pr-4 pt-4">
          <ButtonGroup>
            <Button variant="primary" onPress={handleVideoSave}>
              Save
            </Button>
            <Button variant="primary" onPress={handleVideoNextSample}>
              Next
            </Button>
          </ButtonGroup>
        </div>

        <div className="pl-4 pr-4 pb-4 pt-2">
          <VideoShotSearch
            project_id={project_id}
            sample_id={sample_id}
            navigate={navigate}
            collectVideoPayloadForBackend={collectVideoPayloadForBackend}
          />
        </div>

        <div className="pl-4 pr-4 pb-4">
          <div className="max-w-[16rem] mx-auto mb-4">
            <div className="mb-2">
              <Flex gap="size-100" alignItems="center" wrap>
                <Button
                  variant="secondary"
                  style="outline"
                  isDisabled
                  UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                >
                  Rectangle
                </Button>
              </Flex>
            </div>

            <hr className="m-4 h-px opacity-30 border-gray-200" />

            <div className="mb-1">
              <Flex
                gap="size-100"
                alignItems="center"
                justifyContent="center"
                wrap
              >
                <Button
                  variant="primary"
                  style="outline"
                  UNSAFE_className="!px-2.5 !py-1.5 text-xs"
                  onPress={async () => {
                    try {
                      await videoClearCurrent();
                    } catch {
                      ToastQueue.negative("Failed to clear current frame.", {
                        timeout: 5000,
                      });
                    }
                  }}
                >
                  Clear Current Frame
                </Button>
              </Flex>
            </div>

            <hr className="m-4 h-px opacity-30 border-gray-200" />
          </div>

          <VideoClassPanel
            items={LABEL_MAP.categories}
            selectedClassName={selectedClassName}
            setSelectedClassName={(name) => {
              if (!name) return;

              // Selecting a class "arms" drawing in FrameView (annotations will be tagged with this class).
              setSelectedClassName(name);
              saveLastClassName(name);

              // Switching class drops any active instance selection.
              setSelectedInstanceId(null);

              if (typeof window !== "undefined") {
                window.ufoSelectionSource = null;
              }
            }}
          />

          <VideoInstancePanel
            profiles={instanceProfiles.map((inst) => ({
              key: instanceKey(inst),
              class_id: inst.class_id,
              class_name: inst.class_name,
              track_id: inst.track_id,
            }))}
            selectedKey={selectedInstanceKey}
            onSelect={(key) => {
              const inst = instanceProfiles.find((p) => instanceKey(p) === key);
              if (!inst) return;

              // Explicit instance selection persists across frame navigation.
              setSelectedInstanceId(inst.id);
              setSelectedClassName(inst.class_name);
              saveLastClassName(inst.class_name);

              if (typeof window !== "undefined") {
                window.ufoSelectedProfileId = inst.id;
                window.ufoSelectedClassName = inst.class_name;
                window.ufoSelectedTrackId = inst.track_id;
                window.ufoSelectionSource = "explicit";
                window.ufoNotifySelectionChanged?.();
              }
            }}
            onCreateProfile={(className: string, trackId: string) => {
              // Instance profiles define (class + track_id) targets that annotations attach to.
              const cls = className;

              const keyLower = cls.toLowerCase();
              const fromRegistryLower = classRegistry[keyLower];
              const fromRegistryExact = classRegistry[cls];

              const regIdStr =
                fromRegistryLower?.id ?? fromRegistryExact?.id ?? undefined;
              const regId =
                regIdStr !== undefined ? Number(regIdStr) : undefined;

              const fixedId = FIXED_CLASS_REG[keyLower];

              const labelMapId = LABEL_MAP.categories.find(
                (c) => c.name === cls,
              )?.id;

              const class_id =
                (typeof regId === "number" && !Number.isNaN(regId)
                  ? regId
                  : undefined) ??
                (typeof fixedId === "number" ? fixedId : undefined) ??
                (typeof labelMapId === "number" ? labelMapId : undefined) ??
                1;

              const existingTrackIds = instanceProfiles.map((p) => p.track_id);

              // Track ids are canonicalized to keep keys stable across UI, storage, and events.
              const canonicalTrackId =
                canonicalizeTrackId(trackId) ||
                canonicalizeTrackId(uniqueReadableId(existingTrackIds));

              const id = `${cls}:${canonicalTrackId}`;

              const nextInstances: VideoInstanceProfile[] = [
                ...instanceProfiles,
                { id, class_name: cls, class_id, track_id: canonicalTrackId },
              ];

              setInstanceProfiles(nextInstances);
              setSelectedInstanceId(id);
              setSelectedClassName(cls);
              saveLastClassName(cls);

              if (typeof window !== "undefined") {
                // Keep FrameView in sync immediately (so drawing is enabled for the new instance).
                window.ufoInstanceProfiles = nextInstances;
                window.ufoSelectedProfileId = id;
                window.ufoSelectedClassName = cls;
                window.ufoSelectedTrackId = canonicalTrackId;
                window.ufoNotifySelectionChanged?.();
              }
            }}
            onRequestBulkDelete={onRequestBulkDelete}
            onRequestDeleteAllInstances={onRequestDeleteAllInstances}
            profileCounts={instanceCounts}
            showCreator={false}
          />
        </div>
      </div>
    </Provider>
  );
}
