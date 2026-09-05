import { useEffect, useState } from "react";
import { api, type PublicConfig } from "./api";

// Module-level cache so multiple components (Home, Login, Unlock,
// SupportButton, ...) mounting at once don't each fire their own
// /config/public request.
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
