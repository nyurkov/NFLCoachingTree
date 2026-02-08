"use client";

import { useState, useEffect } from "react";
import { RawData, ProcessedData } from "@/lib/types";
import { processData } from "@/lib/graph";
import { runRegressions } from "@/lib/regressions";

export function useCoachingData(): ProcessedData | null {
  const [data, setData] = useState<ProcessedData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const resp = await fetch(`${basePath}/data/coaching_connections.json`);
        const raw: RawData = await resp.json();
        const processed = processData(raw);

        if (process.env.NODE_ENV !== "production") {
          runRegressions(processed);
          console.log(
            `Tree: ${processed.nodes.length} nodes, ${processed.edges.length} edges, ${processed.maxLayer + 1} layers`
          );
        }

        if (!cancelled) setData(processed);
      } catch (e) {
        console.error("Failed to load coaching data:", e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
