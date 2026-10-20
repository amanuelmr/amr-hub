import { describe, expect, it } from "vitest";
import {
  applicableFields,
  fieldAppliesTo,
  formatFieldValue,
  mergeFieldOptions,
  normalizeFieldValue,
  parseCustomFieldValues,
  sameFieldValue,
  withoutOptions,
  type CustomFieldDefinition,
} from "./customFields";
import type { Issue } from "./issues";
import {
  getJqlSuggestions,
  parseJql,
  searchIssuesWithJql,
  setJqlOrderBy,
  type JqlContext,
} from "./jql";

function field(overrides: Partial<CustomFieldDefinition> & Pick<CustomFieldDefinition, "id" | "type">): CustomFieldDefinition {
  return {
    name: overrides.id,
    description: null,
    options: [],
    required: false,
    issueTypes: [],
    position: 0,
    projectId: null,
    ...overrides,
  };
}

const severity = field({
  id: "f-sev",
  name: "Severity",
  type: "SELECT",
  issueTypes: ["BUG"],
  options: [
    { id: "o1", value: "S1" },
    { id: "o2", value: "S2" },
    { id: "o3", value: "S3", disabled: true },
  ],
});
const effort = field({ id: "f-eff", name: "Effort", type: "NUMBER", projectId: "p1", position: 1 });
const due = field({ id: "f-date", name: "Go live", type: "DATE" });
const owner = field({ id: "f-user", name: "Owner", type: "USER" });
const tags = field({ id: "f-tags", name: "Tags", type: "LABELS" });
const notes = field({ id: "f-notes", name: "Notes", type: "PARAGRAPH" });
const platforms = field({
  id: "f-plat",
  name: "Platforms",
  type: "CHECKBOXES",
  options: [
    { id: "web", value: "Web" },
    { id: "ios", value: "iOS" },
  ],
});

describe("normalizeFieldValue", () => {
  it("stores option ids and accepts option names", () => {
    expect(normalizeFieldValue(severity, "S2")).toEqual({ ok: true, value: "o2" });
    expect(normalizeFieldValue(severity, "o1")).toEqual({ ok: true, value: "o1" });
    expect(normalizeFieldValue(severity, "S9").ok).toBe(false);
  });

  it("rejects disabled options unless already set", () => {
    expect(normalizeFieldValue(severity, "o3").ok).toBe(false);
    expect(normalizeFieldValue(severity, "o3", "o3")).toEqual({ ok: true, value: "o3" });
  });

  it("validates numbers, dates, urls and labels", () => {
    expect(normalizeFieldValue(effort, "2.5")).toEqual({ ok: true, value: 2.5 });
    expect(normalizeFieldValue(effort, "x").ok).toBe(false);
    expect(normalizeFieldValue(due, "2026-02-30").ok).toBe(false);
    expect(normalizeFieldValue(due, "2026-02-03")).toEqual({ ok: true, value: "2026-02-03" });
    expect(normalizeFieldValue(field({ id: "u", type: "URL" }), "javascript:alert(1)").ok).toBe(false);
    expect(normalizeFieldValue(tags, ["a", "A", "b"])).toEqual({ ok: true, value: ["a", "b"] });
    expect(normalizeFieldValue(tags, ["two words"]).ok).toBe(false);
  });

  it("treats empty input as a clear and orders multi options", () => {
    expect(normalizeFieldValue(effort, "")).toEqual({ ok: true, value: null });
    expect(normalizeFieldValue(platforms, [])).toEqual({ ok: true, value: null });
    expect(normalizeFieldValue(platforms, ["iOS", "web"])).toEqual({ ok: true, value: ["web", "ios"] });
    expect(normalizeFieldValue(notes, "<p></p>")).toEqual({ ok: true, value: null });
  });
});

