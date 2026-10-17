import { describe, expect, it } from "vitest";
import {
  findCurrentCycle,
  findPlanningCycle,
  getCycleMetrics,
  getCyclePhase,
} from "./cycles";
import type { Cycle, Issue } from "./issues";

const currentCycle: Cycle = {
  id: "cycle-30",
  name: "Cycle 30",
  startDate: "2026-07-21T00:00:00.000Z",
  endDate: "2026-08-03T23:59:59.999Z",
  capacity: 10,
  projectId: "project-1",
};

const upcomingCycle: Cycle = {
  id: "cycle-31",
  name: "Cycle 31",
  startDate: "2026-08-04T00:00:00.000Z",
  endDate: "2026-08-17T23:59:59.999Z",
  capacity: 12,
  projectId: "project-1",
};

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "AMR-1",
    title: "A clear issue title",
    description: "Enough context to make this issue actionable.",
    status: "OPEN",
    priority: "MEDIUM",
    kind: "TASK",
    assignee: null,
    creator: null,
    dueDate: null,
    estimate: 3,
    projectId: "project-1",
    cycleId: currentCycle.id,
    labels: [],
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
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

describe("cycle selection", () => {
  it("classifies dates at cycle boundaries", () => {
    expect(
      getCyclePhase(currentCycle, new Date(currentCycle.startDate)),
    ).toBe("current");
    expect(getCyclePhase(currentCycle, new Date(currentCycle.endDate))).toBe(
      "current",
    );
    expect(getCyclePhase(currentCycle, new Date("2026-08-04T00:00:00Z"))).toBe(
      "past",
    );
  });

  it("returns only an active cycle as current", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");

    expect(findCurrentCycle([currentCycle, upcomingCycle], now)?.id).toBe(
      currentCycle.id,
    );
    expect(
      findCurrentCycle(
        [currentCycle, upcomingCycle],
        new Date("2026-08-20T12:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("uses the next cycle as the planning default between cycles", () => {
    expect(
      findPlanningCycle(
        [currentCycle, upcomingCycle],
        new Date("2026-08-04T00:00:00.000Z"),
      )?.id,
    ).toBe(upcomingCycle.id);
  });
});

describe("getCycleMetrics", () => {
  it("calculates scope, completion, capacity, and delivery risk", () => {
    const metrics = getCycleMetrics(
      currentCycle,
      [
        issue({ id: "AMR-1", status: "DONE", estimate: 3 }),
        issue({ id: "AMR-2", priority: "URGENT", estimate: 5 }),
        issue({
          id: "AMR-3",
          dueDate: "2026-07-27T12:00:00.000Z",
          estimate: null,
        }),
        issue({ id: "AMR-4", cycleId: upcomingCycle.id, estimate: 8 }),
      ],
      new Date("2026-07-26T12:00:00.000Z"),
    );

    expect(metrics.issues).toHaveLength(3);
    expect(metrics.plannedPoints).toBe(8);
    expect(metrics.completedPoints).toBe(3);
    expect(metrics.remainingPoints).toBe(5);
    expect(metrics.completionPercent).toBe(38);
    expect(metrics.capacityPercent).toBe(80);
    expect(metrics.atRisk).toBe(2);
    expect(metrics.unestimated).toBe(1);
    expect(metrics.elapsedDays).toBe(6);
    expect(metrics.totalDays).toBe(14);
  });
});
