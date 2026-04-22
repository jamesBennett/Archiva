import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTree } from "./DateTree";
import { useLibraryStore } from "../../store/useLibraryStore";
import type { DateTree as DateTreeData } from "../../types";

const tree: DateTreeData = {
  total: 4,
  noDateCount: 1,
  years: [
    { year: 2020, count: 1, months: [{ month: 6, count: 1 }] },
    {
      year: 2019,
      count: 2,
      months: [
        { month: 3, count: 1 },
        { month: 1, count: 1 },
      ],
    },
  ],
};

describe("DateTree", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      activeSource: { kind: "library" },
      expandedYears: new Set<number>(),
    });
  });

  it("renders Library, years, and No date row when noDateCount > 0", () => {
    render(<DateTree tree={tree} />);
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByText("2019")).toBeInTheDocument();
    expect(screen.getByText("No date")).toBeInTheDocument();
  });

  it("omits No date row when noDateCount is 0", () => {
    render(<DateTree tree={{ ...tree, noDateCount: 0 }} />);
    expect(screen.queryByText("No date")).not.toBeInTheDocument();
  });

  it("clicking a year sets activeSource to that year", async () => {
    const user = userEvent.setup();
    render(<DateTree tree={tree} />);
    await user.click(screen.getByText("2019"));
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "date",
      year: 2019,
    });
  });

  it("clicking the expand chevron toggles expandedYears without selecting", async () => {
    const user = userEvent.setup();
    render(<DateTree tree={tree} />);
    await user.click(screen.getByRole("button", { name: /expand 2019/i }));
    expect(useLibraryStore.getState().expandedYears.has(2019)).toBe(true);
    expect(screen.getByText("March")).toBeInTheDocument();
  });

  it("clicking a month sets activeSource to that year+month", async () => {
    const user = userEvent.setup();
    useLibraryStore.setState({ expandedYears: new Set([2019]) });
    render(<DateTree tree={tree} />);
    await user.click(screen.getByText("March"));
    expect(useLibraryStore.getState().activeSource).toEqual({
      kind: "date",
      year: 2019,
      month: 3,
    });
  });
});
