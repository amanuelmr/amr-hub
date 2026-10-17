import { describe, expect, it } from "vitest";
import type { Cycle, Issue } from "./issues";
import {
  applyJqlSuggestion,
  applyRelativeOffset,
  basicFiltersToJql,
  compareIssueKeys,
  getJqlSuggestions,
  parseJql,
  parseJqlDateLiteral,
  projectsByKeyFrom,
  quoteJqlValue,
  searchIssuesWithJql,
  setJqlOrderBy,
  stripOrderBy,
  textContains,
  type JqlContext,
} from "./jql";

const NOW = new Date("2026-10-15T15:00:00.000Z"); // Thursday

const alice = { id: "mem-alice", name: "Alice Doe", email: "alice@example.com" };
const bob = { id: "mem-bob", name: "Bob Ray", email: "bob@example.com" };

function makeIssue(overrides: Partial<Issue> & { id: string }): Issue {
  return {
    title: "Untitled",
    description: "",
    status: "OPEN",
    priority: "MEDIUM",
    kind: "TASK",
    assignee: null,
    creator: null,
    dueDate: null,
    estimate: null,
    projectId: "proj-amr",
    cycleId: null,
    labels: [],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
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
    watcherIds: [],
    comments: [],
    activity: [],
    ...overrides,
  };
}

const cycles: Cycle[] = [
  {
    id: "c-active",
    name: "Sprint 2",
    startDate: "2026-10-10T00:00:00.000Z",
    endDate: "2026-10-24T00:00:00.000Z",
    capacity: 20,
    projectId: "proj-amr",
    state: "ACTIVE",
  },
  {
    id: "c-closed",
    name: "Sprint 1",
    startDate: "2026-09-26T00:00:00.000Z",
    endDate: "2026-10-09T00:00:00.000Z",
    capacity: 20,
    projectId: "proj-amr",
    state: "CLOSED",
  },
  {
    id: "c-future",
    name: "Sprint 3",
    startDate: "2026-10-24T00:00:00.000Z",
    endDate: "2026-11-07T00:00:00.000Z",
    capacity: 20,
    projectId: "proj-amr",
    state: "FUTURE",
  },
];

const epic = makeIssue({ id: "AMR-1", title: "Checkout epic", kind: "EPIC" });
const story = makeIssue({
  id: "AMR-2",
  title: "Pay with card",
  kind: "STORY",
  status: "IN_PROGRESS",
  priority: "HIGH",
  assignee: alice,
  creator: { id: "user-bob", name: "Bob Ray", email: "bob@example.com" },
  estimate: 5,
  cycleId: "c-active",
  parentId: "AMR-1",
  parent: {
    id: "AMR-1",
    title: "Checkout epic",
    status: "OPEN",
    kind: "EPIC",
    priority: "MEDIUM",
    assignee: null,
    estimate: null,
  },
  labels: [{ id: "l-fe", name: "Frontend", color: "#000" }],
  dueDate: "2026-10-16T12:00:00.000Z",
  description: "<p>Support <strong>Visa</strong> and Mastercard</p>",
  watcherIds: ["user-alice"],
  flagged: true,
  fixVersion: { id: "v1", name: "1.0", status: "UNRELEASED" },
  components: [{ id: "cmp-1", name: "Payments" }],
  createdAt: "2026-10-14T09:00:00.000Z",
  updatedAt: "2026-10-15T09:00:00.000Z",
  activity: [
    {
      id: "a1",
      type: "STATUS_CHANGED",
      description: "changed status from To do to In progress",
      actor: "Alice Doe",
      createdAt: "2026-10-14T10:00:00.000Z",
    },
    {
      id: "a2",
      type: "ASSIGNEE_CHANGED",
      description: "assigned the issue to Bob Ray",
      actor: "Alice Doe",
      createdAt: "2026-10-14T10:00:00.000Z",
    },
  ],
});
const subtask = makeIssue({
  id: "AMR-10",
  title: "Card form validation",
  kind: "SUBTASK",
  parentId: "AMR-2",
  parent: {
    id: "AMR-2",
    title: "Pay with card",
    status: "IN_PROGRESS",
    kind: "STORY",
    priority: "HIGH",
    assignee: alice,
    estimate: 5,
  },
  estimate: 2,
  cycleId: "c-closed",
  comments: [
    {
      id: "cm1",
      body: "Needs a regex for expiry",
      author: "Bob",
      createdAt: "2026-10-02T00:00:00.000Z",
    },
  ],
});
const bug = makeIssue({
  id: "OPS-3",
  projectId: "proj-ops",
  title: "Login crash",
  kind: "BUG",
  status: "DONE",
  priority: "URGENT",
  assignee: bob,
  resolution: "DONE",
  resolvedAt: "2026-10-13T08:00:00.000Z",
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt: "2026-10-13T08:00:00.000Z",
  cycleId: "c-future",
  fixVersion: { id: "v0", name: "0.9", status: "RELEASED" },
  environment: "iOS 18",
});

