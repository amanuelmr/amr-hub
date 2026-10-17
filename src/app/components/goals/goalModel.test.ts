import { describe, expect, it } from "vitest";
import {
  computeGoalProgress,
  descendantGoalIds,
  goalProgressPercent,
  isGoalOverdue,
  sortGoals,
} from "./goalModel";

describe("goal progress", () => {
  it("counts done work items over the total", () => {
    const progress = computeGoalProgress(["DONE", "TODO", "IN_PROGRESS", "DONE"]);
    expect(progress).toEqual({ done: 2, total: 4 });
    expect(goalProgressPercent(progress)).toBe(50);
  });

  it("is zero with no linked work", () => {
    expect(goalProgressPercent(computeGoalProgress([]))).toBe(0);
  });
});

describe("descendantGoalIds", () => {
  it("collects the goal and every nested sub-goal", () => {
    const goals = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
      { id: "d", parentId: null },
    ];
    expect([...descendantGoalIds("a", goals)].sort()).toEqual(["a", "b", "c"]);
    expect([...descendantGoalIds("d", goals)]).toEqual(["d"]);
  });

  it("terminates on corrupt cyclic data", () => {
    const goals = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(descendantGoalIds("a", goals).size).toBe(2);
  });
});

describe("sortGoals", () => {
  it("puts active goals first, then soonest target date, then name", () => {
    const sorted = sortGoals([
      { name: "Done", status: "DONE" as const, targetDate: "2026-01-01" },
      { name: "No date", status: "ON_TRACK" as const, targetDate: null },
      { name: "Late", status: "AT_RISK" as const, targetDate: "2026-12-01" },
      { name: "Soon", status: "PENDING" as const, targetDate: "2026-11-01" },
    ]);
    expect(sorted.map((goal) => goal.name)).toEqual(["Soon", "Late", "No date", "Done"]);
  });
});

describe("isGoalOverdue", () => {
  it("flags open goals past their target date only", () => {
    expect(isGoalOverdue({ status: "ON_TRACK", targetDate: "2026-01-01" }, "2026-02-01")).toBe(true);
    expect(isGoalOverdue({ status: "DONE", targetDate: "2026-01-01" }, "2026-02-01")).toBe(false);
    expect(isGoalOverdue({ status: "ON_TRACK", targetDate: "2026-03-01" }, "2026-02-01")).toBe(false);
    expect(isGoalOverdue({ status: "ON_TRACK", targetDate: null }, "2026-02-01")).toBe(false);
  });
});
