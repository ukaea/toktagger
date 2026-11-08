"use client";
import React from "react";
import {
  Accordion,
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
} from "@adobe/react-spectrum";

export type ToolEntry = {
  name: string;
  component: React.ReactNode;
  defaultExpanded?: boolean;
};

export function ToolAccordion({ tools }: { tools: ToolEntry[] }) {
  if (tools.length === 0) return null;
  return (
    <Accordion
      allowsMultipleExpanded={true}
      defaultExpandedKeys={tools
        .filter((item) => item.defaultExpanded)
        .map((item) => item.name)}
      width="100%"
    >
      {tools.map((item) => (
        <Disclosure key={item.name} id={item.name}>
          <DisclosureTitle>
            <span style={{ fontSize: "0.8rem" }}>{item.name}</span>
          </DisclosureTitle>
          <DisclosurePanel>{item.component}</DisclosurePanel>
        </Disclosure>
      ))}
    </Accordion>
  );
}
