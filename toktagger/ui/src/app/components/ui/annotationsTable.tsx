"use client";

import { useVSpanContext } from "@/app/components/providers/vpsan-provider";
import { useZoneContext } from "@/app/components/providers/zone-provider";
import { Category } from "@/types";
import { useMemo } from "react";
import {
  TableView,
  TableHeader,
  Column,
  TableBody,
  Row,
  Cell,
  Flex,
} from "@adobe/react-spectrum";
// import { ToolingControls } from "./toolingControls";

interface TableEntry {
  id: string;
  category: Category;
  x0: string;
  x1: string;
  markerClass: string;
}

export const AnnotationsTable = () => {
  const { zones } = useZoneContext();
  const { vspans } = useVSpanContext();

  const entries = useMemo<TableEntry[]>(() => {
    const entriesBuffer: TableEntry[] = [];

    for (const [index, zone] of zones.entries()) {
      entriesBuffer.push({
        id: `zone-${index}`,
        category: zone.category,
        x0: zone.x0.toFixed(6),
        x1: zone.x1.toFixed(6),
        markerClass: "w-5 h-5 sm:rounded-lg",
      });
    }

    for (const [index, vspan] of vspans.entries()) {
      entriesBuffer.push({
        id: `vspan-${index}`,
        category: vspan.category,
        x0: vspan.x.toFixed(6),
        x1: "--",
        markerClass: "w-5 h-1.5 sm:rounded-lg",
      });
    }

    return entriesBuffer;
  }, [zones, vspans]);

  return (
    <div className="relative w-[70%] overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto p-4">
      {/* <ToolingControls /> */}
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <TableView aria-label="Annotations table" width="100%" height="200px">
        <TableHeader>
          <Column key="category" width="40%">
            Category
          </Column>
          <Column key="type" width="20%">
            Type
          </Column>
          <Column key="x0" width="20%">
            x0
          </Column>
          <Column key="x1" width="20%">
            x1
          </Column>
        </TableHeader>
        <TableBody items={entries}>
          {(item) => (
            <Row key={item.id}>
              <Cell>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    className={item.markerClass}
                    style={{ background: item.category.color }}
                  />
                  <span>{item.category.name}</span>
                </div>
              </Cell>
              <Cell>
                {item.id.startsWith("zone") ? "Time Region" : "Time Point"}
              </Cell>
              <Cell>{item.x0}</Cell>
              <Cell>{item.x1}</Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </div>
  );
};
