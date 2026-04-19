import { useCallback, useEffect, useState } from "react";
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

  return { photos, loading, error, refresh, scan };
}
