"use client";

import { Zone, Category, ToolingTypes } from "@/types";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Item, ItemParams, Menu, Submenu } from "react-contexify";
import "react-contexify/ReactContexify.css";
import { useContextMenuProvider } from "./annotation-provider";

interface ZoneContextInfo {
  zones: Zone[];
  handleZoneUpdate: () => void;
  handleZoneDragFinish: () => void;
  handleZoneDelete: (input: Zone) => void;
  addZone: (x0: number, x1: number, category: Category) => void;
  activateTooling: () => void;
  triggerUpdate: number;
}

const ZoneContext = createContext<ZoneContextInfo | null>(null);

export const useZoneContext = () => {
  const context = useContext(ZoneContext);
  if (!context) {
    throw new Error("useZoneContext must be used within a ZoneProvider");
  }
  return context;
};

export const ZONE_MENU_ID = "zone-provider";

/**
 * Context provider that gives child components shared read/write to zone data
 *
 * @param categories Array of categories that the zones provided by this context can be
 * @param initialData Array of zones that should be added when initialised
 */
export const ZoneProvider = ({
  categories,
  initialData,
  children,
  onModifyZone,
}: {
  categories: Category[];
  initialData?: Zone[];
  children: React.ReactNode;
  onModifyZone?: (newZones: Zone[]) => void;
}) => {
  const zones = useRef<Zone[]>([]);
  const [triggerUpdate, setTriggerUpdate] = useState(0); // Value should be changed to trigger refresh
  const { setToolingCallbacks, registerMenuItem } = useContextMenuProvider();

  // It is necessary for the context to trigger child refreshes
  const triggerZoneUpdate = () => {
    setTriggerUpdate((current) => (current + 1) % 10);
  };

  // Provides a method for child components to trigger context refresh
  const handleZoneUpdate = () => {
    triggerZoneUpdate();
  };

  const handleZoneDragFinish = () => {
    triggerZoneUpdate();
    onModifyZone?.(zones.current);
  };

  const handleZoneDelete = (input: Zone) => {
    // Remove the current zone and all selected zones
    zones.current = zones.current.filter((zone) => zone !== input);
    zones.current = zones.current.filter((zone) => !zone.selected);
    triggerZoneUpdate();
    onModifyZone?.(zones.current);
  };

  const handleTypeSetting = (
    { props }: ItemParams,
    targetCategory: Category,
  ) => {
    zones.current = zones.current.map((zone) => {
      if (zone === props.zone || zone.selected) {
        zone.category = targetCategory;
      }
      zone.selected = false;
      return zone;
    });
    triggerZoneUpdate();
    onModifyZone?.(zones.current);
  };

  const addZone = (x0: number, x1: number, category: Category) => {
    zones.current.push({
      selected: false,
      created_by: "manual",
      category,
      x0,
      x1,
    });
    triggerZoneUpdate();
    onModifyZone?.(zones.current);
  };

  const activateTooling = () => {
    setToolingCallbacks({
      id: ToolingTypes.ZONE,
      start: (x, _y) => {
        addZone(x, x, categories[0]);
      },
      move: (x, _y) => {
        zones.current[zones.current.length - 1].x1 = x;
        triggerZoneUpdate();
      },
      end: (x, _y) => {
        const z = zones.current[zones.current.length - 1];
        z.x1 = x;
        // Normalize orientation on creation finish (provider has no min-width context).
        if (z.x1 < z.x0) {
          [z.x0, z.x1] = [z.x1, z.x0];
        }
        triggerZoneUpdate();
        handleZoneDragFinish();
      },
    });
  };

  // On initialisation the tool registers a menu item with the general context menu
  useEffect(() => {
    const addZone = (x0: number, x1: number, category: Category) => {
      zones.current.push({
        selected: false,
        created_by: "manual",
        category,
        x0,
        x1,
      });
      triggerZoneUpdate();
      onModifyZone?.(zones.current);
    };
    /**
     * Converts generic props into a new zone.
     * Uses 5 % of the current x-range as default width – avoids pixel scaling.
     */
    type MenuProps = { x: number; xRange: number; xLimits: [number, number] };

    const addFromClick = (menu: MenuProps, category: Category) => {
      const width = 0.05 * menu.xRange; // 5 % of span
      const x0 = menu.x;
      const x1 = Math.min(x0 + width, menu.xLimits[1]); // clamp to upper limit
      addZone(x0, x1, category);
    };

    const addZoneItems = categories.map((category, index) => {
      return (
        <Item
          key={`add${index}`}
          id={`add${index}`}
          onClick={({ props }) => {
            addFromClick(props as MenuProps, category);
          }}
        >
          {category.name}
        </Item>
      );
    });

    /* Decide what to register in the main context‑menu:
        – Single category → direct “Add <Category>” item.
        – Multiple categories → keep existing submenu.
        */
    const menuElement =
      categories.length === 1 ? (
        <Item
          key="add-zone-single"
          id="add-zone-single"
          onClick={({ props }) => {
            addFromClick(props as MenuProps, categories[0]);
          }}
        >
          {`Add ${categories[0].name}`}
        </Item>
      ) : (
        <Submenu key="zone-submenu" data-testid="zone-submenu" label="Add Time Region">
          {addZoneItems}
        </Submenu>
      );

    registerMenuItem("zone", menuElement);
  }, [categories, onModifyZone, registerMenuItem]);

  // Initialisation of data - this should only run once
  // Effect: run ONCE per mount to populate from initialData
  // – overwrites instead of pushing; cleans on unmount
  useEffect(() => {
    if (!initialData) return;

    zones.current = [...initialData];
    triggerZoneUpdate();

    /* remove stale copy when Strict-Mode unmounts the first render */
    return () => {
      zones.current = [];
    };
  }, [initialData]);

  // Provides an array of the categories for the context menu
  const updateTypeItems = categories.map((category, index) => {
    return (
      <Item
        key={`update${index}`}
        id={`update${index}`}
        onClick={(props) => {
          handleTypeSetting(props, category);
        }}
      >
        {category.name}
      </Item>
    );
  });

  // The context provider is responsible for rendering the context menu relating to zones
  return (
    <ZoneContext.Provider
      value={{
        zones: zones.current,
        handleZoneUpdate,
        handleZoneDragFinish,
        handleZoneDelete,
        addZone,
        activateTooling,
        triggerUpdate,
      }}
    >
      {children}
      <Menu id={`${ZONE_MENU_ID}`}>
        <Item
          id="delete"
          onClick={({ props }: ItemParams) => {
            handleZoneDelete(props.zone);
          }}
        >
          Delete
        </Item>
        <Submenu label="Set type">{updateTypeItems}</Submenu>
      </Menu>
    </ZoneContext.Provider>
  );
};
