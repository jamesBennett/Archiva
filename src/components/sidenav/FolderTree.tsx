import clsx from "clsx";
import type { FolderNode, FolderTree as FolderTreeData } from "../../types";
import { useLibraryStore } from "../../store/useLibraryStore";

interface Props {
  tree: FolderTreeData;
  /** Render every branch expanded (used while a search query is active). */
  forceExpand?: boolean;
}

export function FolderTree({ tree, forceExpand = false }: Props) {
  const activeSource = useLibraryStore((s) => s.activeSource);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);

  return (
    <ul className="flex flex-col text-sm">
      <li>
        <button
          type="button"
          onClick={() => setActiveSource({ kind: "library" })}
          className={clsx(
            "block w-full truncate rounded py-1 px-2 text-left",
            activeSource.kind === "library"
              ? "bg-accent text-white"
              : "hover:bg-panel-hover",
          )}
        >
          Library
        </button>
      </li>
      {tree.roots.map((node) => (
        <FolderRow key={node.path} node={node} depth={0} forceExpand={forceExpand} />
      ))}
      {forceExpand && tree.roots.length === 0 && (
        <li className="px-2 py-1 text-muted">No matches</li>
      )}
    </ul>
  );
}

function FolderRow({
  node,
  depth,
  forceExpand,
}: {
  node: FolderNode;
  depth: number;
  forceExpand: boolean;
}) {
  const activeSource = useLibraryStore((s) => s.activeSource);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);
  const expandedFolders = useLibraryStore((s) => s.expandedFolders);
  const toggleFolder = useLibraryStore((s) => s.toggleFolder);

  const hasChildren = node.children.length > 0;
  const isExpanded = forceExpand || expandedFolders.has(node.path);
  const isActive =
    activeSource.kind === "folder" && activeSource.path === node.path;

  return (
    <li>
      <div
        className={clsx("flex items-center", isActive && "bg-accent text-white rounded")}
        style={{ paddingLeft: depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`Expand ${node.name}`}
            onClick={() => toggleFolder(node.path)}
            className="flex h-7 w-5 items-center justify-center text-muted hover:text-white"
          >
            <span className={clsx("transition-transform", isExpanded && "rotate-90")}>
              ›
            </span>
          </button>
        ) : (
          <span className="w-5" />
        )}
        <button
          type="button"
          onClick={() => setActiveSource({ kind: "folder", path: node.path })}
          className={clsx(
            "flex-1 truncate py-1 pr-2 text-left",
            !isActive && "hover:bg-panel-hover rounded",
          )}
          title={node.path}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul className="flex flex-col">
          {node.children.map((child) => (
            <FolderRow
              key={child.path}
              node={child}
              depth={depth + 1}
              forceExpand={forceExpand}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
