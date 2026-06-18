import { useSample } from "@/app/contexts/SampleContext";
import { getSignalNames, shallowEqual } from "@/app/utils";
import { Profile2DViewParams } from "@/types";
import { ComboBox, Flex, Item, Switch } from "@adobe/react-spectrum";
import { useEffect, useState } from "react";

export function Profile2DViewParamsWidget() {
  const { sample, setViewParams } = useSample();
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [signalNames, setSignalNames] = useState<string[]>([]);
  const [logScale, setLogScale] = useState<boolean>(false);

  useEffect(() => {
    const signalNames = sample ? getSignalNames(sample) : [];
    setSignalNames(signalNames);

    if (signalNames.length > 0 && !selectedSignal) {
      setSelectedSignal(signalNames[0]);
    }
  }, [sample, selectedSignal]);

  useEffect(() => {
    if (!selectedSignal) return;

    setViewParams((prevParams: Profile2DViewParams) => {
      const nextParams = {
        ...prevParams,
        signal_name: selectedSignal,
        log_scale: logScale,
      } as Profile2DViewParams;

      // Only update if params have actually changed.
      // Requesting a full data refresh is expensive.
      return shallowEqual(prevParams, nextParams) ? prevParams : nextParams;
    });
  }, [selectedSignal, logScale, setViewParams]);

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
      <Switch isSelected={logScale} onChange={() => setLogScale(!logScale)}>
        Log Scale
      </Switch>
    </Flex>
  );
}
