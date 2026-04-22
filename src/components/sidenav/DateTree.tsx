import clsx from "clsx";
import type { DateTree as DateTreeData, YearNode } from "../../types";
import { useLibraryStore } from "../../store/useLibraryStore";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  tree: DateTreeData;
}

export function DateTree({ tree }: Props) {
  const activeSource = useLibraryStore((s) => s.activeSource);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);

  const libraryActive = activeSource.kind === "library";
  const noDateActive = activeSource.kind === "no-date";

  return (
    <ul className="flex flex-col text-sm">
      <li>
        <Row
          label="Library"
          active={libraryActive}
          onClick={() => setActiveSource({ kind: "library" })}
        />
      </li>
      {tree.years.map((year) => (
        <YearRow key={year.year} year={year} />
      ))}
      {tree.noDateCount > 0 && (
        <li>
          <Row
            label="No date"
            active={noDateActive}
            onClick={() => setActiveSource({ kind: "no-date" })}
          />
        </li>
      )}
    </ul>
  );
}

function YearRow({ year }: { year: YearNode }) {
  const activeSource = useLibraryStore((s) => s.activeSource);
  const setActiveSource = useLibraryStore((s) => s.setActiveSource);
  const expandedYears = useLibraryStore((s) => s.expandedYears);
  const toggleYear = useLibraryStore((s) => s.toggleYear);

  const isExpanded = expandedYears.has(year.year);
  const isActive =
    activeSource.kind === "date" &&
    activeSource.year === year.year &&
    activeSource.month === undefined;

  return (
    <li>
      <div className={clsx("flex items-center", isActive && "bg-accent text-white rounded")}>
        <button
          type="button"
          aria-label={`Expand ${year.year}`}
          onClick={() => toggleYear(year.year)}
          className="flex h-7 w-5 items-center justify-center text-muted hover:text-white"
        >
          <span className={clsx("transition-transform", isExpanded && "rotate-90")}>›</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSource({ kind: "date", year: year.year })}
          className={clsx(
            "flex-1 truncate py-1 pr-2 text-left",
            !isActive && "hover:bg-panel-hover rounded",
          )}
        >
          {year.year}
        </button>
      </div>
      {isExpanded && (
        <ul className="ml-6 flex flex-col">
          {year.months.map((m) => {
            const monthActive =
              activeSource.kind === "date" &&
              activeSource.year === year.year &&
              activeSource.month === m.month;
            return (
              <li key={m.month}>
                <Row
                  label={MONTH_NAMES[m.month - 1]!}
                  active={monthActive}
                  onClick={() =>
                    setActiveSource({ kind: "date", year: year.year, month: m.month })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Row({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "block w-full truncate rounded py-1 px-2 text-left",
        active ? "bg-accent text-white" : "hover:bg-panel-hover",
      )}
    >
      {label}
    </button>
  );
}
