import { Flex, NumberField } from "@adobe/react-spectrum";
import { useEffect, useState } from "react";

export type NumericalRangeType = {
  min: number | null;
  max: number | null;
};

export default function NumericalRange({
  defaultMin,
  defaultMax,
  label,
  isRequired = true,
  maximumFractionDigits,
  onChange,
}: {
  defaultMin?: number;
  defaultMax?: number;
  label: string;
  isRequired?: boolean;
  maximumFractionDigits?: number | undefined;
  onChange?: (range: NumericalRangeType) => void;
}) {
  const [minValue, setMinValue] = useState<number | null>(defaultMin ?? null);
  const [maxValue, setMaxValue] = useState<number | null>(defaultMax ?? null);

  useEffect(() => {
    onChange?.({ min: minValue, max: maxValue });
  }, [minValue, maxValue, onChange]);

  return (
    <Flex direction="row" gap="size-200" alignItems="center">
      <NumberField
        label={`${label} Min`}
        isRequired={isRequired}
        value={minValue ?? undefined}
        onChange={setMinValue}
        validate={(value: number) => {
          if (isRequired && Number.isNaN(value)) {
            return `${label} Min is required`;
          } else if (!Number.isNaN(maxValue) && maxValue && value >= maxValue) {
            return `Must be less than ${label} Max`;
          } else {
            return true;
          }
        }}
        formatOptions={{
          maximumFractionDigits: maximumFractionDigits ?? undefined,
        }}
      />
      <NumberField
        label={`${label} Max`}
        isRequired={isRequired}
        value={maxValue ?? undefined}
        onChange={setMaxValue}
        validate={(value: number) => {
          if (isRequired && Number.isNaN(value)) {
            return `${label} Max is required`;
          } else if (!Number.isNaN(minValue) && minValue && value <= minValue) {
            return `Must be greater than ${label} Min`;
          } else {
            return true;
          }
        }}
        formatOptions={{
          maximumFractionDigits: maximumFractionDigits ?? undefined,
        }}
      />
    </Flex>
  );
}
