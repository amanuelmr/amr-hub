import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_CONFIG, addColumnForStatus } from "../../data/projects";
import { DEFAULT_BOARD_VIEW, parseBoardView } from "./useBoardView";

describe("addColumnForStatus", () => {
  it("appends a column that only holds the new status", () => {
    const next = addColumnForStatus(DEFAULT_BOARD_CONFIG, "IN_PROGRESS:qa", "QA");
    expect(next.columns.at(-1)).toEqual({
      id: "col-qa",
      name: "QA",
      statuses: ["IN_PROGRESS:qa"],
      wipLimit: null,
    });
    expect(next.columns.length).toBe(DEFAULT_BOARD_CONFIG.columns.length + 1);
  });

  it("moves the status out of other columns and keeps ids unique", () => {
    const once = addColumnForStatus(DEFAULT_BOARD_CONFIG, "IN_PROGRESS:qa", "QA");
    const twice = addColumnForStatus(once, "IN_PROGRESS:qa", "QA again");
    expect(twice.columns.filter((column) => column.statuses.includes("IN_PROGRESS:qa"))).toHaveLength(1);
    expect(twice.columns.at(-1)?.id).toBe("col-qa-2");
  });
});

describe("parseBoardView", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(parseBoardView(null)).toEqual(DEFAULT_BOARD_VIEW);
    expect(parseBoardView("not json")).toEqual(DEFAULT_BOARD_VIEW);
    expect(parseBoardView('{"compact":true,"collapsedColumns":["a",3]}')).toEqual({
      daysInColumn: true,
      compact: true,
      collapsedColumns: ["a"],
    });
  });
});
