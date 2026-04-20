import "@testing-library/jest-dom/vitest";

// Node v25 exposes a broken `localStorage` global (--localstorage-file without a
// valid path) that shadows jsdom's working implementation. Replace it with a simple
// in-memory store so tests can use window.localStorage normally.
if (typeof window !== "undefined" && typeof window.localStorage?.setItem !== "function") {
  const store: Record<string, string> = {};
  const mock: Storage = {
    length: 0,
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; (mock as { length: number }).length = Object.keys(store).length; },
    removeItem: (k: string) => { delete store[k]; (mock as { length: number }).length = Object.keys(store).length; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); (mock as { length: number }).length = 0; },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => mock });
}