const issues = [epic, story, subtask, bug];

const ctx: JqlContext = {
  now: NOW,
  currentUserId: "user-alice",
  currentMemberId: "mem-alice",
  projectsByKey: projectsByKeyFrom([
    { id: "proj-amr", key: "AMR", name: "AMR Hub" },
    { id: "proj-ops", key: "OPS", name: "Operations" },
  ]),
  cycles,
  members: [alice, bob],
};

function keys(jql: string) {
  const result = searchIssuesWithJql(issues, jql, ctx);
  if (!result.ok) throw new Error(`${result.error.message} @${result.error.position}`);
  return result.issues.map((issue) => issue.id);
}

function sortedKeys(jql: string) {
  return keys(jql).sort(compareIssueKeys);
}

describe("parseJql", () => {
  it("parses an empty query", () => {
    expect(parseJql("")).toEqual({ ok: true, query: { where: null, orderBy: [] } });
  });

  it("parses boolean structure with precedence", () => {
    const result = parseJql("project = AMR OR status = Done AND NOT priority = High");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.query.where?.type).toBe("or");
    if (result.query.where?.type !== "or") return;
    expect(result.query.where.children[1].type).toBe("and");
  });

  it("parses multi-field ORDER BY", () => {
    const result = parseJql("ORDER BY priority DESC, created");
    expect(result).toEqual({
      ok: true,
      query: {
        where: null,
        orderBy: [
          { field: "priority", direction: "DESC" },
          { field: "created", direction: "ASC" },
        ],
      },
    });
  });

  it("accepts quoted multi-word fields", () => {
    expect(parseJql('"story points" >= 3').ok).toBe(true);
    expect(parseJql('"Epic Link" = AMR-1').ok).toBe(true);
  });

  it.each([
    ["status = ", "Expected a value", 9],
    ["foo = bar", "Field 'foo' does not exist", 0],
    ["status ~ Done", "operator '~' is not supported", 7],
    ['summary ~ "open', "Unterminated string", 10],
    ["status = Done AND", "Expected a field name", 17],
    ["(status = Done", "Expected ')'", 14],
    ["status in Done", "Expected '('", 10],
    ["assignee = bogus()", "Unknown function", 11],
    ["status = currentUser()", "not supported for the 'status' field", 9],
    ["created > yesterday", "not a valid date", 10],
    ['"story points" > lots', "not a number", 17],
    ["status = Done ORDER created", "Expected 'BY'", 20],
    ["status = Done status = Open", "Expected AND, OR or ORDER BY", 14],
    ["ORDER BY text", "cannot be used for ordering", 9],
    ["assignee IS bob", "Expected EMPTY", 12],
    ["status NOT Done", "Expected 'IN' after 'NOT'", 11],
    ["status in ()", "cannot be empty", 11],
    ["created > startOfDay(soon)", "Invalid date offset", 21],
  ])("reports an error for %s", (input, message, position) => {
    const result = parseJql(input, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(message);
    expect(result.error.position).toBe(position);
  });
});

