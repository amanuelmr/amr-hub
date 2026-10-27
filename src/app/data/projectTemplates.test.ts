import { describe, expect, it } from "vitest";
import {
  PROJECT_TEMPLATES,
  findProjectTemplate,
  templateColumns,
  templateStatuses,
  templateTypes,
} from "./projectTemplates";

describe("project templates", () => {
  it("keeps every built-in status and renames them", () => {
    const service = findProjectTemplate("it-service");
    const statuses = templateStatuses(service);
    expect(statuses.map((status) => status.key)).toEqual(["BACKLOG", "OPEN", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
    expect(statuses.find((status) => status.key === "DONE")?.name).toBe("Resolved");
    expect(templateStatuses(null).find((status) => status.key === "OPEN")?.name).toBe("To do");
  });

  it("starts with the template's work types plus subtasks", () => {
    const types = templateTypes(findProjectTemplate("it-service"));
    expect(types.map((type) => [type.key, type.name, type.position])).toEqual([
      ["TASK", "Service request", 0],
      ["BUG", "Incident", 1],
      ["SUBTASK", "Subtask", 2],
    ]);
    expect(templateTypes(null)).toHaveLength(5);
  });

  it("builds one named column per status", () => {
    const columns = templateColumns(findProjectTemplate("task-tracking")!);
    expect(columns.map((column) => [column.name, column.statuses])).toEqual([
      ["To do", ["OPEN"]],
      ["Doing", ["IN_PROGRESS"]],
      ["Done", ["DONE"]],
    ]);
  });

  it("gives every template a standard work type and a done column", () => {
    for (const template of PROJECT_TEMPLATES) {
      expect(templateTypes(template).some((type) => type.level === 0)).toBe(true);
      expect(template.columns).toContain("DONE");
    }
    expect(findProjectTemplate("nope")).toBeNull();
  });
});
