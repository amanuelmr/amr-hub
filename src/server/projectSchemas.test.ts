import { describe, expect, it } from "vitest";
import {
  boardConfigSchema,
  createCycleSchema,
  createProjectSchema,
} from "./projectSchemas";

describe("createProjectSchema", () => {
  it("accepts a minimal project", () => {
    const result = createProjectSchema.safeParse({
      key: "eng",
      name: "Engineering",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.key).toBe("ENG");
  });

  it.each([
    ["single-letter key", { key: "E" }],
    ["key with a leading digit", { key: "1ENG" }],
    ["too-long key", { key: "ENGINEERING" }],
    ["short name", { name: "A" }],
    ["invalid color", { color: "blue" }],
    ["malformed target date", { targetDate: "2026-13-01" }],
  ])("rejects %s", (_, change) => {
    const result = createProjectSchema.safeParse({
      key: "eng",
      name: "Engineering",
      ...change,
    });

    expect(result.success).toBe(false);
  });

  it("rejects fields outside the public API contract", () => {
    const result = createProjectSchema.safeParse({
      key: "eng",
      name: "Engineering",
      status: "COMPLETED",
    });

    expect(result.success).toBe(false);
  });
});

describe("createCycleSchema", () => {
  const validCycle = {
    projectId: "project-1",
    name: "Cycle 1",
    startDate: "2026-08-01",
    endDate: "2026-08-14",
    capacity: 40,
  };

  it("accepts a valid cycle", () => {
    expect(createCycleSchema.safeParse(validCycle).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = createCycleSchema.safeParse({
      ...validCycle,
      startDate: "2026-08-14",
      endDate: "2026-08-01",
    });

    expect(result.success).toBe(false);
  });
});

describe("boardConfigSchema", () => {
  const base = {
    swimlanes: "NONE",
    showBacklogColumn: false,
    estimation: "STORY_POINTS",
  };

  it("accepts empty columns and rejects a status mapped twice", () => {
    expect(
      boardConfigSchema.safeParse({
        ...base,
        columns: [
          { id: "a", name: "To do", statuses: ["OPEN"], wipLimit: null },
          { id: "b", name: "Parking", statuses: [], wipLimit: 3 },
        ],
      }).success,
    ).toBe(true);
    expect(
      boardConfigSchema.safeParse({
        ...base,
        columns: [
          { id: "a", name: "To do", statuses: ["OPEN"], wipLimit: null },
          { id: "b", name: "Also", statuses: ["OPEN"], wipLimit: null },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates card layout, quick filters and JQL", () => {
    const columns = [
      { id: "a", name: "To do", statuses: ["OPEN"], wipLimit: null },
    ];
    expect(
      boardConfigSchema.safeParse({
        ...base,
        columns,
        swimlanes: "QUERY",
        cardFields: ["epic", "labels", "dueDate", "subtasks"],
        cardColors: {
          strategy: "QUERY",
          queries: [{ id: "q1", name: "Bugs", jql: "type = Bug", color: "#ff0000" }],
        },
        quickFilters: [{ id: "q1", name: "Mine", jql: "assignee = currentUser()" }],
        swimlaneQueries: [{ id: "q1", name: "Bugs", jql: "type = Bug" }],
        kanbanDoneDays: 14,
        parallelSprints: true,
      }).success,
    ).toBe(true);
    expect(
      boardConfigSchema.safeParse({
        ...base,
        columns,
        cardFields: ["labels", "dueDate", "subtasks", "components"],
      }).success,
    ).toBe(false);
    expect(
      boardConfigSchema.safeParse({
        ...base,
        columns,
        quickFilters: [{ id: "q1", name: "Broken", jql: "priority = = High" }],
      }).success,
    ).toBe(false);
  });
});
