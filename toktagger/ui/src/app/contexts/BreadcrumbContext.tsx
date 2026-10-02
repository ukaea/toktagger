"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

export interface BreadcrumbItem {
  key: string;
  label: string;
  href?: string;
}

interface BreadcrumbContextType {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(
  undefined,
);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error(
      "Breadcrumb hooks must be used within a BreadcrumbProvider",
    );
  }
  return ctx;
}

export function useBreadcrumbItems() {
  return useBreadcrumbContext().items;
}

function areBreadcrumbItemsEqual(
  a: BreadcrumbItem[],
  b: BreadcrumbItem[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.key === b[i].key &&
        item.label === b[i].label &&
        item.href === b[i].href,
    )
  );
}

export function useBreadcrumbs(items: BreadcrumbItem[]) {
  const { setItems } = useBreadcrumbContext();
  const previousItems = useRef<BreadcrumbItem[]>([]);
  useEffect(() => {
    if (areBreadcrumbItemsEqual(previousItems.current, items)) {
      return;
    }
    previousItems.current = items;
    setItems(items);
  });
}
