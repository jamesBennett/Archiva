import { useLibraryStore } from "../../store/useLibraryStore";
import { useDateTree } from "../../hooks/useDateTree";
import { DateTree } from "./DateTree";

export function FoldersSection() {
  const photos = useLibraryStore((s) => s.photos);
  const tree = useDateTree(photos);
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <h2 className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-muted">
        folders
      </h2>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <DateTree tree={tree} />
      </div>
    </section>
  );
}