describe("evaluation", () => {
  it("filters by project key, name, and id", () => {
    expect(sortedKeys("project = OPS")).toEqual(["OPS-3"]);
    expect(sortedKeys('project = "AMR Hub"')).toEqual(["AMR-1", "AMR-2", "AMR-10"]);
    expect(sortedKeys("project in (amr, OPS)")).toHaveLength(4);
  });

  it("filters by key with comparisons", () => {
    expect(keys("key = amr-2")).toEqual(["AMR-2"]);
    expect(sortedKeys("issue > AMR-1")).toEqual(["AMR-2", "AMR-10"]);
    expect(sortedKeys("key <= AMR-2")).toEqual(["AMR-1", "AMR-2"]);
  });

  it("matches issue types by label or enum", () => {
    expect(keys("type = Bug")).toEqual(["OPS-3"]);
    expect(keys('issuetype = "Sub-task"')).toEqual(["AMR-10"]);
    expect(sortedKeys("issuetype in (Epic, STORY)")).toEqual(["AMR-1", "AMR-2"]);
  });

  it("matches statuses and status categories", () => {
    expect(keys('status = "In progress"')).toEqual(["AMR-2"]);
    expect(sortedKeys("status != Done")).toEqual(["AMR-1", "AMR-2", "AMR-10"]);
    expect(sortedKeys('statusCategory = "To Do"')).toEqual(["AMR-1", "AMR-10"]);
    expect(keys("statusCategory = Done")).toEqual(["OPS-3"]);
  });

  it("compares priorities in order", () => {
    expect(sortedKeys("priority > Medium")).toEqual(["AMR-2", "OPS-3"]);
    expect(sortedKeys("priority <= medium")).toEqual(["AMR-1", "AMR-10"]);
    expect(keys("priority = Urgent")).toEqual(["OPS-3"]);
  });

  it("resolves currentUser() for assignee, reporter and watcher", () => {
    expect(keys("assignee = currentUser()")).toEqual(["AMR-2"]);
    expect(keys("watcher = currentUser()")).toEqual(["AMR-2"]);
    expect(keys("reporter = currentUser()")).toEqual([]);
    expect(keys('reporter = "bob ray"')).toEqual(["AMR-2"]);
  });

  it("matches users by name, email or id and handles EMPTY", () => {
    expect(keys('assignee = "Bob Ray"')).toEqual(["OPS-3"]);
    expect(keys("assignee = alice@example.com")).toEqual(["AMR-2"]);
    expect(sortedKeys("assignee is EMPTY")).toEqual(["AMR-1", "AMR-10"]);
    expect(sortedKeys("assignee is not empty")).toEqual(["AMR-2", "OPS-3"]);
    expect(sortedKeys("assignee = EMPTY")).toEqual(["AMR-1", "AMR-10"]);
  });

  it("excludes empty values from != and NOT IN like Jira", () => {
    expect(keys('assignee != "Bob Ray"')).toEqual(["AMR-2"]);
    expect(keys("assignee not in (mem-bob)")).toEqual(["AMR-2"]);
    expect(sortedKeys("assignee not in (mem-bob) OR assignee is EMPTY")).toEqual([
      "AMR-1",
      "AMR-2",
      "AMR-10",
    ]);
  });

  it("matches multi-valued labels and components", () => {
    expect(keys("labels = frontend")).toEqual(["AMR-2"]);
    expect(sortedKeys("labels is EMPTY")).toEqual(["AMR-1", "AMR-10", "OPS-3"]);
    expect(keys("component = Payments")).toEqual(["AMR-2"]);
    expect(keys("labels in (Backend, Frontend)")).toEqual(["AMR-2"]);
  });

  it("evaluates sprint functions and names", () => {
    expect(keys("sprint in openSprints()")).toEqual(["AMR-2"]);
    expect(keys("sprint in closedSprints()")).toEqual(["AMR-10"]);
    expect(keys("sprint in futureSprints()")).toEqual(["OPS-3"]);
    expect(keys('sprint = "Sprint 1"')).toEqual(["AMR-10"]);
    expect(keys("sprint is EMPTY")).toEqual(["AMR-1"]);
  });

  it("falls back to sprint dates when state is missing", () => {
    const stateless = cycles.map((cycle) => ({ ...cycle, state: undefined }));
    const result = searchIssuesWithJql(issues, "sprint in openSprints()", {
      ...ctx,
      cycles: stateless,
    });
    expect(result.ok && result.issues.map((issue) => issue.id)).toEqual(["AMR-2"]);
  });

  it("matches fix versions including released functions", () => {
    expect(keys("fixVersion = 1.0")).toEqual(["AMR-2"]);
    expect(keys("fixVersion in releasedVersions()")).toEqual(["OPS-3"]);
    expect(keys("fixVersion in unreleasedVersions()")).toEqual(["AMR-2"]);
  });

  it("resolves parent and epic (including grandchildren)", () => {
    expect(keys("parent = AMR-1")).toEqual(["AMR-2"]);
    expect(sortedKeys("epic = AMR-1")).toEqual(["AMR-2", "AMR-10"]);
    expect(sortedKeys('"epic link" is EMPTY')).toEqual(["AMR-1", "OPS-3"]);
  });

  it("supports text search operators", () => {
    expect(keys("summary ~ card")).toEqual(expect.arrayContaining(["AMR-2", "AMR-10"]));
    expect(keys("description ~ visa")).toEqual(["AMR-2"]);
    expect(keys("text ~ expiry")).toEqual(["AMR-10"]);
    expect(keys("comment ~ regex")).toEqual(["AMR-10"]);
    expect(keys('text ~ "pay card"')).toEqual(["AMR-2"]);
    expect(keys("summary ~ chec*")).toEqual(["AMR-1"]);
    expect(sortedKeys("summary !~ card")).toEqual(["AMR-1", "OPS-3"]);
    expect(keys("environment ~ ios")).toEqual(["OPS-3"]);
    expect(sortedKeys("description is EMPTY")).toEqual(["AMR-1", "AMR-10", "OPS-3"]);
  });

  it("compares absolute and relative dates", () => {
    expect(sortedKeys("created >= -2d")).toEqual(["AMR-2"]);
    expect(sortedKeys("created < 2026-10-01")).toEqual(["OPS-3"]);
    expect(sortedKeys("created = 2026-10-01")).toEqual(["AMR-1", "AMR-10"]);
    expect(sortedKeys("created <= 2026/10/01")).toEqual(["AMR-1", "AMR-10", "OPS-3"]);
    expect(keys('created > "2026-10-14 08:59"')).toEqual(["AMR-2"]);
    expect(keys("updated > -1w AND resolved is not EMPTY")).toEqual(["OPS-3"]);
    expect(keys("resolved >= startOfWeek(-1w)")).toEqual(["OPS-3"]);
  });

  it("evaluates date functions", () => {
    expect(keys("due <= endOfDay(1d)")).toEqual(["AMR-2"]);
    expect(keys("due <= endOfDay()")).toEqual([]);
    expect(keys("due <= endOfWeek()")).toEqual(["AMR-2"]);
    expect(keys("due > now()")).toEqual(["AMR-2"]);
    expect(keys("duedate < startOfDay()")).toEqual([]);
    expect(keys("updated >= startOfDay()")).toEqual(["AMR-2"]);
    expect(sortedKeys("created >= startOfMonth()")).toEqual(["AMR-1", "AMR-2", "AMR-10"]);
    expect(keys("created < startOfYear()")).toEqual([]);
  });

  it("matches flagged, resolution, and story points", () => {
    expect(keys("flagged = true")).toEqual(["AMR-2"]);
    expect(keys("flagged = Impediment")).toEqual(["AMR-2"]);
    expect(keys("flagged is not EMPTY")).toEqual(["AMR-2"]);
    expect(keys("resolution = Done")).toEqual(["OPS-3"]);
    expect(sortedKeys("resolution = Unresolved")).toEqual(["AMR-1", "AMR-2", "AMR-10"]);
    expect(keys('"story points" > 3')).toEqual(["AMR-2"]);
    expect(sortedKeys("storypoints is EMPTY")).toEqual(["AMR-1", "OPS-3"]);
    expect(keys("estimate = 2")).toEqual(["AMR-10"]);
  });

  it("evaluates WAS against history", () => {
    expect(sortedKeys('status WAS "To do"')).toEqual(["AMR-1", "AMR-2", "AMR-10"]);
    expect(keys('status WAS "To do" AND status = "In progress"')).toEqual(["AMR-2"]);
    expect(sortedKeys("status was in (Backlog, Open)")).toEqual(["AMR-1", "AMR-2", "AMR-10"]);
    expect(sortedKeys("status was in (Done)")).toEqual(["OPS-3"]);
    expect(keys('assignee was "Bob Ray" AND project = AMR')).toEqual(["AMR-2"]);
    expect(sortedKeys("assignee was currentUser()")).toEqual(["AMR-2"]);
    expect(keys('status was not "To do" AND project = AMR AND type = Story')).toEqual([]);
  });

  it("combines AND / OR / NOT and parentheses", () => {
    expect(sortedKeys("project = AMR AND (type = Epic OR priority = High)")).toEqual([
      "AMR-1",
      "AMR-2",
    ]);
    expect(sortedKeys("NOT project = AMR")).toEqual(["OPS-3"]);
    expect(sortedKeys("not (status = Done or type = Epic)")).toEqual(["AMR-2", "AMR-10"]);
  });

  it("is case-insensitive for keywords and fields", () => {
    expect(keys("PROJECT = ops and STATUS = done")).toEqual(["OPS-3"]);
  });
});

