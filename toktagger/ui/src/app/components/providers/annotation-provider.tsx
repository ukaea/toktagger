"use client";

import { ToolingCallbacks } from "@/types";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Menu, ShowContextMenuParams, useContextMenu } from "react-contexify";

type MakeOptional<Type, Key extends keyof Type> = Omit<Type, Key> &
  Partial<Pick<Type, Key>>;

interface ContextMenuContextType {
  setToolingCallbacks: (callbacks: ToolingCallbacks) => void;
  registerMenuItem: (id: string, element: React.ReactNode) => void;
  show: (params: MakeOptional<ShowContextMenuParams<unknown>, "id">) => void;
  toolingCallbacks: ToolingCallbacks | null;
  disableToolingInteraction: boolean;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export const useContextMenuProvider = () => {
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
  const menuElementsRef = useRef<Map<string, React.ReactNode>>(new Map());
  const [, forceUpdate] = useState({});
  const { show } = useContextMenu({ id: menuId });
  const [toolingCallbacksState, setToolingCallbacksState] =
    useState<ToolingCallbacks | null>(null);
  const [disableToolingInteraction, setDisableToolInteraction] =
    useState(false);

  const keyHeldRef = useRef(false);

  // Allows tools to register their own menu item in the general context menu
  const registerMenuItem = useCallback(
    (id: string, element: React.ReactNode) => {
      menuElementsRef.current.set(id, element);
      forceUpdate({}); // Trigger re-render
    },
    [],
  );

  // Set up listeners to toggle tooling interaction
  useEffect(() => {
    const disableInteraction = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        if (!keyHeldRef.current) {
          keyHeldRef.current = true;
          setDisableToolInteraction(true);
        }
      }
    };

    const enableInteraction = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        keyHeldRef.current = false;
        setDisableToolInteraction(false);
      }
    };

    document.addEventListener("keydown", disableInteraction);
    document.addEventListener("keyup", enableInteraction);

    return () => {
      document.removeEventListener("keydown", disableInteraction);
      document.removeEventListener("keyup", enableInteraction);
    };
  }, []);

  const setToolingCallbacks = (callbacks: ToolingCallbacks) => {
    setToolingCallbacksState(callbacks);
  };

  const contextValue = useMemo(
    () => ({
      setToolingCallbacks,
      registerMenuItem,
      show,
      toolingCallbacks: toolingCallbacksState,
      disableToolingInteraction,
    }),
    [show, toolingCallbacksState, disableToolingInteraction, registerMenuItem],
  );

  return (
    <ContextMenuContext.Provider value={contextValue}>
      {children}
      <Menu id={menuId}>{[...menuElementsRef.current.values()]}</Menu>
    </ContextMenuContext.Provider>
  );
};
