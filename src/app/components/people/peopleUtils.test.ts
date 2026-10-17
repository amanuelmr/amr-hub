import { describe, expect, it } from "vitest";
import {
  avatarTone,
  groupByCategory,
  initialsFor,
  matchesQuery,
  relativeTime,
  roleLabel,
} from "./peopleUtils";
import type { WorkItemSummary } from "./types";

function item(id: string, statusCategory: WorkItemSummary["statusCategory"]): WorkItemSummary {
  return {
    id,
    title: id,
    kind: "TASK",
    priority: "MEDIUM",
    status: "OPEN",
    statusName: "To do",
    statusCategory,
    projectId: "p",
    projectName: "P",
    projectKey: "P",
    assignee: null,
    teamId: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("people utils", () => {
  it("builds initials from first and last names, single names, or email", () => {
    expect(initialsFor("Ada Byron Lovelace")).toBe("AL");
    expect(initialsFor("cher")).toBe("CH");
    expect(initialsFor("  ", "zed@example.com")).toBe("ZE");
    expect(initialsFor("")).toBe("?");
  });

  it("picks a stable avatar tone", () => {
    expect(avatarTone("user-1")).toBe(avatarTone("user-1"));
    expect(avatarTone("x")).toMatch(/^var\(--/);
  });

  it("labels workspace roles", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("viewer")).toBe("Viewer");
    expect(roleLabel("billing")).toBe("Billing");
  });

  it("groups work by status category in Jira order and drops empty groups", () => {
    const groups = groupByCategory([item("A", "TODO"), item("B", "IN_PROGRESS"), item("C", "TODO")]);
    expect(groups.map((group) => group.id)).toEqual(["IN_PROGRESS", "TODO"]);
    expect(groups[1].issues.map((issue) => issue.id)).toEqual(["A", "C"]);
  });

  it("matches search queries across fields", () => {
    expect(matchesQuery("", "x")).toBe(true);
    expect(matchesQuery("ADA", "Ada Lovelace", null)).toBe(true);
    expect(matchesQuery("example", "Ada", "ada@example.com")).toBe(true);
    expect(matchesQuery("zzz", "Ada", undefined)).toBe(false);
  });

  it("formats relative time", () => {
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    expect(relativeTime("2026-10-16T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2026-10-16T11:00:00.000Z", now)).toBe("1h ago");
    expect(relativeTime("2026-10-14T12:00:00.000Z", now)).toBe("2d ago");
  });
});
