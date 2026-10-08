"use client";
import { useSample } from "@/app/contexts/SampleContext";
import { getSignalNames, shallowEqual } from "@/app/utils";
import {
  Profile2DViewParams,
  SpectrogramDataSchema,
  STFTParams,
  STFTWindowSchema,
} from "@/types";
import {
  ComboBox,
  Flex,
  Item,
  NumberField,
  Picker,
  Switch,
} from "@adobe/react-spectrum";
import { useEffect, useMemo, useState } from "react";

// Matches the backend STFTParams defaults.
const DEFAULT_STFT_PARAMS: STFTParams = {
  nperseg: 256,
  noverlap: 128,
  window: "hann",
  nfft: null,
};

export function Profile2DViewParamsWidget() {
  const { sample, data, viewParams, setViewParams } = useSample();
  // Seed from any already-restored value in context instead of starting blank.
  const initialParams =
    viewParams.name === "profile_2d"
      ? (viewParams as Profile2DViewParams)
      : null;
  const [selectedSignal, setSelectedSignal] = useState<string | null>(
    initialParams?.signal_name ?? null,
  );
  const [logScale, setLogScale] = useState<boolean>(
    initialParams?.log_scale ?? false,
  );
  const [stft, setStft] = useState<STFTParams>(
    initialParams?.stft ?? DEFAULT_STFT_PARAMS,
  );

  const signalNames = useMemo(() => getSignalNames(sample), [sample]);
  const isSpectrogram = useMemo(
    () => SpectrogramDataSchema.safeParse(data).success,
    [data],
  );

  useEffect(() => {
    if (signalNames.length > 0 && !selectedSignal) {
      setSelectedSignal(signalNames[0]);
    }
  }, [signalNames, selectedSignal]);

  useEffect(() => {
    if (!selectedSignal) return;

    setViewParams((prevParams) => {
      const nextParams: Profile2DViewParams = {
        ...(prevParams as Profile2DViewParams),
        name: "profile_2d",
        signal_name: selectedSignal,
        log_scale: logScale,
        stft: stft,
      };

      // Only update if the params actually changed
      return shallowEqual(prevParams, nextParams) ? prevParams : nextParams;
    });
  }, [selectedSignal, logScale, stft, setViewParams]);

  const onWindowSizeChange = (nperseg: number) => {
    if (isNaN(nperseg) || nperseg < 2) return;
    // Keep overlap and FFT length valid against the new window size.
    setStft((prev) => ({
      ...prev,
      nperseg,
      noverlap: Math.min(prev.noverlap, nperseg - 1),
      nfft: prev.nfft != null && prev.nfft < nperseg ? nperseg : prev.nfft,
    }));
  };

  const onOverlapChange = (noverlap: number) => {
    if (isNaN(noverlap)) return;
    setStft((prev) => ({
      ...prev,
      noverlap: Math.min(Math.max(noverlap, 0), prev.nperseg - 1),
    }));
  };

  const onFftLengthChange = (nfft: number) => {
    setStft((prev) => ({
      ...prev,
      nfft: isNaN(nfft) ? null : Math.max(nfft, prev.nperseg),
    }));
  };

  const onWindowChange = (key: unknown) => {
    const result = STFTWindowSchema.safeParse(key);
    if (!result.success) return;
    setStft((prev) => ({ ...prev, window: result.data }));
  };

  return (
    <Flex direction="column" alignItems="start" gap="size-200" width="100%">
      <ComboBox
        label="Select Signal"
        width="100%"
        selectedKey={selectedSignal}
        onSelectionChange={(key) => setSelectedSignal(key as string)}
      >
        {signalNames.map((signal) => (
          <Item key={signal}>{signal}</Item>
        ))}
      </ComboBox>
      <Switch isSelected={logScale} onChange={setLogScale}>
        Log Scale
      </Switch>
      {isSpectrogram && (
        <>
          <NumberField
            label="Window size"
            width="100%"
            value={stft.nperseg}
            minValue={2}
            step={1}
            onChange={onWindowSizeChange}
          />
          <NumberField
            label="Overlap"
            width="100%"
            value={stft.noverlap}
            minValue={0}
            maxValue={stft.nperseg - 1}
            step={1}
            onChange={onOverlapChange}
          />
          <Picker
            label="Window"
            width="100%"
            selectedKey={stft.window}
            onSelectionChange={onWindowChange}
          >
            {STFTWindowSchema.options.map((window) => (
              <Item key={window}>{window}</Item>
            ))}
          </Picker>
          <NumberField
            label="FFT length"
            width="100%"
            description="Leave empty to use the window size."
            value={stft.nfft ?? NaN}
            minValue={stft.nperseg}
            step={1}
            onChange={onFftLengthChange}
          />
        </>
      )}
    </Flex>
  );
}
