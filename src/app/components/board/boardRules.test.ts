import { describe, expect, it } from "vitest";
import type { Cycle, Issue } from "../../data/issues";
import type { JqlContext } from "../../data/jql";
import {
  EVERYTHING_ELSE,
  PRIORITY_COLORS,
  activeSprintsOf,
  attentionReasons,
  averageVelocity,
  cardColorFor,
  compileQueries,
  groupQueryLanes,
  hashColor,
  isHiddenKanbanDone,
  matchesQuickFilters,
  timeInStatus,
  visibleSprintIds,
} from "./boardRules";

const NOW = new Date("2026-10-18T12:00:00.000Z");

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
    customFields: {},
    ...overrides,
  };
}

const ada = { id: "m-ada", name: "Ada", email: "ada@example.com" };
const ctx: JqlContext = { now: NOW, currentMemberId: ada.id, members: [ada] };

const bug = issue({ id: "AMR-1", kind: "BUG", priority: "HIGH", assignee: ada });
const story = issue({ id: "AMR-2", kind: "STORY", priority: "LOW" });

describe("quick filters", () => {
  const compiled = compileQueries(
    [
      { id: "bugs", name: "Bugs", jql: "type = Bug" },
      { id: "high", name: "High", jql: "priority = High" },
      { id: "broken", name: "Broken", jql: "priority = = High" },
    ],
    NOW,
  );

  it("records parse errors per query", () => {
    expect(compiled[0].error).toBeNull();
    expect(compiled[2].error).not.toBeNull();
  });

  it("AND-combines the active quick filters", () => {
    expect(matchesQuickFilters(bug, [], compiled, ctx)).toBe(true);
    expect(matchesQuickFilters(bug, ["bugs"], compiled, ctx)).toBe(true);
    expect(matchesQuickFilters(story, ["bugs"], compiled, ctx)).toBe(false);
    expect(matchesQuickFilters(bug, ["bugs", "high"], compiled, ctx)).toBe(true);
    expect(
      matchesQuickFilters(issue({ kind: "BUG", priority: "LOW" }), ["bugs", "high"], compiled, ctx),
    ).toBe(false);
  });

  it("never matches an invalid query", () => {
    expect(matchesQuickFilters(bug, ["broken"], compiled, ctx)).toBe(false);
  });
});

describe("cardColorFor", () => {
  const compiled = compileQueries(
    [
      { id: "a", name: "Bugs", jql: "type = Bug", color: "#ff0000" },
      { id: "b", name: "Everything", jql: "priority != Urgent", color: "#00ff00" },
    ],
    NOW,
  );
  const helpers = {
    ctx,
    compiled,
    typeColor: (kind: string) => (kind === "BUG" ? "#e94f75" : "#8fbe35"),
  };

  it("colors by strategy", () => {
    expect(cardColorFor(bug, { strategy: "NONE", queries: [] }, helpers)).toBeNull();
    expect(cardColorFor(bug, { strategy: "ISSUE_TYPE", queries: [] }, helpers)).toBe(
      "#e94f75",
    );
    expect(cardColorFor(bug, { strategy: "PRIORITY", queries: [] }, helpers)).toBe(
      PRIORITY_COLORS.HIGH,
    );
    expect(cardColorFor(bug, { strategy: "ASSIGNEE", queries: [] }, helpers)).toBe(
      hashColor(ada.id),
    );
    expect(cardColorFor(story, { strategy: "ASSIGNEE", queries: [] }, helpers)).toBeNull();
  });

  it("uses the first matching query color", () => {
    const colors = { strategy: "QUERY" as const, queries: [] };
    expect(cardColorFor(bug, colors, helpers)).toBe("#ff0000");
    expect(cardColorFor(story, colors, helpers)).toBe("#00ff00");
    expect(
      cardColorFor(issue({ priority: "URGENT" }), colors, helpers),
    ).toBeNull();
  });
});

describe("groupQueryLanes", () => {
  it("puts each issue in the first matching lane, then everything else", () => {
    const compiled = compileQueries(
      [
        { id: "mine", name: "Mine", jql: "assignee = currentUser()" },
        { id: "bugs", name: "Bugs", jql: "type = Bug" },
      ],
      NOW,
    );
    const lanes = groupQueryLanes([bug, story], compiled, ctx);
    expect(lanes.map((lane) => [lane.id, lane.issues.map((item) => item.id)])).toEqual([
      ["mine", ["AMR-1"]],
      ["bugs", []],
      [EVERYTHING_ELSE, ["AMR-2"]],
    ]);
  });
});

