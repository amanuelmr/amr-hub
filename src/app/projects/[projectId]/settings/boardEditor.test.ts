import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_CONFIG } from "../../../data/projects";
import {
  addColumn,
  assignStatus,
  moveColumn,
  newColumnId,
  unmappedStatuses,
} from "./boardEditor";

const columns = DEFAULT_BOARD_CONFIG.columns;

describe("board editor", () => {
  it("lists statuses not mapped to any column", () => {
    expect(unmappedStatuses(columns)).toEqual(["BACKLOG"]);
  });

  it("moves a status so it lives in exactly one column", () => {
    const next = assignStatus(columns, "IN_REVIEW", "in-progress");
    expect(
      next.find((column) => column.id === "in-progress")?.statuses,
    ).toEqual(["IN_PROGRESS", "IN_REVIEW"]);
    expect(next.find((column) => column.id === "in-review")?.statuses).toEqual(
      [],
    );
    expect(unmappedStatuses(assignStatus(columns, "DONE", null))).toContain(
      "DONE",
    );
  });

  it("creates unique column ids", () => {
    expect(newColumnId("Done", columns)).toBe("done-2");
    expect(newColumnId("  QA!  ", columns)).toBe("qa");
    expect(addColumn(columns, "QA").at(-1)).toEqual({
      id: "qa",
      name: "QA",
      statuses: [],
      wipLimit: null,
    });
  });

  it("reorders columns", () => {
    expect(
      moveColumn(columns, "done", "todo").map((column) => column.id),
    ).toEqual(["done", "todo", "in-progress", "in-review"]);
  });

  it("handles custom workflow statuses in the given order", () => {
    const order = ["BACKLOG", "OPEN", "IN_PROGRESS", "IN_PROGRESS:qa", "IN_REVIEW", "DONE"];
    expect(unmappedStatuses(columns, order)).toEqual(["BACKLOG", "IN_PROGRESS:qa"]);
    const next = assignStatus(columns, "IN_PROGRESS:qa", "in-progress", order);
    expect(next.find((column) => column.id === "in-progress")?.statuses).toEqual([
      "IN_PROGRESS",
      "IN_PROGRESS:qa",
    ]);
    expect(unmappedStatuses(next, order)).toEqual(["BACKLOG"]);
  });
});
