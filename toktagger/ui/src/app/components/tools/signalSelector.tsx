import { useSample } from "@/app/contexts/SampleContext";
import { getSignalNames } from "@/app/utils";
import { SpectrogramViewParams } from "@/types";
import { ComboBox, Flex, Item } from "@adobe/react-spectrum";
import { useEffect, useState } from "react";

export function SignalSelector() {
  const { sample, setViewParams } = useSample();
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [signalNames, setSignalNames] = useState<string[]>([]);

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
      return {
        ...prevParams,
        signal_name: selectedSignal,
      } as SpectrogramViewParams;
    });
  }, [selectedSignal, setViewParams]);

  return (
    <Flex>
      <ComboBox
        label="Select Signal"
        selectedKey={selectedSignal}
        onSelectionChange={(key) => setSelectedSignal(key as string)}
      >
        {signalNames.map((signal) => (
          <Item key={signal}>{signal}</Item>
        ))}
      </ComboBox>
    </Flex>
  );
}
