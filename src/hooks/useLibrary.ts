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
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const lib = await currentLibrary();
        if (!cleanedUp) setCurrentLibrary(lib);
      } catch (e) {
        if (!cleanedUp) setError(String(e));
      } finally {
        if (!cleanedUp) setLibraryLoading(false);
      }
    })();

    listen<LibraryInfo | null>("library-changed", (event) => {
      reset();
      setCurrentLibrary(event.payload);
      setLibraryLoading(false);
      void refreshRecents();
    }).then((fn) => {
      if (cleanedUp) fn();
      else unlisten = fn;
    });

    return () => {
      cleanedUp = true;
      unlisten?.();
    };
  }, [refreshRecents, reset, setCurrentLibrary, setLibraryLoading]);

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  const openAt = useCallback(async (path: string) => {
    setError(null);
    try {
      await openLibrary(path);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const createAt = useCallback(async (parentDir: string, name: string) => {
    setError(null);
    try {
      await createLibrary(parentDir, name);
    } catch (e) {
      setError(String(e));
    }
  }, []);

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
