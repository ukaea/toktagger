"use client";
import { useState, type ReactNode } from "react";
import {
  ActionButton,
  Button,
  ButtonGroup,
  Content,
  Dialog,
  DialogTrigger,
  Divider,
  Flex,
  Heading,
  Text,
  TextField,
  ToastQueue,
  View,
} from "@adobe/react-spectrum";
import Visibility from "@spectrum-icons/workflow/Visibility";
import VisibilityOff from "@spectrum-icons/workflow/VisibilityOff";
import { BACKEND_API_URL, apiFetch, formatApiDetail } from "@/app/core";

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

const MIN_PASSWORD_LENGTH = 8;

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

type PasswordChangeDialogProps = {
  userId: string;
  triggerLabel: string;
  heading: string;
  /** Sent to the API as `must_change_password` on success. */
  forceChangeOnNextLogin: boolean;
  successMessage: string;
  helperText?: ReactNode;
  confirmLabel?: string;
  triggerVariant?: "primary" | "secondary" | "cta" | "accent" | "negative";
  /** Controlled open state, e.g. to auto-open when the caller must change their password. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** False makes the dialog un-cancellable (no Cancel button, no Escape dismiss). */
  isDismissable?: boolean;
  onSuccess?: () => void | Promise<void>;
};

/** Password change form shared by self-service (profile) and admin (user reset) flows. */
export function PasswordChangeDialog({
  userId,
  triggerLabel,
  heading,
  forceChangeOnNextLogin,
  successMessage,
  helperText,
  confirmLabel = triggerLabel,
  triggerVariant = "secondary",
  isOpen,
  onOpenChange,
  isDismissable = true,
  onSuccess,
}: PasswordChangeDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPassword("");
    setConfirmPassword("");
  };

  const save = async (close: () => void) => {
    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      ToastQueue.negative(validationError, { timeout: 2000 });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${BACKEND_API_URL}/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          password,
          must_change_password: forceChangeOnNextLogin,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(formatApiDetail(d, "Failed to change password"));
      }
      reset();
      close();
      ToastQueue.positive(successMessage, { timeout: 2000 });
      await onSuccess?.();
    } catch (e) {
      ToastQueue.negative(e instanceof Error ? e.message : "Error", {
        timeout: 2000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    // Deliberately not `isDismissable`: Spectrum hides a dismissable dialog's whole
    // ButtonGroup, which would take Cancel and the confirm button with it.
    <DialogTrigger
      isOpen={isOpen}
      isKeyboardDismissDisabled={!isDismissable}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange?.(open);
      }}
    >
      <Button variant={triggerVariant} minWidth={0} flexShrink={0}>
        {triggerLabel}
      </Button>
      {(close) => (
        <Dialog>
          <Heading>{heading}</Heading>
          <Divider />
          <Content>
            <NewPasswordFields
              password={password}
              confirmPassword={confirmPassword}
              onPasswordChange={setPassword}
              onConfirmPasswordChange={setConfirmPassword}
              passwordLabel="New password"
              confirmLabel="Confirm new password"
              autoFocus
            />
            {helperText && <Text marginTop="size-100">{helperText}</Text>}
          </Content>
          <ButtonGroup>
            {isDismissable && (
              <Button variant="secondary" onPress={close}>
                Cancel
              </Button>
            )}
            <Button
              variant="cta"
              isDisabled={!password || !confirmPassword || saving}
              onPress={() => save(close)}
            >
              {confirmLabel}
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogTrigger>
  );
}
