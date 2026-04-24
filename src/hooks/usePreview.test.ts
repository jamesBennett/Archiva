import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePreview } from "./usePreview";

vi.mock("../lib/tauri", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauri")>("../lib/tauri");
  return {
    ...actual,
    generatePreview: vi.fn(),
    thumbUrl: (p: string | null) => (p ? `asset://${p}` : null),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));

import { generatePreview } from "../lib/tauri";

describe("usePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(generatePreview).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns url once invoke resolves", async () => {
    vi.mocked(generatePreview).mockResolvedValue("/tmp/previews/p1_1024.jpg");

    const { result } = renderHook(() => usePreview("p1", 900));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.url).toBe("asset:///tmp/previews/p1_1024.jpg");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error on rejection", async () => {
    vi.mocked(generatePreview).mockRejectedValue(new Error("sips exit 1"));

    const { result } = renderHook(() => usePreview("p1", 900));
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.error).toContain("sips");
    expect(result.current.url).toBeNull();
  });

  it("drops stale response when photoId changes mid-flight", async () => {
    let resolveFirst: (v: string) => void = () => {};
    vi.mocked(generatePreview)
      .mockImplementationOnce(
        () =>
          new Promise<string>((res) => {
            resolveFirst = res;
          }),
      )
      .mockResolvedValueOnce("/tmp/previews/p2_1024.jpg");

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePreview(id, 900),
      { initialProps: { id: "p1" } },
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    rerender({ id: "p2" });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    resolveFirst("/tmp/previews/p1_1024.jpg");
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.url).toBe("asset:///tmp/previews/p2_1024.jpg");
  });

  it("debounces rapid maxPx changes (only trailing call invokes)", async () => {
    vi.mocked(generatePreview).mockResolvedValue("/tmp/previews/p1_2048.jpg");

    const { rerender } = renderHook(
      ({ maxPx }: { maxPx: number }) => usePreview("p1", maxPx),
      { initialProps: { maxPx: 900 } },
    );

    rerender({ maxPx: 1100 });
    rerender({ maxPx: 1300 });
    rerender({ maxPx: 1600 });

    expect(generatePreview).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(generatePreview).toHaveBeenCalledTimes(1);
    expect(generatePreview).toHaveBeenLastCalledWith("p1", 1600);
  });

  it("returns null url when photoId is null", () => {
    const { result } = renderHook(() => usePreview(null, 900));
    expect(result.current.url).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(generatePreview).not.toHaveBeenCalled();
  });
});