describe("isHiddenKanbanDone", () => {
  it("hides released and old done work", () => {
    const done = issue({ status: "DONE", resolvedAt: "2026-10-10T00:00:00.000Z" });
    expect(isHiddenKanbanDone(done, 14, NOW)).toBe(false);
    expect(isHiddenKanbanDone(done, 7, NOW)).toBe(true);
    expect(isHiddenKanbanDone(done, null, NOW)).toBe(false);
    expect(
      isHiddenKanbanDone(
        { ...done, fixVersion: { id: "v", name: "1.0", status: "RELEASED" } },
        null,
        NOW,
      ),
    ).toBe(true);
    expect(isHiddenKanbanDone(issue({ status: "OPEN" }), 1, NOW)).toBe(false);
  });
});

describe("parallel sprint selection", () => {
  const sprint = (id: string, state: Cycle["state"], startedAt: string): Cycle => ({
    id,
    name: id,
    startDate: startedAt,
    endDate: "2026-12-01",
    capacity: 20,
    projectId: "p",
    state,
    startedAt,
    completedPoints: state === "CLOSED" ? 10 : null,
    completedAt: state === "CLOSED" ? startedAt : null,
  });
  const cycles = [
    sprint("s2", "ACTIVE", "2026-10-05"),
    sprint("s1", "ACTIVE", "2026-10-01"),
    sprint("s0", "CLOSED", "2026-09-01"),
  ];

  it("lists active sprints oldest first", () => {
    expect(activeSprintsOf(cycles, "p").map((cycle) => cycle.id)).toEqual(["s1", "s2"]);
  });

  it("falls back to every active sprint for empty or stale choices", () => {
    const active = activeSprintsOf(cycles, "p");
    expect(visibleSprintIds(active, [])).toEqual(["s1", "s2"]);
    expect(visibleSprintIds(active, ["gone"])).toEqual(["s1", "s2"]);
    expect(visibleSprintIds(active, ["s2"])).toEqual(["s2"]);
  });

  it("averages closed sprint velocity", () => {
    expect(averageVelocity(cycles, "p")).toEqual({ average: 10, sprints: 1 });
    expect(averageVelocity([], "p")).toBeNull();
  });
});

describe("attentionReasons", () => {
  const none = new Set<string>();

  it("flags due, stuck, blocked and flagged work", () => {
    const item = issue({
      id: "AMR-9",
      status: "IN_PROGRESS",
      dueDate: "2026-10-19",
      statusChangedAt: "2026-10-01T00:00:00.000Z",
      flagged: true,
    });
    expect(attentionReasons(item, { now: NOW, blockedIds: new Set(["AMR-9"]) })).toEqual([
      "due",
      "stuck",
      "blocked",
      "flagged",
    ]);
  });

  it("ignores done work, far due dates and fresh or to-do statuses", () => {
    expect(attentionReasons(issue({ status: "DONE", flagged: true }), { now: NOW, blockedIds: none })).toEqual([]);
    expect(
      attentionReasons(
        issue({ status: "OPEN", dueDate: "2026-11-30", statusChangedAt: "2026-01-01T00:00:00.000Z" }),
        { now: NOW, blockedIds: none },
      ),
    ).toEqual([]);
    expect(
      attentionReasons(issue({ status: "IN_PROGRESS", statusChangedAt: "2026-10-16T00:00:00.000Z" }), {
        now: NOW,
        blockedIds: none,
      }),
    ).toEqual([]);
  });
});

describe("timeInStatus", () => {
  it("averages days per status and skips items without a timestamp", () => {
    const rows = timeInStatus(
      [
        issue({ id: "A", status: "OPEN", statusChangedAt: "2026-10-16T12:00:00.000Z" }),
        issue({ id: "B", status: "OPEN", statusChangedAt: "2026-10-14T12:00:00.000Z" }),
        issue({ id: "C", status: "DONE" }),
      ],
      NOW,
    );
    expect(rows).toEqual([{ status: "OPEN", count: 2, averageDays: 3 }]);
  });
});
