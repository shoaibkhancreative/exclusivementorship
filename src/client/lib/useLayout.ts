import { useEffect, useState } from "react";
import { api } from "./api";

export interface LayoutBlockState {
  id: string;
  visible: boolean;
}

interface LayoutResponse {
  layouts: Record<string, LayoutBlockState[]>;
}

let cached: Record<string, LayoutBlockState[]> | null = null;
let inflight: Promise<Record<string, LayoutBlockState[]>> | null = null;

export function useLayout() {
  const [map, setMap] = useState<Record<string, LayoutBlockState[]> | null>(cached);

  useEffect(() => {
    if (cached) {
      setMap(cached);
      return;
    }
    if (!inflight) {
      inflight = api.get<LayoutResponse>("/config/layout").then((res) => res.layouts);
    }
    let cancelled = false;
    inflight
      .then((data) => {
        cached = data;
        if (!cancelled) setMap(data);
      })
      .catch(() => {
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function getBlockOrder(pageKey: string, defaultOrder: string[]): string[] {
    const page = map?.[pageKey];
    if (!page) return defaultOrder;
    return page.filter((b) => b.visible).map((b) => b.id);
  }

  return { getBlockOrder, loaded: map !== null };
}
