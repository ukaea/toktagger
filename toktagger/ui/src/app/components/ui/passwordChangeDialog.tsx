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
  InlineAlert,
  Flex,
  ToastQueue,
} from "@adobe/react-spectrum";
import { BACKEND_API_URL, apiFetch } from "@/app/core";
import { PasswordField } from "@/app/components/ui/passwordField";

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const save = async (close: () => void) => {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
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
        throw new Error(d?.detail ?? "Failed to change password");
      }
      reset();
      close();
      ToastQueue.positive(successMessage, { timeout: 2000 });
      await onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
      <Button
        variant={triggerVariant}
        UNSAFE_style={{ minInlineSize: 0, flexShrink: 0 }}
      >
        {triggerLabel}
      </Button>
      {(close) => (
        <Dialog>
          <Heading>{heading}</Heading>
          <Divider />
          <Content>
            {error && (
              <InlineAlert variant="negative" marginBottom="size-100">
                {error}
              </InlineAlert>
            )}
            <Flex direction="column" gap="size-100">
              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                isRequired
                autoFocus
              />
              <PasswordField
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                isRequired
              />
            </Flex>
            {helperText && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                {helperText}
              </p>
            )}
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
