"use client"

import { Zone, Category } from "@/types";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Item, ItemParams, Menu, Submenu } from "react-contexify";
import 'react-contexify/ReactContexify.css'
import { useContextMenuProvider } from "./context-menu-provider";

interface ZoneContextInfo {
    zones: Zone[];
    handleZoneUpdate: () => void;
    handleZoneDragFinish: () => void;
    handleZoneDelete: (zone: Zone) => void;
    triggerUpdate: number;
}

const ZoneContext = createContext<ZoneContextInfo | null>(null)

export const useZoneContext = () => {
    const context = useContext(ZoneContext)
        if (!context) {
            throw new Error("useZoneContext must be used within a ZoneProvider")
        }
        return context
}

export const ZONE_MENU_ID = "zone-provider"

/**
 * Context provider that gives child components shared read/write to zone data
 * 
 * @param categories Array of categories that the zones provided by this context can be
 * @param initialData Array of zones that should be added when initialised
 */
export const ZoneProvider = ({categories, initialData, children, onModifyZone} : {
    categories: Category[],
    initialData?: Zone[],
    children: React.ReactNode,
    onModifyZone: (newZones: Zone[]) => void
}) => {
    const zones = useRef<Zone[]>([])
    const [triggerUpdate, setTriggerUpdate] = useState(0) // Value should be changed to trigger refresh

    const {registerMenuItem} = useContextMenuProvider()

    
    // It is necessary for the context to trigger child refreshes
    const triggerZoneUpdate = () => {
        setTriggerUpdate((current) => (current+1)%10)
    }

    // Provides a method for child components to trigger context refresh
    const handleZoneUpdate = () => {
        triggerZoneUpdate()
    }

    const handleZoneDragFinish = () => {
        onModifyZone(zones.current);
    }


    const handleZoneDelete = (input: Zone) => {
        // Remove the current zone and all selected zones
        zones.current = zones.current.filter(zone => zone !== input)
        zones.current = zones.current.filter(zone => !zone.selected);
        triggerZoneUpdate()
        onModifyZone(zones.current);
    }

    const handleTypeSetting = ({props}: ItemParams, targetCategory: Category) => {
        // Update the category of the zone or all selected zones
        zones.current = zones.current.map((zone) => {
            if (zone === props.zone || zone.selected) {
                zone.category = targetCategory
            }
            zone.selected = false; // Deselect after type change
            return zone
        })
        triggerZoneUpdate()
        onModifyZone(zones.current);
    }

    // On initialisation the tool registers a menu item with the general context menu
    useEffect(() => {

        const handleZoneAdd = (zone: Zone) => {
            zones.current.push(zone);
            triggerZoneUpdate();
            onModifyZone(zones.current);
        }

        /**
         * Converts generic props into a new zone.
         * Uses 5 % of the current x-range as default width – avoids pixel scaling.
         */
        type MenuProps = { x: number; xRange: number; xLimits: [number, number] };

        const addFromClick = (menu: MenuProps, category: Category) => {
            const width = 0.05 * menu.xRange              // 5 % of span
            const x0 = menu.x
            const x1 = Math.min(x0 + width, menu.xLimits[1]) // clamp to upper limit
            const zone = {
                category,
                x0,
                x1,
                created_by: 'manual',
                type: 'time_region',
                selected: false
            }
            handleZoneAdd(zone);
        }
    
        const addZoneItems = categories.map((category, index) => {
            return (
                <Item key={`add${index}`} id={`add${index}`} onClick={({props}) => {
                    addFromClick(props as MenuProps, category)
                }}>
                    {category.name}
                </Item>
            )
        })
            
        /* Decide what to register in the main context‑menu:
        – Single category → direct “Add <Category>” item.
        – Multiple categories → keep existing submenu.
        */
        const menuElement =
            categories.length === 1
                ? (
                    <Item key="add-zone-single" id="add-zone-single" onClick={({props}) => {
                        addFromClick(props as MenuProps, categories[0])
                    }}>
                        {`Add ${categories[0].name}`}
                    </Item>
                ) : (
                    <Submenu key="zone-submenu" label="Add zone">
                        {addZoneItems}
                    </Submenu>
                )

        registerMenuItem("zone", menuElement)

    }, [categories, onModifyZone, registerMenuItem])

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
            <Item key={`update${index}`} id={`update${index}`} onClick={(props) => {handleTypeSetting(props, category)}}>
                {category.name}
            </Item>
        )
    })

    // Handle keyboard event
    document.addEventListener("keydown", (e) => {
        if ((e.key === "Delete" || e.key == "Backspace")) {
            e.preventDefault(); // Prevent default delete behavior
            const selectedZones = zones.current.filter(zone => zone.selected);
            for (const zone of selectedZones) {
                handleZoneDelete(zone);
            }
        }
    });

    // The context provider is responsible for rendering the context menu relating to zones
    return(
        <ZoneContext.Provider value={{zones: zones.current, handleZoneUpdate, handleZoneDragFinish, handleZoneDelete, triggerUpdate}}>
            {children}
            <Menu id={`${ZONE_MENU_ID}`}>
                <Item id="delete" onClick={({props}: ItemParams) => {
                    handleZoneDelete(props.zone)
                }}>
                    Delete
                </Item>
                <Submenu label="Set type">
                    {updateTypeItems}
                </Submenu>
            </Menu>
        </ZoneContext.Provider>
    )

}

