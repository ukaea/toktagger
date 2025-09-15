"use client";

import { Category, ToolingCallbacks, ToolingInfo, ToolingTypes } from "@/types";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Menu, ShowContextMenuParams, useContextMenu } from "react-contexify";

type MakeOptional<Type, Key extends keyof Type> = Omit<Type, Key> &
  Partial<Pick<Type, Key>>;

interface ContextMenuContextType {
  setToolingCallbacks: (type: ToolingTypes, category?: Category) => void;
  registerTooling: (
    id: string,
    callbacks: ToolingInfo,
    element: React.ReactNode,
  ) => void;
  toggleEditMode: () => void;
  show: (params: MakeOptional<ShowContextMenuParams<unknown>, "id">) => void;
  toolingCallbacks: ToolingCallbacks | null;
  toolingInfo: Map<ToolingTypes, ToolingInfo>;
  disableToolingInteraction: boolean;
  editMode: boolean;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useAnnotationProvider = () => {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error(
      "useRegisterContextMenuItem must be used within a ContextMenuProvider",
    );
  }
  return context;
};

/**
 * Context provider that gives child components access to context menu data
 *
 * @param menuId Allows for a unique id to be assigned to the context menu
 */
export const ContextMenuProvider = ({
  menuId,
  children,
}: {
  menuId: string;
  children: React.ReactNode;
}) => {
  const [menuElements, setMenuElements] = useState<
    Map<string, React.ReactNode>
  >(new Map());
  const [toolingInfo, setToolingInfo] = useState<
    Map<ToolingTypes, ToolingInfo>
  >(new Map());
  const [toolingCallbacksState, setToolingCallbacksState] =
    useState<ToolingCallbacks | null>(null);
  const [disableToolingInteraction, setDisableToolInteraction] =
    useState(false);
  const [editMode, setEditMode] = useState(false);

  const { show } = useContextMenu({ id: menuId });

  const keyHeldRef = useRef(false);

  const toggleEditMode = () => {
    setDisableToolInteraction(editMode);
    setEditMode((prev) => !prev);
  };

  // Allows tools to register their own menu item in the general context menu
  // TODO: Change id to tooling type
  const registerTooling = useCallback(
    (id: string, info: ToolingInfo, element: React.ReactNode) => {
      setMenuElements((prev) => {
        if (prev.has(id)) return prev;
        const newMap = new Map(prev);
        newMap.set(id, element);
        return newMap;
      });
      const callbackId = info.id;
      setToolingInfo((prev) => {
        if (prev.has(callbackId)) return prev;
        const newMap = new Map(prev);
        newMap.set(callbackId, info);
        return newMap;
      });
    },
    [],
  );

  // Set up listeners to toggle tooling interaction
  useEffect(() => {
    const disableInteraction = (event: KeyboardEvent) => {
      if (event.key === "Shift" || event.key === "Control") {
        if (!keyHeldRef.current || !disableToolingInteraction) {
          keyHeldRef.current = true;
          setDisableToolInteraction(true);
        }
      }
    };

    const enableInteraction = (event: KeyboardEvent) => {
      if (event.key === "Shift" || event.key === "Control") {
        keyHeldRef.current = false;
        if (editMode) {
          setDisableToolInteraction(false);
        }
      }
    };

    const handleEditMode = (event: KeyboardEvent) => {
      if (event.key === "e") {
        setDisableToolInteraction(editMode);
        setEditMode((prev) => !prev);
      }
    };

    document.addEventListener("keydown", disableInteraction);
    document.addEventListener("keyup", enableInteraction);

    document.addEventListener("keyup", handleEditMode);

    return () => {
      document.removeEventListener("keydown", disableInteraction);
      document.removeEventListener("keyup", enableInteraction);

      document.removeEventListener("keyup", handleEditMode);
    };
  }, [disableToolingInteraction, editMode]);

  const setToolingCallbacks = (type: ToolingTypes, category?: Category) => {
    const info = toolingInfo.get(type);
    if (info) {
      if (!category) {
        category = info.categories[0];
      }

      const callbacks: ToolingCallbacks = {
        id: info.id,
        category: category,
        start: (x, y) => info.start(x, y, category as Category),
        move: info.move,
        end: info.end,
      };
      setToolingCallbacksState(callbacks);
    }
  };

  return (
    <ContextMenuContext.Provider
      value={{
        setToolingCallbacks,
        registerTooling,
        toggleEditMode,
        show,
        toolingCallbacks: toolingCallbacksState,
        toolingInfo,
        disableToolingInteraction,
        editMode,
      }}
    >
      {children}
      <Menu id={menuId}>{[...menuElements.values()]}</Menu>
    </ContextMenuContext.Provider>
  );
};
