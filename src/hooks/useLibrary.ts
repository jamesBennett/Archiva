import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import {
  closeLibrary,
  createLibrary,
  currentLibrary,
  listRecentLibraries,
  openLibrary,
  revealLibrary,
} from "../lib/tauri";
import { useLibraryStore } from "../store/useLibraryStore";
import type { LibraryInfo, RecentLibraryInfo } from "../types";

export function useLibrary() {
  const current = useLibraryStore((s) => s.currentLibrary);
  const loading = useLibraryStore((s) => s.libraryLoading);
  const setCurrentLibrary = useLibraryStore((s) => s.setCurrentLibrary);
  const setLibraryLoading = useLibraryStore((s) => s.setLibraryLoading);
  const reset = useLibraryStore((s) => s.reset);
  const [recents, setRecents] = useState<RecentLibraryInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshRecents = useCallback(async () => {
    try {
      setRecents(await listRecentLibraries());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // Initial resolve: startup opening happens on the Rust side; ask once, then
  // rely on library-changed events.
  useEffect(() => {
    let cleanedUp = false;
    let gotEvent = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        // Listener first: registering after the fetch would drop an event
        // emitted between the two IPC round-trips.
        const fn = await listen<LibraryInfo | null>("library-changed", (event) => {
          gotEvent = true;
          reset();
          setCurrentLibrary(event.payload);
          setLibraryLoading(false);
          void refreshRecents();
        });
        if (cleanedUp) {
          fn();
          return;
        }
        unlisten = fn;

        const lib = await currentLibrary();
        // An event that landed while the fetch was in flight is newer — keep it.
        if (!cleanedUp && !gotEvent) {
          setCurrentLibrary(lib);
          setLibraryLoading(false);
        }
      } catch (e) {
        if (!cleanedUp && !gotEvent) {
          setError(String(e));
          setLibraryLoading(false);
        }
      }
    })();

    return () => {
      cleanedUp = true;
      unlisten?.();
    };
  }, [refreshRecents, reset, setCurrentLibrary, setLibraryLoading]);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  // Return false rather than throwing so callers can keep their UI open on
  // failure; the message is in `error`.
  const openAt = useCallback(async (path: string): Promise<boolean> => {
    setError(null);
    try {
      await openLibrary(path);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  const createAt = useCallback(
    async (parentDir: string, name: string): Promise<boolean> => {
      setError(null);
      try {
        await createLibrary(parentDir, name);
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      }
    },
    [],
  );

  const close = useCallback(async () => {
    try {
      await closeLibrary();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const reveal = useCallback(async () => {
    try {
      await revealLibrary();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  return { current, loading, recents, error, refreshRecents, openAt, createAt, close, reveal };
}
