import { describe, expect, it } from "vitest";
import {
  formatReleaseNotes,
  groupReleaseNotes,
  isVersionOverdue,
  versionProgress,
  type ProjectVersion,
} from "./releaseNotes";

const version: ProjectVersion = {
  id: "v1",
  name: "1.0",
  description: null,
  status: "UNRELEASED",
  startDate: null,
  releaseDate: "2026-10-10T12:00:00.000Z",
  releasedAt: null,
  issueCount: 4,
  doneCount: 2,
  inProgressCount: 1,
};

describe("versionProgress", () => {
  it("splits issues into done / in progress / to do", () => {
    expect(versionProgress(version)).toEqual({
      toDo: 1,
      donePercent: 50,
      inProgressPercent: 25,
      toDoPercent: 25,
    });
    expect(
      versionProgress({
        ...version,
        issueCount: 0,
        doneCount: 0,
        inProgressCount: 0,
      }).donePercent,
    ).toBe(0);
  });
});

describe("isVersionOverdue", () => {
  it("flags unreleased versions after their release day", () => {
    expect(isVersionOverdue(version, new Date("2026-10-10T20:00:00Z"))).toBe(
      false,
    );
    expect(isVersionOverdue(version, new Date("2026-10-11T01:00:00Z"))).toBe(
      true,
    );
    expect(
      isVersionOverdue(
        { ...version, status: "RELEASED" },
        new Date("2027-01-01"),
      ),
    ).toBe(false);
    expect(isVersionOverdue({ ...version, releaseDate: null })).toBe(false);
  });
});

describe("release notes", () => {
  const issues = [
    { id: "ENG-3", title: "Fix crash", kind: "BUG" as const },
    { id: "ENG-1", title: "Login", kind: "STORY" as const },
    { id: "ENG-2", title: "Cleanup", kind: "TASK" as const },
  ];

  it("groups by kind in Jira order", () => {
    expect(groupReleaseNotes(issues).map((group) => group.heading)).toEqual([
      "Stories",
      "Bugs",
      "Tasks",
    ]);
  });

  it("formats copyable text", () => {
    expect(formatReleaseNotes("1.0", issues)).toBe(
      [
        "Release notes - 1.0",
        "",
        "## Stories",
        "- [ENG-1] Login",
        "",
        "## Bugs",
        "- [ENG-3] Fix crash",
        "",
        "## Tasks",
        "- [ENG-2] Cleanup",
      ].join("\n"),
    );
    expect(formatReleaseNotes("2.0", [])).toContain("No issues");
  });
});
