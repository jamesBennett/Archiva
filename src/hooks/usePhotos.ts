import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { listPhotos, scanFolder } from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";
import type { ScanResult } from "../types";

export function usePhotos() {
  const photos = useLibraryStore((s) => s.photos);
  const setPhotos = useLibraryStore((s) => s.setPhotos);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listPhotos();
      setPhotos(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [setPhotos]);

  const scan = useCallback(
    async (path: string): Promise<ScanResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await scanFolder(path);
        const rows = await listPhotos();
        setPhotos(rows);
        return result;
      } catch (e) {
        setError(String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [setPhotos],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Debounce thumb-ready events — batch rapid-fire updates into one refresh
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let cleanedUp = false;
    let unlisten: (() => void) | null = null;

    listen("thumb-ready", () => {
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
      thumbTimerRef.current = setTimeout(() => void refresh(), 400);
    }).then((fn) => {
      if (cleanedUp) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cleanedUp = true;
      unlisten?.();
      if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    };
  }, [refresh]);

  return { photos, loading, error, refresh, scan };
}