describe("field helpers", () => {
  it("applies fields by project and work type", () => {
    expect(fieldAppliesTo(severity, "p1", "BUG")).toBe(true);
    expect(fieldAppliesTo(severity, "p1", "STORY")).toBe(false);
    expect(fieldAppliesTo(effort, "p2", "TASK")).toBe(false);
    expect(applicableFields([effort, severity, due], "p1", "BUG").map((f) => f.id)).toEqual([
      "f-date",
      "f-sev",
      "f-eff",
    ]);
  });

  it("merges edited options and keeps ids", () => {
    let next = 0;
    const result = mergeFieldOptions(
      severity.options,
      [{ id: "o2", value: "Sev 2" }, { value: "S5" }, { id: "o1", value: "S1", disabled: true }],
      () => `new${(next += 1)}`,
    );
    expect(result.options).toEqual([
      { id: "o2", value: "Sev 2" },
      { id: "new1", value: "S5" },
      { id: "o1", value: "S1", disabled: true },
    ]);
    expect(result.removedIds).toEqual(["o3"]);
    expect(withoutOptions(["o3", "o1"], ["o3"])).toEqual(["o1"]);
    expect(withoutOptions("o3", ["o3"])).toBeNull();
  });

  it("parses and formats stored values", () => {
    expect(parseCustomFieldValues('{"a":1,"b":["x"],"c":{"bad":1}}')).toEqual({ a: 1, b: ["x"] });
    expect(parseCustomFieldValues("nope")).toEqual({});
    expect(formatFieldValue(severity, "o1")).toBe("S1");
    expect(formatFieldValue(platforms, ["web", "ios"])).toBe("Web, iOS");
    expect(formatFieldValue(owner, "m1", [{ id: "m1", name: "Ada" }])).toBe("Ada");
    expect(formatFieldValue(due, "2026-02-03")).toBe("Feb 3, 2026");
    expect(sameFieldValue(["a"], ["a"])).toBe(true);
    expect(sameFieldValue(undefined, "")).toBe(true);
  });
});

function issue(id: string, customFields: Issue["customFields"], kind = "BUG"): Issue {
  return {
    id,
    title: id,
    description: "",
    status: "OPEN",
    priority: "MEDIUM",
    kind,
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
    customFields,
  };
}

const issues = [
  issue("P-1", { "f-sev": "o1", "f-eff": 5, "f-date": "2026-03-01", "f-user": "m1", "f-tags": ["red"] }),
  issue("P-2", { "f-sev": "o2", "f-eff": 2, "f-notes": "<p>Crash on <b>login</b></p>", "f-plat": ["web", "ios"] }),
  issue("P-3", {}),
];

const ctx: JqlContext = {
  now: new Date("2026-03-10T12:00:00.000Z"),
  currentMemberId: "m1",
  members: [{ id: "m1", name: "Ada Lovelace", email: "ada@example.com" }],
  customFields: [severity, effort, due, owner, tags, notes, platforms],
};

function keys(jql: string) {
  const result = searchIssuesWithJql(issues, jql, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.issues.map((item) => item.id);
}

describe("JQL custom fields", () => {
  it("matches select fields by name, id and cf[] syntax", () => {
    expect(keys("Severity = S1")).toEqual(["P-1"]);
    expect(keys('"severity" in (S1, S2) ORDER BY Severity DESC')).toEqual(["P-2", "P-1"]);
    expect(keys("cf[f-sev] = o2")).toEqual(["P-2"]);
    expect(keys("Severity != S1")).toEqual(["P-2"]);
    expect(keys("Severity IS EMPTY")).toEqual(["P-3"]);
  });

  it("compares numbers and dates and orders by them", () => {
    expect(keys("Effort > 3")).toEqual(["P-1"]);
    expect(keys("Effort IS NOT EMPTY ORDER BY Effort ASC")).toEqual(["P-2", "P-1"]);
    expect(keys('"Go live" < 2026-03-05')).toEqual(["P-1"]);
    expect(keys('"Go live" >= -30d')).toEqual(["P-1"]);
  });

  it("supports text search, users, labels and checkboxes", () => {
    expect(keys("Notes ~ login")).toEqual(["P-2"]);
    expect(keys("Owner = currentUser()")).toEqual(["P-1"]);
    expect(keys('Owner = "ada lovelace"')).toEqual(["P-1"]);
    expect(keys("Tags = red")).toEqual(["P-1"]);
    expect(keys("Platforms = iOS")).toEqual(["P-2"]);
  });

  it("reports unknown fields and bad operators", () => {
    const unknown = parseJql("Bogus = 1", new Date(), { customFields: ctx.customFields });
    expect(unknown.ok).toBe(false);
    const operator = parseJql("Notes = x", new Date(), { customFields: ctx.customFields });
    expect(operator.ok).toBe(false);
    expect(parseJql("Anything = x", new Date(), { customFields: "any" }).ok).toBe(true);
  });

  it("autocompletes custom fields and their options", () => {
    const fields = getJqlSuggestions("Sev", 3, { customFields: ctx.customFields }).items;
    expect(fields.map((item) => item.label)).toContain("Severity");
    const values = getJqlSuggestions("Severity = ", 11, { customFields: ctx.customFields }).items;
    expect(values.map((item) => item.label)).toEqual(["S1", "S2", "EMPTY"]);
    expect(setJqlOrderBy("", [{ field: "cf[f-sev]", direction: "ASC" }])).toBe(
      "ORDER BY cf[f-sev] ASC",
    );
  });
});
