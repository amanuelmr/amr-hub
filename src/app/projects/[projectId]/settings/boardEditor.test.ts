import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_CONFIG, parseBoardConfig } from "../../../data/projects";
import {
  addQuery,
  removeQuery,
  shiftQuery,
  toggleCardField,
  updateQuery,
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

describe("card layout and board queries", () => {
  it("caps extra card fields at three", () => {
    const fields = DEFAULT_BOARD_CONFIG.cardFields;
    expect(fields.filter((field) => ["labels", "subtasks", "dueDate"].includes(field))).toHaveLength(3);
    expect(toggleCardField(fields, "components")).toBe(fields);
    const fewer = toggleCardField(fields, "labels");
    expect(fewer).not.toContain("labels");
    expect(toggleCardField(fewer, "components")).toContain("components");
    expect(toggleCardField(fields, "epic")).not.toContain("epic");
  });

  it("adds, edits, reorders and removes queries", () => {
    let queries = addQuery([], { name: "Bugs", jql: "type = Bug" });
    queries = addQuery(queries, { name: "Mine", jql: "assignee = currentUser()" });
    expect(queries.map((query) => query.id)).toEqual(["q1", "q2"]);
    queries = updateQuery(queries, "q1", { name: "Only bugs" });
    expect(queries[0].name).toBe("Only bugs");
    queries = shiftQuery(queries, "q2", -1);
    expect(queries.map((query) => query.id)).toEqual(["q2", "q1"]);
    expect(shiftQuery(queries, "q2", -1)).toBe(queries);
    expect(removeQuery(queries, "q2").map((query) => query.id)).toEqual(["q1"]);
  });

  it("fills defaults for configs saved before the new keys", () => {
    const config = parseBoardConfig(
      JSON.stringify({ swimlanes: "EPIC", showBacklogColumn: true }),
    );
    expect(config.swimlanes).toBe("EPIC");
    expect(config.quickFilters).toEqual([]);
    expect(config.kanbanDoneDays).toBe(14);
    expect(config.parallelSprints).toBe(false);
    expect(config.cardColors.strategy).toBe("NONE");
  });
});