describe("ordering", () => {
  it("defaults to created DESC", () => {
    expect(keys("")).toEqual(["AMR-2", "AMR-1", "AMR-10", "OPS-3"]);
  });

  it("orders keys numerically", () => {
    expect(keys("ORDER BY key ASC")).toEqual(["AMR-1", "AMR-2", "AMR-10", "OPS-3"]);
    expect(keys("project = AMR ORDER BY key DESC")).toEqual(["AMR-10", "AMR-2", "AMR-1"]);
  });

  it("orders by priority and puts empties last in both directions", () => {
    expect(keys("ORDER BY priority DESC, key ASC")).toEqual(["OPS-3", "AMR-2", "AMR-1", "AMR-10"]);
    expect(keys("ORDER BY assignee ASC").slice(-2).sort()).toEqual(["AMR-1", "AMR-10"]);
    expect(keys("ORDER BY assignee DESC").slice(-2).sort()).toEqual(["AMR-1", "AMR-10"]);
    expect(keys("ORDER BY assignee DESC").slice(0, 2)).toEqual(["OPS-3", "AMR-2"]);
  });

  it("orders by status workflow and story points", () => {
    expect(keys("ORDER BY status DESC, key")[0]).toBe("OPS-3");
    expect(keys('ORDER BY "story points" DESC').slice(0, 2)).toEqual(["AMR-2", "AMR-10"]);
  });
});

