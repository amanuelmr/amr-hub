import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_CONFIG } from "../../data/projects";
import type { Issue } from "../../data/issues";
import {
  EMPTY_FILTERS,
  columnForStatus,
  compareRank,
  computeDropTarget,
  daysRemaining,
  groupLanes,
  isStaleDone,
  matchesFilters,
  optimisticRanks,
  pointBreakdown,
  resolveBoardColumns,
} from "./boardModel";

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "AMR-1",
    title: "Example issue",
    description: "",
    status: "OPEN",
    priority: "MEDIUM",
    kind: "STORY",
    assignee: null,
    creator: null,
    dueDate: null,
    estimate: null,
    projectId: "p",
    cycleId: null,
    labels: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
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

describe("computeDropTarget", () => {
  const list = ["A", "B", "C", "D"];

  it("moves an item down after the hovered item", () => {
    expect(
      computeDropTarget({ list, movedIds: ["A"], activeId: "A", overId: "C" }),
    ).toEqual({ afterId: "C", beforeId: "D", order: ["B", "C", "A", "D"] });
  });

  it("moves an item up before the hovered item", () => {
    expect(
      computeDropTarget({ list, movedIds: ["D"], activeId: "D", overId: "B" }),
    ).toEqual({ afterId: "A", beforeId: "B", order: ["A", "D", "B", "C"] });
  });

  it("inserts before the hovered item from another container", () => {
    expect(
      computeDropTarget({ list, movedIds: ["X"], activeId: "X", overId: "A" }),
    ).toEqual({ afterId: undefined, beforeId: "A", order: ["X", "A", "B", "C", "D"] });
  });

  it("appends when dropped on the container", () => {
    expect(
      computeDropTarget({ list: [], movedIds: ["X", "Y"], activeId: "X", overId: null }),
    ).toEqual({ afterId: undefined, beforeId: undefined, order: ["X", "Y"] });
  });

  it("ignores no-op drops", () => {
    expect(
      computeDropTarget({ list, movedIds: ["B"], activeId: "B", overId: "B" }),
    ).toBeNull();
    expect(
      computeDropTarget({ list, movedIds: ["D"], activeId: "D", overId: null }),
    ).toBeNull();
  });
});

describe("optimisticRanks", () => {
  it("places ranks between neighbours", () => {
    const ranks = optimisticRanks(
      { afterId: "A", beforeId: "B", order: [] },
      ["X"],
      (id) => (id === "A" ? 10 : 20),
    );
    expect(ranks.get("X")).toBe(15);
  });
});

describe("columns", () => {
  it("hides backlog on kanban unless enabled", () => {
    const config = {
      ...DEFAULT_BOARD_CONFIG,
      columns: [
        { id: "b", name: "Backlog", statuses: ["BACKLOG" as const], wipLimit: null },
        ...DEFAULT_BOARD_CONFIG.columns,
      ],
    };
    expect(resolveBoardColumns(config, "KANBAN").map((c) => c.id)).not.toContain("b");
    expect(
      resolveBoardColumns({ ...DEFAULT_BOARD_CONFIG, showBacklogColumn: true }, "KANBAN")[0].id,
    ).toBe("backlog");
  });

  it("folds unmapped to-do statuses into the first scrum column", () => {
    const columns = DEFAULT_BOARD_CONFIG.columns;
    expect(columnForStatus(columns, "BACKLOG", "SCRUM")).toBe("todo");
    expect(columnForStatus(columns, "BACKLOG", "KANBAN")).toBeNull();
  });
});

describe("filters and grouping", () => {
  const now = new Date("2026-10-16T00:00:00.000Z");
  const mine = issue({
    id: "AMR-2",
    assignee: { id: "m1", name: "Ada Lovelace", email: "a@x" },
    updatedAt: "2026-10-15T00:00:00.000Z",
    flagged: true,
  });
  const other = issue({ id: "AMR-3", priority: "URGENT" });

  it("applies quick filters", () => {
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, onlyMine: true }, "m1", now)).toBe(true);
    expect(matchesFilters(other, { ...EMPTY_FILTERS, onlyMine: true }, "m1", now)).toBe(false);
    expect(matchesFilters(other, { ...EMPTY_FILTERS, recent: true }, null, now)).toBe(false);
    expect(matchesFilters(other, { ...EMPTY_FILTERS, flagged: true }, null, now)).toBe(false);
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, query: "amr-2" }, null, now)).toBe(true);
  });

  it("groups lanes by assignee with unassigned last", () => {
    const lanes = groupLanes([other, mine], "ASSIGNEE", []);
    expect(lanes.map((lane) => lane.title)).toEqual(["Ada Lovelace", "Unassigned"]);
  });

  it("groups lanes by priority order", () => {
    const lanes = groupLanes([mine, other], "PRIORITY", []);
    expect(lanes.map((lane) => lane.id)).toEqual(["URGENT", "MEDIUM"]);
  });

  it("sums points by status category", () => {
    expect(
      pointBreakdown([
        issue({ estimate: 3 }),
        issue({ estimate: 5, status: "IN_REVIEW" }),
        issue({ estimate: 2, status: "DONE" }),
      ]),
    ).toEqual({ total: 10, todo: 3, inProgress: 5, done: 2 });
  });

  it("sorts by rank then key number", () => {
    expect(
      [issue({ id: "A-10", rank: 0 }), issue({ id: "A-2", rank: 0 })]
        .sort(compareRank)
        .map((item) => item.id),
    ).toEqual(["A-2", "A-10"]);
  });

  it("detects stale done work and remaining days", () => {
    expect(isStaleDone(issue({ status: "DONE", resolvedAt: "2026-09-01T00:00:00.000Z" }), now)).toBe(true);
    expect(daysRemaining("2026-10-18T23:59:59.000Z", now)).toBe(3);
  });
});
