import { describe, expect, it } from "vitest";
import type { Cycle, Issue, IssueActivity, SavedView } from "./issues";
import {
  applySavedView,
  bucketKey,
  buildBurndown,
  buildControlChart,
  buildCreatedVsResolved,
  buildCumulativeFlow,
  buildSprintHealth,
  buildSprintReport,
  buildTimeTracking,
  buildTwoDimensional,
  buildVelocity,
  buildWorkload,
  cycleHistory,
  eachBucketKey,
  eachDayKey,
  estimateHistory,
  groupIssues,
  median,
  parseCycleChange,
  parseEstimateChange,
  parseStatusChange,
  resolutionTime,
  rollingAverage,
  statusHistory,
  valueAt,
} from "./reports";

let activitySequence = 0;

function event(
  type: IssueActivity["type"],
  description: string,
  createdAt: string,
): IssueActivity {
  activitySequence += 1;
  return {
    id: `activity-${activitySequence}`,
    type,
    description,
    actor: "Ada",
    createdAt,
  };
}

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "AMR-1",
    title: "Issue",
    description: "",
    status: "OPEN",
    priority: "MEDIUM",
    kind: "TASK",
    assignee: null,
    creator: null,
    dueDate: null,
    estimate: null,
    projectId: "project-1",
    cycleId: null,
    labels: [],
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
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
    customFields: {},
    activity: [],
    ...overrides,
  };
}

const sprint: Cycle = {
  id: "cycle-1",
  name: "Sprint 1",
  startDate: "2026-07-06T00:00:00.000Z",
  endDate: "2026-07-10T23:59:59.999Z",
  capacity: 20,
  projectId: "project-1",
  state: "ACTIVE",
  startedAt: "2026-07-06T08:00:00.000Z",
};

const sprint10: Cycle = {
  ...sprint,
  id: "cycle-10",
  name: "Sprint 10",
  state: "FUTURE",
  startedAt: null,
};

describe("date bucketing", () => {
  it("lists inclusive UTC day keys", () => {
    expect(
      eachDayKey("2026-07-30T23:00:00.000Z", "2026-08-02T01:00:00.000Z"),
    ).toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"]);
  });

  it("buckets weeks to Monday and months to the first", () => {
    expect(bucketKey("2026-07-12T12:00:00.000Z", "week")).toBe("2026-07-06");
    expect(bucketKey("2026-07-06T00:00:00.000Z", "week")).toBe("2026-07-06");
    expect(bucketKey("2026-07-19T10:00:00.000Z", "month")).toBe("2026-07-01");
    expect(bucketKey("2026-07-19T10:00:00.000Z", "day")).toBe("2026-07-19");
  });

  it("dedupes bucket keys across a range", () => {
    expect(
      eachBucketKey("2026-07-01T00:00:00Z", "2026-07-20T00:00:00Z", "week"),
    ).toEqual(["2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20"]);
  });
});

