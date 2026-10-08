"use client";
import { useSample } from "@/app/contexts/SampleContext";
import { getSignalNames } from "@/app/utils";
import { RadialProfileDataSchema, RadialProfileViewParams } from "@/types";
import { Flex, Item, Key, Picker } from "@adobe/react-spectrum";
import { useMemo } from "react";

const NO_RADIUS_SIGNAL = "__channel_index__";

export function RadialProfileViewParamsWidget() {
  const { sample, data, viewParams, setViewParams } = useSample();
  const signalNames = useMemo(() => getSignalNames(sample), [sample]);

  const params: RadialProfileViewParams =
    viewParams.name === "radial_profile"
      ? viewParams
      : { name: "radial_profile" };
  const parsed = RadialProfileDataSchema.safeParse(data);
  const profileSignal =
    params.profile_signal ??
    (parsed.success ? parsed.data.profile_signal : null);

  const update = (changes: Partial<RadialProfileViewParams>) =>
    setViewParams({ ...params, ...changes });

  return (
    <Flex direction="column" alignItems="start" gap="size-200">
      <Picker
        label="Profile Signal"
        selectedKey={profileSignal}
        onSelectionChange={(key: Key | null) =>
          key && update({ profile_signal: key.toString() })
        }
      >
        {signalNames.map((signal) => (
          <Item key={signal}>{signal}</Item>
        ))}
      </Picker>
      <Picker
        label="Radius Signal"
        selectedKey={params.radius_signal ?? NO_RADIUS_SIGNAL}
        onSelectionChange={(key: Key | null) =>
          update({
            radius_signal:
              !key || key === NO_RADIUS_SIGNAL ? undefined : key.toString(),
          })
        }
      >
        {[
          <Item key={NO_RADIUS_SIGNAL}>Channel index</Item>,
          ...signalNames.map((signal) => <Item key={signal}>{signal}</Item>),
        ]}
      </Picker>
    </Flex>
  );
}
