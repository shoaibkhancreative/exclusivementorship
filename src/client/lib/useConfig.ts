import { useEffect, useState } from "react";
import { api, type PublicConfig } from "./api";

let cached: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

export function useConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(cached);

  useEffect(() => {
    if (cached) {
      setConfig(cached);
      return;
    }
    if (!inflight) {
      inflight = api.get<PublicConfig>("/config/public");
    }
    let cancelled = false;
    inflight
      .then((data) => {
        cached = data;
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        inflight = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
