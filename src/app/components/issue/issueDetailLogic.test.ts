import { describe, expect, it } from "vitest";
import {
  childProgress,
  eligibleParents,
  formatBytes,
  groupLinks,
  isIssuePanelRoute,
  kindConversions,
  matchesIssueQuery,
  relativeTime,
  sortComments,
  timeTrackingSegments,
} from "./issueDetailLogic";
import type { IssueLinkSummary, IssueRef } from "../../data/issues";

const ref = (id: string, overrides: Partial<IssueRef> = {}): IssueRef => ({
  id,
  title: `Issue ${id}`,
  status: "OPEN",
  kind: "TASK",
  priority: "MEDIUM",
  assignee: null,
  estimate: null,
  ...overrides,
});

describe("eligibleParents", () => {
  const candidates = [
    { id: "A-1", title: "Epic", kind: "EPIC" as const, projectId: "p" },
    { id: "A-2", title: "Story", kind: "STORY" as const, projectId: "p" },
    { id: "A-3", title: "Sub", kind: "SUBTASK" as const, projectId: "p" },
    { id: "B-1", title: "Other epic", kind: "EPIC" as const, projectId: "q" },
  ];

  it("offers epics in the same project for standard issues", () => {
    const result = eligibleParents(
      { id: "A-9", kind: "STORY", projectId: "p" },
      candidates,
    );
    expect(result.map((issue) => issue.id)).toEqual(["A-1"]);
  });

  it("offers standard issues for subtasks", () => {
    const result = eligibleParents(
      { id: "A-9", kind: "SUBTASK", projectId: "p" },
      candidates,
    );
    expect(result.map((issue) => issue.id)).toEqual(["A-2"]);
  });

  it("offers nothing for epics or the issue itself", () => {
    expect(
      eligibleParents({ id: "A-1", kind: "EPIC", projectId: "p" }, candidates),
    ).toEqual([]);
    expect(
      eligibleParents(
        { id: "A-2", kind: "SUBTASK", projectId: "p" },
        candidates,
      ),
    ).toEqual([]);
  });
});

describe("kindConversions", () => {
  it("lets a parentless task become an epic but not a subtask", () => {
    const kinds = kindConversions({ kind: "TASK", childCount: 0, parent: null });
    expect(kinds).toContain("EPIC");
    expect(kinds).not.toContain("SUBTASK");
  });

  it("lets a task under a story become a subtask", () => {
    const kinds = kindConversions({
      kind: "TASK",
      childCount: 0,
      parent: { kind: "STORY" },
    });
    expect(kinds).toContain("SUBTASK");
    expect(kinds).not.toContain("EPIC");
  });

  it("keeps an epic with children an epic", () => {
    expect(
      kindConversions({ kind: "EPIC", childCount: 2, parent: null }),
    ).toEqual(["EPIC"]);
  });
});

describe("timeTrackingSegments", () => {
  it("splits logged and remaining time", () => {
    expect(timeTrackingSegments(60, 180, 240)).toEqual({
      spentPercent: 25,
      remainingPercent: 75,
      overEstimate: false,
    });
  });

  it("flags work beyond the original estimate", () => {
    const result = timeTrackingSegments(300, 60, 240);
    expect(result.overEstimate).toBe(true);
    expect(result.spentPercent).toBeCloseTo(83.3);
  });

  it("handles no tracking", () => {
    expect(timeTrackingSegments(0, null, null).spentPercent).toBe(0);
  });
});

describe("childProgress", () => {
  it("counts done children", () => {
    expect(
      childProgress([ref("A-1", { status: "DONE" }), ref("A-2"), ref("A-3")]),
    ).toEqual({ done: 1, total: 3, percent: 33 });
  });
});

describe("groupLinks", () => {
  it("groups by link type in Jira order", () => {
    const links: IssueLinkSummary[] = [
      { id: "1", type: "RELATES_TO", issue: ref("A-1") },
      { id: "2", type: "BLOCKS", issue: ref("A-2") },
      { id: "3", type: "RELATES_TO", issue: ref("A-3") },
    ];
    const groups = groupLinks(links);
    expect(groups.map((group) => group.type)).toEqual(["BLOCKS", "RELATES_TO"]);
    expect(groups[1].links).toHaveLength(2);
  });
});

describe("sortComments", () => {
  const comments = [
    { id: "a", body: "", author: "", createdAt: "2026-01-01T00:00:00Z" },
    { id: "b", body: "", author: "", createdAt: "2026-02-01T00:00:00Z" },
  ];
  it("sorts newest first or oldest first", () => {
    expect(sortComments(comments, "NEWEST").map((c) => c.id)).toEqual([
      "b",
      "a",
    ]);
    expect(sortComments(comments, "OLDEST").map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("misc helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("matches issue keys and titles", () => {
    const issue = { id: "AMR-12", title: "Fix checkout" };
    expect(matchesIssueQuery(issue, "amr-1")).toBe(true);
    expect(matchesIssueQuery(issue, "checkout")).toBe(true);
    expect(matchesIssueQuery(issue, "billing")).toBe(false);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  it("formats recent and older timestamps", () => {
    expect(relativeTime("2026-10-16T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-10-16T11:59:00Z", now)).toBe("1 minute ago");
    expect(relativeTime("2026-10-16T10:00:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-13T12:00:00Z", now)).toBe("3 days ago");
    expect(relativeTime("2025-10-01T12:00:00Z", now)).toBe("1 year ago");
  });
});

describe("isIssuePanelRoute", () => {
  it("matches the backlog and the issues detail view only", () => {
    const empty = new URLSearchParams();
    expect(isIssuePanelRoute("/projects/p1/backlog", empty)).toBe(true);
    expect(isIssuePanelRoute("/projects/p1/board", empty)).toBe(false);
    expect(isIssuePanelRoute("/issues", empty)).toBe(false);
    expect(
      isIssuePanelRoute("/issues", new URLSearchParams("view=detail")),
    ).toBe(true);
    expect(
      isIssuePanelRoute("/issues/WEB-1", new URLSearchParams("view=detail")),
    ).toBe(false);
  });
});
