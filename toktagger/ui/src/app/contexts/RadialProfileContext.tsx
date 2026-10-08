"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { RadialProfileData } from "@/types";
import { arrayMax, arrayMin, getColorMapInterpolator } from "@/app/utils";

type RadialProfileContextType = {
  // Time range the radial plot shows slices for; null means the whole shot.
  timeWindow: [number, number] | null;
  setTimeWindow: (range: [number, number] | null) => void;
  // timeWindow, or the full time range of the profile when unset.
  effectiveTimeWindow: [number, number];
  visibleSlices: number[];
  sliceColor: (time: number) => string;
};

const RadialProfileContext = createContext<
  RadialProfileContextType | undefined
>(undefined);

export const RadialProfileProvider = ({
  data,
  colorMap,
  children,
}: {
  data: RadialProfileData;
  colorMap?: string;
  children: React.ReactNode;
}) => {
  const [timeWindow, setTimeWindow] = useState<[number, number] | null>(null);

  const value = useMemo<RadialProfileContextType>(() => {
    const timeMin = data.time.length > 0 ? arrayMin(data.time) : 0;
    const timeMax = data.time.length > 0 ? arrayMax(data.time) : 0;
    const effectiveTimeWindow: [number, number] = timeWindow ?? [
      timeMin,
      timeMax,
    ];
    const visibleSlices = data.time.flatMap((time, index) =>
      time >= effectiveTimeWindow[0] && time <= effectiveTimeWindow[1]
        ? [index]
        : [],
    );
    const interpolate = getColorMapInterpolator(colorMap);
    const span = timeMax - timeMin || 1;
    // Skip the darkest end of the colormap so early slices stay visible on dark backgrounds.
    const sliceColor = (time: number) =>
      interpolate(0.1 + (0.9 * (time - timeMin)) / span);

    return {
      timeWindow,
      setTimeWindow,
      effectiveTimeWindow,
      visibleSlices,
      sliceColor,
    };
  }, [data.time, colorMap, timeWindow]);

  return (
    <RadialProfileContext.Provider value={value}>
      {children}
    </RadialProfileContext.Provider>
  );
};

export function useRadialProfile() {
  const context = useContext(RadialProfileContext);
  if (context === undefined) {
    throw new Error(
      "useRadialProfile must be used within a RadialProfileProvider",
    );
  }
  return context;
}
