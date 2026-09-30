"use client";
import { useState } from "react";
import { ActionButton, TextField, View } from "@adobe/react-spectrum";
import Visibility from "@spectrum-icons/workflow/Visibility";
import VisibilityOff from "@spectrum-icons/workflow/VisibilityOff";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  isRequired?: boolean;
  width?: string;
};

/** A password TextField with a button that shows or hides the typed characters.
 *
 * Each field keeps its own visibility state, so a page with several password
 * fields reveals only the one the user asks for. The button label includes the
 * field label to keep it unambiguous on such a page.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoFocus,
  isRequired,
  width = "100%",
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View position="relative" width={width}>
      <TextField
        label={label}
        type={isVisible ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
        isRequired={isRequired}
        width="100%"
      />
      <View position="absolute" right="size-50" bottom="size-0">
        <ActionButton
          isQuiet
          UNSAFE_className="hover:!bg-transparent active:!border-transparent active:!bg-transparent"
          aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
          onPress={() => setIsVisible((prev) => !prev)}
        >
          {isVisible ? <VisibilityOff /> : <Visibility />}
        </ActionButton>
      </View>
    </View>
  );
}
