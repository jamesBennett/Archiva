import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { generatePreview } from "../lib/tauri";

const DEBOUNCE_MS = 100;

export interface UsePreviewResult {
  url: string | null;
  loading: boolean;
  error: string | null;
}

export function usePreview(
  photoId: string | null,
  maxPx: number,
): UsePreviewResult {
  const [state, setState] = useState<UsePreviewResult>({
    url: null,
    loading: false,
    error: null,
  });
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!photoId || maxPx <= 0) {
      setState({ url: null, loading: false, error: null });
      return;
    }

    const seq = ++requestSeqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    const timer = setTimeout(() => {
      generatePreview(photoId, maxPx)
        .then((path) => {
          if (seq !== requestSeqRef.current) return;
          setState({ url: convertFileSrc(path), loading: false, error: null });
        })
        .catch((e: unknown) => {
          if (seq !== requestSeqRef.current) return;
          setState({ url: null, loading: false, error: String(e) });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [photoId, maxPx]);

  return state;
}
