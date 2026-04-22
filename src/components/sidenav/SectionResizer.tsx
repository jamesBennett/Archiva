import { useEffect, useRef, type RefObject } from "react";
import { useLibraryStore } from "../../store/useLibraryStore";

interface Props {
  containerRef: RefObject<HTMLElement | null>;
}

export function SectionResizer({ containerRef }: Props) {
  const setFoldersHeightPct = useLibraryStore((s) => s.setFoldersHeightPct);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return;
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setFoldersHeightPct(pct);
    }
    function onUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [containerRef, setFoldersHeightPct]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      className="relative flex h-2 cursor-row-resize items-center justify-center border-y border-border bg-panel select-none"
    >
      <span className="text-[8px] leading-none tracking-[2px] text-muted">⋮⋮</span>
    </div>
  );
}
