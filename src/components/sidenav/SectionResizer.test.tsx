import { describe, expect, it, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { SectionResizer } from "./SectionResizer";
import { useLibraryStore } from "../../store/useLibraryStore";

function setHeight(el: HTMLElement, height: number, top: number) {
  el.getBoundingClientRect = () =>
    ({
      top,
      left: 0,
      right: 0,
      bottom: top + height,
      width: 100,
      height,
      x: 0,
      y: top,
      toJSON() { return {}; },
    }) as DOMRect;
}

describe("SectionResizer", () => {
  beforeEach(() => {
    useLibraryStore.setState({ foldersHeightPct: 50 });
    window.localStorage.clear();
  });

  it("pointer drag updates foldersHeightPct based on container pct position", () => {
    const container = document.createElement("div");
    setHeight(container, 200, 0);
    document.body.appendChild(container);

    const { getByRole } = render(
      <SectionResizer containerRef={{ current: container }} />,
    );

    const handle = getByRole("separator");
    // Prevent pointer capture in jsdom
    (handle as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture = () => {};
    (handle as unknown as { releasePointerCapture?: (id: number) => void }).releasePointerCapture = () => {};

    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 100 }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 140 }));
    expect(useLibraryStore.getState().foldersHeightPct).toBe(70);

    window.dispatchEvent(new PointerEvent("pointerup", { clientY: 140 }));
    expect(window.localStorage.getItem("archiva.sideNavSplit")).toBe("70");

    document.body.removeChild(container);
  });

  it("clamps below 20 and above 80", () => {
    const container = document.createElement("div");
    setHeight(container, 200, 0);
    document.body.appendChild(container);

    const { getByRole } = render(
      <SectionResizer containerRef={{ current: container }} />,
    );
    const handle = getByRole("separator");
    (handle as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture = () => {};

    handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientY: 100 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 10 }));
    expect(useLibraryStore.getState().foldersHeightPct).toBe(20);
    window.dispatchEvent(new PointerEvent("pointermove", { clientY: 1000 }));
    expect(useLibraryStore.getState().foldersHeightPct).toBe(80);

    document.body.removeChild(container);
  });
});
