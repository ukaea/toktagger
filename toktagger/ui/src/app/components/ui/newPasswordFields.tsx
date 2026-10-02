"use client";
import { Flex } from "@adobe/react-spectrum";
import { PasswordField } from "@/app/components/ui/passwordField";

export const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message for an invalid new password pair, or null if valid. */
export function validateNewPassword(
  password: string,
  confirmPassword: string,
): string | null {
  if (password !== confirmPassword) return "Passwords do not match";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

type NewPasswordFieldsProps = {
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  passwordLabel: string;
  confirmLabel: string;
  autoFocus?: boolean;
};

export function NewPasswordFields({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  passwordLabel,
  confirmLabel,
  autoFocus,
}: NewPasswordFieldsProps) {
  return (
    <Flex direction="column" gap="size-100">
      <PasswordField
        label={passwordLabel}
        value={password}
        onChange={onPasswordChange}
        isRequired
        autoFocus={autoFocus}
      />
      <PasswordField
        label={confirmLabel}
        value={confirmPassword}
        onChange={onConfirmPasswordChange}
        isRequired
      />
    </Flex>
  );
}
