"use client";
import { useState, type ReactNode } from "react";
import {
  Button,
  DialogTrigger,
  Dialog,
  Heading,
  Divider,
  Content,
  ButtonGroup,
  Text,
  ToastQueue,
} from "@adobe/react-spectrum";
import { BACKEND_API_URL, apiFetch, formatApiDetail } from "@/app/core";
import {
  NewPasswordFields,
  validateNewPassword,
} from "@/app/components/ui/newPasswordFields";

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
