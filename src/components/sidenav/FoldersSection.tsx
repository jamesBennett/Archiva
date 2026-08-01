import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useDateTree } from "../../hooks/useDateTree";
import { useFolderTree } from "../../hooks/useFolderTree";
import { DateTree } from "./DateTree";
import { FolderTree } from "./FolderTree";

export function FoldersSection() {
  const photos = useLibraryStore((s) => s.photos);
  const foldersTab = useLibraryStore((s) => s.foldersTab);
  const setFoldersTab = useLibraryStore((s) => s.setFoldersTab);
  const [query, setQuery] = useState("");
  const dateTree = useDateTree(photos);
  const folderTree = useFolderTree(photos, query);
  const searching = query.trim().length > 0;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <h2 className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-muted">
        folders
      </h2>
      <Tabs.Root
        value={foldersTab}
        onValueChange={(v) => setFoldersTab(v as "date" | "folder")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="mx-2 mb-1 flex gap-1 border-b border-border text-xs">
          <TabTrigger value="date" label="By Year" />
          <TabTrigger value="folder" label="By Folder" />
        </Tabs.List>
        <Tabs.Content value="date" className="min-h-0 flex-1 overflow-auto px-1 pb-2">
          <DateTree tree={dateTree} />
        </Tabs.Content>
        <Tabs.Content
          value="folder"
          className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <div className="px-2 pb-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search folders and files"
              aria-label="Search folders and files"
              className={clsx(
                "w-full rounded border border-border bg-panel px-2 py-1 text-xs",
                "placeholder:text-muted focus:border-accent focus:outline-none",
              )}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
            <FolderTree tree={folderTree} forceExpand={searching} />
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}

function TabTrigger({ value, label }: { value: string; label: string }) {
  return (
    <Tabs.Trigger
      value={value}
      className={clsx(
        "-mb-px rounded-t border-b-2 border-transparent px-2 py-1 text-muted",
        "hover:text-white",
        "data-[state=active]:border-accent data-[state=active]:text-white",
      )}
    >
      {label}
    </Tabs.Trigger>
  );
}
