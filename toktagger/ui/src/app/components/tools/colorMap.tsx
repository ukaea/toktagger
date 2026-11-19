"use client";
import { ComboBox, Item, Key } from "@adobe/react-spectrum";
import { PlotProps } from "@/types";

type ColorMapPickerInfo = {
  plotProps: PlotProps;
  setPlotProps: (props: PlotProps) => void;
};

const COLOR_MAPS = [
  { id: 1, name: "Viridis" },
  { id: 2, name: "Plasma" },
  { id: 3, name: "Inferno" },
  { id: 4, name: "Magma" },
  { id: 5, name: "Cividis" },
];

export function ColorMapPicker({
  plotProps,
  setPlotProps,
}: ColorMapPickerInfo) {
  const onColorMapChange = (key: Key | null) => {
    if (key) {
      const selectedColorMap = Number(key.toString());
      const value = COLOR_MAPS.find((item) => item.id === selectedColorMap);
      setPlotProps({ ...plotProps, colorMap: value?.name || "Cividis" });
    }
  };

  return (
    <ComboBox
      label="Color Map"
      defaultItems={COLOR_MAPS}
      inputValue={plotProps.colorMap || "Cividis"}
      onSelectionChange={onColorMapChange}
    >
      {(item) => <Item key={item.id}>{item.name}</Item>}
    </ComboBox>
  );
}
