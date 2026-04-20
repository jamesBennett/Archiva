import { useRef } from "react";
import { useLibraryStore } from "../../store/useLibraryStore";
import { FoldersSection } from "./FoldersSection";
import { AlbumsSection } from "./AlbumsSection";
import { SectionResizer } from "./SectionResizer";

export function SideNavSplit() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const foldersHeightPct = useLibraryStore((s) => s.foldersHeightPct);
  const bottomPct = 100 - foldersHeightPct;

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col"
      style={{
        display: "grid",
        gridTemplateRows: `${foldersHeightPct}fr 8px ${bottomPct}fr`,
      }}
    >
      <FoldersSection />
      <SectionResizer containerRef={containerRef} />
      <AlbumsSection />
    </div>
  );
}
