"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  ComboBox,
  Flex,
  Item,
  useProvider,
  View,
} from "@adobe/react-spectrum";

/**
 * Minimal class category shape consumed by the class picker.
 * Kept intentionally small so this file stays UI-only and decoupled from session/types.
 */
export type ClassCategoryItem = {
  name: string;
};

/**
 * Class selector used to "arm" drawing with a label.
 * When no class is selected, the annotator should disable drawing.
 */
export function ClassPanel({
  items,
  selectedClassName,
  setSelectedClassName,
}: {
  items: Iterable<ClassCategoryItem>;
  selectedClassName: string | null;
  setSelectedClassName: (v: string | null) => void;
}) {
  return (
    <View marginX="auto" width="12rem">
      <ComboBox
        label={
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Class Label
          </span>
        }
        items={items}
        selectedKey={selectedClassName}
        onSelectionChange={(key) =>
          setSelectedClassName((key as string) || null)
        }
        width="100%"
      >
        {(item) => <Item key={item.name}>{item.name}</Item>}
      </ComboBox>
    </View>
  );
}

/**
 * Center frame control:
 * - Default state: "Frame X" button
 * - Edit state: inline numeric input in the same pill footprint
 */
export function FrameJumpField(props: {
  frame: number;
  onJump: (n: number) => void;
}) {
  const { colorScheme } = useProvider();
  const isDark = colorScheme === "dark";
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState<string>(String(props.frame));
  const [pillWidth, setPillWidth] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayPillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(String(props.frame));
    }
  }, [props.frame, isEditing]);

  useEffect(() => {
    if (!isEditing) return;

    const rafId = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });

    return () => cancelAnimationFrame(rafId);
  }, [isEditing]);

  const startEdit = () => {
    const width = displayPillRef.current?.offsetWidth ?? null;
    setPillWidth(width);
    setDraftValue(String(props.frame));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraftValue(String(props.frame));
    setIsFocused(false);
    setIsEditing(false);
  };

  const commitEdit = () => {
    const trimmed = draftValue.trim();
    if (trimmed === "") {
      cancelEdit();
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 0) {
      setIsEditing(false);
      props.onJump(Math.trunc(parsed));
    }
  };

  if (!isEditing) {
    return (
      <div ref={displayPillRef} style={{ display: "inline-flex" }}>
        <Button variant="primary" onPress={startEdit}>
          Frame {props.frame}
        </Button>
      </div>
    );
  }

  return (
    <View
      role="presentation"
      borderWidth="thin"
      borderColor={isDark ? "static-white" : "gray-900"}
      backgroundColor={isDark ? "transparent" : "static-white"}
      height={32}
      paddingX={12}
      width={pillWidth !== null ? pillWidth : undefined}
      UNSAFE_style={{
        borderRadius: "9999px",
        boxShadow: isFocused
          ? `0 0 0 2px ${isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(17, 24, 39, 0.25)"}`
          : undefined,
        display: "inline-flex",
      }}
    >
      <Flex alignItems="center" justifyContent="center" width="100%">
        <input
          ref={inputRef}
          aria-label="Frame number"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draftValue}
          onChange={(event) => {
            const next = event.target.value.replace(/\D+/g, "");
            setDraftValue(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitEdit();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelEdit();
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={cancelEdit}
          style={{
            background: "transparent",
            border: 0,
            color: isDark ? "#ffffff" : "#111827",
            fontSize: 14,
            fontWeight: 600,
            outline: "none",
            padding: 0,
            textAlign: "center",
            width: "100%",
          }}
        />
      </Flex>
    </View>
  );
}
