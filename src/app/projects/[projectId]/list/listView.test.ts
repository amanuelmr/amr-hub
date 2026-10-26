import { describe, expect, it } from "vitest";
import type { Issue } from "../../../data/issues";
import { DEFAULT_LIST_PREFS, countBy, parseListPrefs, ruleColor } from "./listView";

const item = (id: string, status: string) => ({ id, status }) as unknown as Issue;

describe("parseListPrefs", () => {
  it("falls back to defaults on missing or bad data", () => {
    expect(parseListPrefs(null)).toEqual(DEFAULT_LIST_PREFS);
    expect(parseListPrefs("nope")).toEqual(DEFAULT_LIST_PREFS);
  });

  it("keeps valid settings and drops invalid rules", () => {
    const prefs = parseListPrefs(
      JSON.stringify({
        hideDone: true,
        showHierarchy: false,
        showChart: true,
        chartBy: "priority",
        rules: [
          { id: "1", jql: "priority = High", color: "red" },
          { id: "2", jql: "status = Done", color: "pink" },
          "junk",
        ],
      }),
    );
    expect(prefs).toEqual({
      hideDone: true,
      showHierarchy: false,
      showChart: true,
      chartBy: "priority",
      rules: [{ id: "1", jql: "priority = High", color: "red" }],
    });
    expect(parseListPrefs('{"chartBy":"sprint"}').chartBy).toBe("status");
  });
});

describe("countBy", () => {
  it("counts per bucket, largest first then by label", () => {
    const issues = [item("A-1", "DONE"), item("A-2", "TODO"), item("A-3", "DONE"), item("A-4", "OPEN")];
    expect(countBy(issues, (issue) => [issue.status, issue.status.toLowerCase()])).toEqual([
      { key: "DONE", label: "done", count: 2 },
      { key: "OPEN", label: "open", count: 1 },
      { key: "TODO", label: "todo", count: 1 },
    ]);
  });
});

describe("ruleColor", () => {
  it("uses the first matching rule", () => {
    const rules = [
      { color: "red" as const, matches: (issue: Issue) => issue.status === "TODO" },
      { color: "green" as const, matches: () => true },
    ];
    expect(ruleColor(item("A-1", "TODO"), rules)).toBe("red");
    expect(ruleColor(item("A-2", "DONE"), rules)).toBe("green");
    expect(ruleColor(item("A-3", "DONE"), [])).toBeNull();
  });
});
