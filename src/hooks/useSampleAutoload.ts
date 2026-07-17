import { useEffect, useRef } from "react";
import type { LoomDocument } from "../types";

interface LatestSampleResponse {
  filename: string;
  mtimeMs: number;
  content: LoomDocument;
}

const POLL_INTERVAL_MS = 2000;

/** Polls the dev-only /api/latest-sample endpoint and fires onLoad whenever a
 * newer file appears in samples/ than the one seen when polling started —
 * lets Claude write a JSON there and have it appear without a manual upload. */
export function useSampleAutoload(onLoad: (doc: LoomDocument, filename: string) => void) {
  const baselineRef = useRef<number | null>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/latest-sample");
        if (!res.ok || cancelled) return;
        const data: LatestSampleResponse = await res.json();
        if (cancelled) return;
        if (baselineRef.current === null) {
          baselineRef.current = data.mtimeMs;
          return;
        }
        if (data.mtimeMs > baselineRef.current) {
          baselineRef.current = data.mtimeMs;
          onLoadRef.current(data.content, data.filename);
        }
      } catch {
        // dev server / samples dir not ready yet — ignore and retry next tick
      }
    };

    void poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
}
