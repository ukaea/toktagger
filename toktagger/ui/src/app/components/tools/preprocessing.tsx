"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  Button,
  ComboBox,
  Flex,
  Item,
  NumberField,
  Picker,
  Provider,
  Slider,
  Text,
  defaultTheme,
} from "@adobe/react-spectrum";
import {
  MultiVariateTimeSeriesDataSchema,
  PreprocessingConfig,
  PreprocessingStep,
} from "@/types";
import { useSample } from "@/app/contexts/SampleContext";

type StepType = "smoothing" | "background_subtraction" | "normalisation";
type SmoothingMethod = "gaussian" | "uniform";
type NormMethod = "zscore" | "minmax";

function stepSummary(step: PreprocessingStep): string {
  if (step.type === "smoothing") {
    return `Smoothing (${step.method}, σ=${step.sigma.toFixed(1)}) — ${step.signal_name}`;
  }
  if (step.type === "background_subtraction") {
    return `BG Subtraction (w=${step.window_size}) — ${step.signal_name}`;
  }
  return `Normalisation (${step.method}) — ${step.signal_name}`;
}

export function PreprocessingTool() {
  const {
    data,
    preprocessingConfig,
    setPreprocessingConfig,
    setDisplayPreprocessingConfig,
  } = useSample();

  const dataValues = useMemo(() => {
    const parsed = MultiVariateTimeSeriesDataSchema.safeParse(data);
    return parsed.data?.values ?? {};
  }, [data]);

  const signalOptions = useMemo(
    () => Object.keys(dataValues).map((name, id) => ({ id, name })),
    [dataValues],
  );

  // Draft step state
  const [stepType, setStepType] = useState<StepType>("smoothing");
  const [signalName, setSignalName] = useState<string>("");
  const [smoothingMethod, setSmoothingMethod] =
    useState<SmoothingMethod>("gaussian");
  const [sigma, setSigma] = useState<number>(1.0);
  const [windowSize, setWindowSize] = useState<number>(1000);
  const [normMethod, setNormMethod] = useState<NormMethod>("zscore");

  const buildDraftStep = useCallback((): PreprocessingStep | null => {
    if (!signalName || !(signalName in dataValues)) return null;
    if (stepType === "smoothing") {
      return {
        type: "smoothing",
        signal_name: signalName,
        method: smoothingMethod,
        sigma,
      };
    }
    if (stepType === "background_subtraction") {
      return {
        type: "background_subtraction",
        signal_name: signalName,
        window_size: windowSize,
      };
    }
    return {
      type: "normalisation",
      signal_name: signalName,
      method: normMethod,
    };
  }, [
    stepType,
    signalName,
    smoothingMethod,
    sigma,
    windowSize,
    normMethod,
    dataValues,
  ]);

  // Live preview: update display config whenever draft parameters change
  useEffect(() => {
    const draft = buildDraftStep();
    if (!draft) {
      setDisplayPreprocessingConfig(preprocessingConfig);
      return;
    }
    setDisplayPreprocessingConfig({
      steps: [...preprocessingConfig.steps, draft],
    });
  }, [
    stepType,
    signalName,
    smoothingMethod,
    sigma,
    windowSize,
    normMethod,
    preprocessingConfig,
    buildDraftStep,
    setDisplayPreprocessingConfig,
  ]);

  const addStep = useCallback(() => {
    const draft = buildDraftStep();
    if (!draft) return;
    const newConfig: PreprocessingConfig = {
      steps: [...preprocessingConfig.steps, draft],
    };
    setPreprocessingConfig(newConfig);
    setDisplayPreprocessingConfig(newConfig);
    // Reset draft params to defaults (keep signal selected for convenience)
    setSigma(1.0);
    setWindowSize(1000);
  }, [
    buildDraftStep,
    preprocessingConfig,
    setPreprocessingConfig,
    setDisplayPreprocessingConfig,
  ]);

  const removeStep = useCallback(
    (index: number) => {
      const newConfig: PreprocessingConfig = {
        steps: preprocessingConfig.steps.filter((_, i) => i !== index),
      };
      setPreprocessingConfig(newConfig);
      setDisplayPreprocessingConfig(newConfig);
    },
    [
      preprocessingConfig,
      setPreprocessingConfig,
      setDisplayPreprocessingConfig,
    ],
  );

  const clearAll = useCallback(() => {
    const empty: PreprocessingConfig = { steps: [] };
    setPreprocessingConfig(empty);
    setDisplayPreprocessingConfig(empty);
  }, [setPreprocessingConfig, setDisplayPreprocessingConfig]);

  return (
    <Provider theme={defaultTheme}>
      <div className="m-4">
        <Flex direction="column" gap="size-150">
          <Picker
            label="Step Type"
            selectedKey={stepType}
            onSelectionChange={(k) => setStepType(k as StepType)}
            width="100%"
          >
            <Item key="smoothing">Smoothing</Item>
            <Item key="background_subtraction">Background Subtraction</Item>
            <Item key="normalisation">Normalisation</Item>
          </Picker>

          <ComboBox
            label="Signal"
            defaultItems={signalOptions}
            onInputChange={setSignalName}
            width="100%"
          >
            {(x) => <Item key={x.name}>{x.name}</Item>}
          </ComboBox>

          {stepType === "smoothing" && (
            <>
              <Picker
                label="Method"
                selectedKey={smoothingMethod}
                onSelectionChange={(k) =>
                  setSmoothingMethod(k as SmoothingMethod)
                }
                width="100%"
              >
                <Item key="gaussian">Gaussian</Item>
                <Item key="uniform">Uniform</Item>
              </Picker>
              <Slider
                label={`Sigma: ${sigma.toFixed(1)}`}
                minValue={0.1}
                maxValue={50}
                step={0.1}
                value={sigma}
                onChange={setSigma}
                width="100%"
              />
            </>
          )}

          {stepType === "background_subtraction" && (
            <NumberField
              label="Window Size (samples)"
              value={windowSize}
              onChange={setWindowSize}
              minValue={1}
              width="100%"
            />
          )}

          {stepType === "normalisation" && (
            <Picker
              label="Method"
              selectedKey={normMethod}
              onSelectionChange={(k) => setNormMethod(k as NormMethod)}
              width="100%"
            >
              <Item key="zscore">Z-Score</Item>
              <Item key="minmax">Min-Max</Item>
            </Picker>
          )}

          <Button
            variant="primary"
            onPress={addStep}
            isDisabled={!signalName || !(signalName in dataValues)}
            width="100%"
          >
            Add Step
          </Button>

          {preprocessingConfig.steps.length > 0 && (
            <Flex direction="column" gap="size-100" marginTop="size-100">
              <Text UNSAFE_style={{ fontSize: "0.8rem", fontWeight: "bold" }}>
                Applied Steps
              </Text>
              {preprocessingConfig.steps.map((step, i) => (
                <Flex
                  key={i}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  gap="size-50"
                >
                  <Text UNSAFE_style={{ fontSize: "0.7rem", flex: 1 }}>
                    {i + 1}. {stepSummary(step)}
                  </Text>
                  <ActionButton isQuiet onPress={() => removeStep(i)}>
                    ✕
                  </ActionButton>
                </Flex>
              ))}
              <Button
                variant="secondary"
                onPress={clearAll}
                width="100%"
                marginTop="size-50"
              >
                Clear All
              </Button>
            </Flex>
          )}
        </Flex>
      </div>
    </Provider>
  );
}