describe("rolling average and median", () => {
  it("averages over a trailing window", () => {
    expect(rollingAverage([2, 4, 6, 8], 2)).toEqual([2, 3, 5, 7]);
    expect(rollingAverage([3, 3, 9], 5)).toEqual([3, 3, 5]);
    expect(rollingAverage([], 3)).toEqual([]);
  });

  it("computes medians", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("activity parsing", () => {
  it("parses status changes by label", () => {
    expect(parseStatusChange("changed status from To do to In progress")).toEqual({
      from: "OPEN",
      to: "IN_PROGRESS",
    });
    expect(parseStatusChange("updated issue details")).toBeNull();
  });

  it("parses cycle changes", () => {
    expect(parseCycleChange("moved the issue to Sprint 10")).toEqual({
      kind: "moved",
      to: "Sprint 10",
    });
    expect(parseCycleChange("removed the issue from Sprint 1")).toEqual({
      kind: "removed",
      from: "Sprint 1",
    });
    expect(parseCycleChange("removed the issue from its cycle")).toEqual({
      kind: "removed",
      from: null,
    });
  });

  it("parses estimate changes", () => {
    expect(parseEstimateChange("set the estimate to 1 point")).toEqual({ estimate: 1 });
    expect(parseEstimateChange("set the estimate to 8 points")).toEqual({ estimate: 8 });
    expect(parseEstimateChange("removed the estimate")).toEqual({ estimate: null });
  });
});

describe("history reconstruction", () => {
  const worked = issue({
    status: "DONE",
    activity: [
      event("STATUS_CHANGED", "changed status from In progress to Done", "2026-07-04T10:00:00.000Z"),
      event("STATUS_CHANGED", "changed status from To do to In progress", "2026-07-02T10:00:00.000Z"),
    ],
  });

  it("orders status transitions from creation", () => {
    const history = statusHistory(worked);
    expect(history.map((entry) => entry.value)).toEqual(["OPEN", "IN_PROGRESS", "DONE"]);
    expect(valueAt(history, Date.parse("2026-07-03T00:00:00.000Z"))).toBe("IN_PROGRESS");
    expect(valueAt(history, Date.parse("2026-06-01T00:00:00.000Z"))).toBeUndefined();
  });

  it("uses the last transition into Done as the resolution time", () => {
    expect(resolutionTime(worked)).toBe(Date.parse("2026-07-04T10:00:00.000Z"));
    expect(resolutionTime(issue({ status: "OPEN" }))).toBeNull();
  });

  it("falls back to resolvedAt when no status rows exist", () => {
    const history = statusHistory(
      issue({ status: "DONE", resolvedAt: "2026-07-03T00:00:00.000Z" }),
    );
    expect(history.map((entry) => entry.value)).toEqual(["OPEN", "DONE"]);
  });

  it("maps cycle names to ids exactly (Sprint 1 vs Sprint 10)", () => {
    const names = new Map([
      ["Sprint 1", "cycle-1"],
      ["Sprint 10", "cycle-10"],
    ]);
    const history = cycleHistory(
      issue({
        cycleId: "cycle-10",
        activity: [
          event("CYCLE_CHANGED", "moved the issue to Sprint 1", "2026-07-02T00:00:00.000Z"),
          event("CYCLE_CHANGED", "moved the issue to Sprint 10", "2026-07-08T00:00:00.000Z"),
        ],
      }),
      names,
    );
    expect(history.map((entry) => entry.value)).toEqual([null, "cycle-1", "cycle-10"]);
  });

  it("treats the estimate before the first edit as unknown", () => {
    const history = estimateHistory(
      issue({
        estimate: 5,
        activity: [event("ESTIMATE_CHANGED", "set the estimate to 5 points", "2026-07-07T00:00:00.000Z")],
      }),
    );
    expect(history.map((entry) => entry.value)).toEqual([null, 5]);
    expect(estimateHistory(issue({ estimate: 3 })).map((entry) => entry.value)).toEqual([3]);
  });
});

function sprintIssues() {
  return [
    issue({
      id: "AMR-1",
      estimate: 5,
      cycleId: "cycle-1",
      status: "DONE",
      activity: [
        event("STATUS_CHANGED", "changed status from To do to Done", "2026-07-08T12:00:00.000Z"),
      ],
    }),
    issue({ id: "AMR-2", estimate: 3, cycleId: "cycle-1" }),
    issue({
      id: "AMR-3",
      estimate: 2,
      cycleId: "cycle-1",
      createdAt: "2026-07-07T09:00:00.000Z",
    }),
    issue({
      id: "AMR-4",
      estimate: 8,
      cycleId: null,
      activity: [
        event("CYCLE_CHANGED", "moved the issue to Sprint 1", "2026-07-02T00:00:00.000Z"),
        event("CYCLE_CHANGED", "removed the issue from Sprint 1", "2026-07-09T00:00:00.000Z"),
      ],
    }),
    issue({ id: "AMR-5", estimate: 13, cycleId: "cycle-10" }),
  ];
}

describe("burndown", () => {
  const now = new Date("2026-07-09T18:00:00.000Z");
  const result = buildBurndown(sprint, sprintIssues(), [sprint, sprint10], now);

  it("commits the scope present at sprint start", () => {
    expect(result.committed).toBe(16);
    expect(result.points[0].guideline).toBe(16);
    expect(result.points.at(-1)?.guideline).toBe(0);
  });

  it("reconstructs remaining points per day", () => {
    const remaining = result.points.map((point) => point.remaining);
    expect(remaining).toEqual([16, 18, 13, 5, null]);
  });

  it("marks scope changes after the sprint starts", () => {
    expect(
      result.scopeChanges.map((change) => [change.issueId, change.delta, change.reason]),
    ).toEqual([
      ["AMR-3", 2, "added"],
      ["AMR-4", -8, "removed"],
    ]);
  });
});

describe("sprint report", () => {
  it("splits completed, incomplete, removed and added issues", () => {
    const report = buildSprintReport(
      sprint,
      sprintIssues(),
      [sprint, sprint10],
      new Date("2026-07-09T18:00:00.000Z"),
    );
    expect(report.completed.map((item) => item.issue.id)).toEqual(["AMR-1"]);
    expect(report.notCompleted.map((item) => item.issue.id)).toEqual(["AMR-2", "AMR-3"]);
    expect(report.removed.map((item) => item.issue.id)).toEqual(["AMR-4"]);
    expect(report.addedAfterStart.map((item) => item.issue.id)).toEqual(["AMR-3"]);
    expect(report.completedPoints).toBe(5);
  });
});

describe("velocity", () => {
  it("prefers stored sprint totals and falls back to issues", () => {
    const closedStored: Cycle = {
      ...sprint,
      id: "cycle-0",
      name: "Sprint 0",
      state: "CLOSED",
      committedPoints: 12,
      completedPoints: 9,
      completedAt: "2026-07-05T00:00:00.000Z",
    };
    const closedComputed: Cycle = {
      ...sprint,
      state: "CLOSED",
      completedAt: "2026-07-11T00:00:00.000Z",
    };
    const velocity = buildVelocity(
      [closedComputed, closedStored, sprint10],
      sprintIssues(),
      7,
      new Date("2026-07-12T00:00:00.000Z"),
    );
    expect(velocity.map((point) => point.name)).toEqual(["Sprint 0", "Sprint 1"]);
    expect(velocity[0]).toMatchObject({ committed: 12, completed: 9 });
    expect(velocity[1]).toMatchObject({ committed: 16, completed: 5 });
  });
});

describe("flow reports", () => {
  const issues = [
    issue({
      id: "A",
      status: "DONE",
      activity: [
        event("STATUS_CHANGED", "changed status from To do to In progress", "2026-07-02T10:00:00.000Z"),
        event("STATUS_CHANGED", "changed status from In progress to Done", "2026-07-04T10:00:00.000Z"),
      ],
    }),
    issue({ id: "B", createdAt: "2026-07-03T09:00:00.000Z" }),
  ];
  const now = new Date("2026-07-04T20:00:00.000Z");

  it("stacks per-status counts per day", () => {
    const flow = buildCumulativeFlow(issues, 4, now);
    expect(flow.map((point) => point.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
    expect(flow[0]).toMatchObject({ OPEN: 1, IN_PROGRESS: 0 });
    expect(flow[1]).toMatchObject({ OPEN: 0, IN_PROGRESS: 1 });
    expect(flow[2]).toMatchObject({ OPEN: 1, IN_PROGRESS: 1 });
    expect(flow[3]).toMatchObject({ OPEN: 1, DONE: 1 });
  });

  it("measures cycle time from first In progress", () => {
    const chart = buildControlChart(issues, { now });
    expect(chart.points).toHaveLength(1);
    expect(chart.points[0]).toMatchObject({ issueId: "A", cycleDays: 2, fromCreated: false });
    expect(chart.average).toBe(2);
  });

  it("counts created and resolved per bucket with running totals", () => {
    const series = buildCreatedVsResolved(issues, { days: 4, granularity: "day", now });
    expect(series.map((point) => [point.created, point.resolved])).toEqual([
      [1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(series.at(-1)).toMatchObject({ createdTotal: 2, resolvedTotal: 1 });
  });
});

describe("grouping and planning", () => {
  const ada = { id: "member-ada", name: "Ada", email: "ada@example.com" };
  const issues = [
    issue({ id: "A", assignee: ada, status: "IN_PROGRESS", estimate: 3, labels: [{ id: "l1", name: "Frontend", color: "#000" }] }),
    issue({ id: "B", assignee: ada, status: "DONE", estimate: 5 }),
    issue({ id: "C", estimate: 2, originalEstimateMinutes: 120, timeSpentMinutes: 30 }),
  ];

  it("groups by status in canonical order and multi-valued labels", () => {
    expect(groupIssues(issues, "status").map((group) => group.key)).toEqual([
      "OPEN",
      "IN_PROGRESS",
      "DONE",
    ]);
    expect(groupIssues(issues, "label").map((group) => [group.label, group.count])).toEqual([
      ["Frontend", 1],
      ["No label", 2],
    ]);
  });

  it("builds a two-dimensional table", () => {
    const table = buildTwoDimensional(issues, "assignee", "status");
    expect(table.cells["member-ada"]).toEqual({ IN_PROGRESS: 1, DONE: 1 });
    expect(table.cells.NONE).toEqual({ OPEN: 1 });
  });

  it("totals time tracking with derived remaining", () => {
    const { rows, totals } = buildTimeTracking(issues);
    expect(rows).toHaveLength(1);
    expect(totals).toEqual({ original: 120, spent: 30, remaining: 90 });
  });

  it("sums open workload per assignee", () => {
    expect(buildWorkload(issues).map((row) => [row.name, row.issues, row.points])).toEqual([
      ["Ada", 1, 3],
      ["Unassigned", 1, 2],
    ]);
  });
});

describe("dashboards", () => {
  const view: SavedView = {
    id: "v1",
    name: "Mine",
    owner: "Ada",
    query: "front",
    status: "ACTIVE",
    priority: "ALL",
    assignee: "ALL",
    sort: "OLDEST",
    labelId: null,
    isSystem: false,
  };

  it("applies saved-view filters like the issues API", () => {
    const result = applySavedView(
      [
        issue({ id: "A", title: "Frontend polish", createdAt: "2026-07-03T00:00:00.000Z" }),
        issue({ id: "B", title: "Frontend done", status: "DONE" }),
        issue({ id: "C", title: "Backend" }),
        issue({ id: "D", title: "Login", labels: [{ id: "l", name: "Frontend", color: "#000" }], createdAt: "2026-07-02T00:00:00.000Z" }),
      ],
      view,
    );
    expect(result.map((item) => item.id)).toEqual(["D", "A"]);
  });

  it("summarizes sprint health", () => {
    const health = buildSprintHealth(
      { ...sprint, committedPoints: 8 },
      [
        issue({ cycleId: "cycle-1", estimate: 5, status: "DONE" }),
        issue({ cycleId: "cycle-1", estimate: 5, flagged: true }),
      ],
      new Date("2026-07-08T08:00:00.000Z"),
    );
    expect(health).toMatchObject({
      totalPoints: 10,
      donePoints: 5,
      workPercent: 50,
      scopeChange: 25,
      blockers: 1,
    });
    expect(health.timePercent).toBeGreaterThan(30);
    expect(health.timePercent).toBeLessThan(50);
  });
});
