import { useSample } from "@/app/contexts/SampleContext";
import { getSignalNames, shallowEqual } from "@/app/utils";
import { SpectrogramViewParams } from "@/types";
import { ComboBox, Flex, Item, NumberField } from "@adobe/react-spectrum";
import { useEffect, useState } from "react";

export function SpectrogramViewParamsWidget() {
  const { sample, setViewParams } = useSample();
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [signalNames, setSignalNames] = useState<string[]>([]);
  const [fftValue, setFftValue] = useState<number>(256);

  useEffect(() => {
    const signalNames = sample ? getSignalNames(sample) : [];
    setSignalNames(signalNames);

    if (signalNames.length > 0 && !selectedSignal) {
      setSelectedSignal(signalNames[0]);
    }
  }, [sample, selectedSignal]);

  useEffect(() => {
    if (!selectedSignal) return;

    setViewParams((prevParams: SpectrogramViewParams) => {
      const nextParams = {
        ...prevParams,
        signal_name: selectedSignal,
        nfft: fftValue,
      } as SpectrogramViewParams;

      // Only update if params have actually changed.
      // Requesting a full data refresh is expensive.
      return shallowEqual(prevParams, nextParams) ? prevParams : nextParams;
    });
  }, [selectedSignal, fftValue, setViewParams]);

  return (
    <Flex direction="column" alignItems="start" gap="size-200">
      <ComboBox
        label="Select Signal"
        selectedKey={selectedSignal}
        onSelectionChange={(key) => setSelectedSignal(key as string)}
      >
        {signalNames.map((signal) => (
          <Item key={signal}>{signal}</Item>
        ))}
      </ComboBox>
      <NumberField
        label="FFT Size"
        value={fftValue}
        minValue={256}
        maxValue={8192}
        step={256}
        onChange={setFftValue}
      />
    </Flex>
  );
}
