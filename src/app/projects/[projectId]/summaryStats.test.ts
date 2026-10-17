import { describe, expect, it } from "vitest";
import type { Issue } from "../../data/issues";
import { computeProjectSummary, groupByDay } from "./summaryStats";

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "ENG-1",
    title: "Issue",
    description: "",
    status: "OPEN",
    priority: "MEDIUM",
    kind: "TASK",
    assignee: null,
    creator: null,
    dueDate: null,
    estimate: null,
    projectId: "p1",
    cycleId: null,
    labels: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    parentId: null,
    parent: null,
    fixVersion: null,
    team: null,
    goal: null,
    components: [],
    startDate: null,
    rank: 0,
    flagged: false,
    resolution: null,
    resolvedAt: null,
    environment: null,
    originalEstimateMinutes: null,
    remainingEstimateMinutes: null,
    timeSpentMinutes: 0,
    childCount: 0,
    doneChildCount: 0,
    ...overrides,
  };
}

const now = new Date("2026-10-16T12:00:00.000Z");
const ada = { id: "m1", name: "Ada", email: "ada@example.com" };

describe("computeProjectSummary", () => {
  const summary = computeProjectSummary(
    [
      issue({ id: "ENG-1", kind: "EPIC", status: "IN_PROGRESS" }),
      issue({
        id: "ENG-2",
        parentId: "ENG-1",
        status: "DONE",
        resolvedAt: "2026-10-15T00:00:00.000Z",
        updatedAt: "2026-10-15T00:00:00.000Z",
        assignee: ada,
      }),
      issue({
        id: "ENG-3",
        parentId: "ENG-1",
        kind: "BUG",
        priority: "HIGH",
        createdAt: "2026-10-14T00:00:00.000Z",
        dueDate: "2026-10-18T12:00:00.000Z",
        assignee: ada,
      }),
    ],
    now,
  );

  it("counts the 7-day stat strip", () => {
    expect(summary.doneLast7).toBe(1);
    expect(summary.updatedLast7).toBe(1);
    expect(summary.createdLast7).toBe(1);
    expect(summary.dueNext7).toBe(1);
  });

  it("breaks issues down by category, priority and type", () => {
    expect(summary.byCategory).toEqual({ TODO: 1, IN_PROGRESS: 1, DONE: 1 });
    expect(summary.byPriority.HIGH).toBe(1);
    expect(summary.byKind).toMatchObject({ EPIC: 1, TASK: 1, BUG: 1 });
  });

  it("computes open workload including unassigned", () => {
    expect(summary.workload).toEqual([
      { id: "m1", name: "Ada", count: 1, percent: 50 },
      { id: null, name: "Unassigned", count: 1, percent: 50 },
    ]);
  });

  it("tracks epic progress from children", () => {
    expect(summary.epics).toEqual([
      { id: "ENG-1", kind: "EPIC", title: "Issue", total: 2, done: 1 },
    ]);
  });
});

describe("groupByDay", () => {
  it("labels Today, Yesterday and older dates in order", () => {
    const now = new Date(2026, 9, 16, 15, 0);
    const groups = groupByDay(
      [
        { createdAt: new Date(2026, 9, 16, 9, 0).toISOString() },
        { createdAt: new Date(2026, 9, 16, 1, 0).toISOString() },
        { createdAt: new Date(2026, 9, 15, 22, 0).toISOString() },
        { createdAt: new Date(2026, 9, 12, 10, 0).toISOString() },
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Monday, Oct 12", 1],
    ]);
  });
});