describe("helpers", () => {
  it("applies relative offsets with calendar months", () => {
    const jan31 = Date.UTC(2026, 0, 31);
    expect(new Date(applyRelativeOffset(jan31, "1M")!).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(applyRelativeOffset(0, "-1w 2d")).toBe(-9 * 86_400_000);
    expect(applyRelativeOffset(0, "-2h")).toBe(-7_200_000);
    expect(applyRelativeOffset(0, "soon")).toBeNull();
  });

  it("parses date literals", () => {
    expect(parseJqlDateLiteral("2026-02-30", NOW)).toBeNull();
    expect(parseJqlDateLiteral("2026-02-03", NOW)).toEqual({
      start: Date.UTC(2026, 1, 3),
      end: Date.UTC(2026, 1, 4),
      isRange: true,
    });
  });

  it("matches text with wildcards", () => {
    expect(textContains("Login crash on iOS", "log*")).toBe(true);
    expect(textContains("Login crash", "cr?sh")).toBe(true);
    expect(textContains("Login crash", "logout")).toBe(false);
  });

  it("quotes values only when needed", () => {
    expect(quoteJqlValue("AMR")).toBe("AMR");
    expect(quoteJqlValue("In progress")).toBe('"In progress"');
    expect(quoteJqlValue("and")).toBe('"and"');
    expect(quoteJqlValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("rewrites ORDER BY for column sorting", () => {
    expect(setJqlOrderBy("project = AMR ORDER BY created DESC", [{ field: "priority", direction: "ASC" }])).toBe(
      "project = AMR ORDER BY priority ASC",
    );
    expect(setJqlOrderBy("", [{ field: "storypoints", direction: "DESC" }])).toBe(
      'ORDER BY "story points" DESC',
    );
    expect(stripOrderBy('summary ~ "order by" order by key')).toBe('summary ~ "order by"');
  });

  it("converts basic filters to JQL", () => {
    expect(
      basicFiltersToJql({
        text: "crash",
        status: "IN_PROGRESS",
        priority: "HIGH",
        projectKey: "AMR",
        labelName: "Customer impact",
        assignee: "UNASSIGNED",
        sort: "OLDEST",
      }),
    ).toBe(
      'project = AMR AND status = "In progress" AND priority = High AND labels = "Customer impact" AND assignee IS EMPTY AND text ~ crash ORDER BY created ASC',
    );
    expect(basicFiltersToJql({ status: "ACTIVE" })).toBe(
      "statusCategory != Done ORDER BY created DESC",
    );
    const jql = basicFiltersToJql({ status: "ACTIVE", assignee: "Alice Doe" });
    expect(parseJql(jql).ok).toBe(true);
  });
});

describe("autocomplete", () => {
  const source = {
    projects: [{ id: "proj-amr", key: "AMR", name: "AMR Hub" }],
    members: [alice, bob],
    labels: [{ name: "Frontend" }],
    cycles,
  };

  function labels(text: string, caret = text.length) {
    return getJqlSuggestions(text, caret, source).items.map((item) => item.label);
  }

  it("suggests fields at the start and after AND", () => {
    expect(labels("")).toContain("project");
    expect(labels("sta")).toEqual(["status", "statusCategory"]);
    expect(labels("project = AMR AND ass")).toEqual(["assignee"]);
  });

  it("suggests operators for a field", () => {
    expect(labels("status ")).toContain("WAS");
    expect(labels("summary ")).toEqual(["~", "!~", "IS EMPTY", "IS NOT EMPTY"]);
  });

  it("suggests values for a field", () => {
    expect(labels("assignee = ")).toEqual(["currentUser()", "Alice Doe", "Bob Ray", "EMPTY"]);
    expect(labels("project = ")).toContain("AMR");
    expect(labels("sprint in ")).toContain("openSprints()");
    expect(labels('status = "in')).toEqual(["In progress", "In review"]);
    expect(labels("status in (Open, ")).toContain("Done");
    expect(labels("assignee is ")).toEqual(["NOT", "EMPTY"]);
  });

  it("suggests connectors and ORDER BY parts", () => {
    expect(labels("status = Done ")).toEqual(["AND", "OR", "ORDER BY"]);
    expect(labels("status = Done ORDER ")).toEqual(["BY"]);
    expect(labels("ORDER BY pri")[0]).toBe("priority");
    expect(labels("ORDER BY priority ")).toEqual(["ASC", "DESC", ","]);
    expect(labels("assignee = currentUser() ")).toEqual(["AND", "OR", "ORDER BY"]);
  });

  it("applies a suggestion replacing the typed prefix", () => {
    const text = "project = AMR AND ass";
    const suggestions = getJqlSuggestions(text, text.length, source);
    expect(applyJqlSuggestion(text, suggestions, suggestions.items[0])).toEqual({
      text: "project = AMR AND assignee ",
      caret: 27,
    });
  });
});
