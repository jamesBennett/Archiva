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
  const [state, setState] = useState<UsePreviewResult & { photoId: string | null }>({
    photoId: null,
    url: null,
    loading: false,
    error: null,
  });
  const requestSeqRef = useRef(0);

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    if (!photoId || maxPx <= 0) {
      setState({ photoId, url: null, loading: false, error: null });
      return;
    }

    setState((s) => ({
      photoId, url: s.photoId === photoId ? s.url : null, loading: true, error: null,
    }));

    const timer = setTimeout(() => {
      generatePreview(photoId, maxPx)
        .then((path) => {
          if (seq !== requestSeqRef.current) return;
          setState({ photoId, url: convertFileSrc(path), loading: false, error: null });
        })
        .catch((e: unknown) => {
          if (seq !== requestSeqRef.current) return;
          setState({ photoId, url: null, loading: false, error: String(e) });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ++requestSeqRef.current;
    };
  }, [photoId, maxPx]);

  // Never show the previous photo while the next request is starting.
  return state.photoId === photoId && maxPx > 0
    ? state
    : { url: null, loading: !!photoId && maxPx > 0, error: null };
}
