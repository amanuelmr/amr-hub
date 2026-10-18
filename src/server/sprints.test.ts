import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const {
  defaultSprintWindow,
  nextSprintName,
  parallelSprintConflict,
  sortSprints,
  sprintPoints,
} = await import("./sprints");

describe("parallelSprintConflict", () => {
  it("blocks a second active sprint unless parallel sprints are on", () => {
    expect(parallelSprintConflict([], false)).toBeNull();
    expect(parallelSprintConflict(["AMR Sprint 1"], false)).toMatch(
      /AMR Sprint 1 is already active/,
    );
    expect(parallelSprintConflict(["AMR Sprint 1"], true)).toBeNull();
    expect(
      parallelSprintConflict(["AMR Sprint 1", "AMR Sprint 2"], true),
    ).toBeNull();
  });
});

describe("nextSprintName", () => {
  it("numbers sprints after existing ones", () => {
    expect(nextSprintName("AMR", [])).toBe("AMR Sprint 1");
    expect(nextSprintName("AMR", ["AMR Sprint 1", "AMR Sprint 4"])).toBe(
      "AMR Sprint 5",
    );
    expect(nextSprintName("AMR", ["Launch", "AMR Sprint 3"])).toBe(
      "AMR Sprint 4",
    );
  });

  it("follows the latest sprint's naming pattern", () => {
    expect(nextSprintName("AMR", ["AMR Sprint 1", "Release train 7"])).toBe(
      "Release train 8",
    );
    expect(
      nextSprintName("AMR", ["Release train 8", "Release train 7"]),
    ).toBe("Release train 9");
    expect(nextSprintName("AMR", ["Launch"])).toBe("AMR Sprint 2");
  });
});

describe("sprintPoints", () => {
  const issues = [
    { kind: "STORY", status: "DONE", estimate: 5 },
    { kind: "BUG", status: "OPEN", estimate: 3 },
    { kind: "EPIC", status: "OPEN", estimate: 13 },
    { kind: "SUBTASK", status: "DONE", estimate: 2 },
    { kind: "TASK", status: "IN_PROGRESS", estimate: null },
  ];

  it("sums committed points without epics and subtasks", () => {
    expect(sprintPoints(issues)).toBe(8);
  });

  it("sums only done points when asked", () => {
    expect(sprintPoints(issues, true)).toBe(5);
  });
});

describe("defaultSprintWindow", () => {
  const now = new Date("2026-10-16T10:00:00.000Z");

  it("starts today when no sprint is scheduled", () => {
    expect(defaultSprintWindow(null, now)).toEqual({
      startDate: "2026-10-16",
      endDate: "2026-10-29",
    });
  });

  it("starts the day after the latest future sprint", () => {
    expect(
      defaultSprintWindow(new Date("2026-10-30T23:59:59.999Z"), now, 7),
    ).toEqual({ startDate: "2026-10-31", endDate: "2026-11-06" });
  });
});

describe("sortSprints", () => {
  it("orders closed, active then future by start date", () => {
    const sorted = sortSprints([
      { id: "f2", state: "FUTURE", startDate: "2026-11-02" },
      { id: "a", state: "ACTIVE", startDate: "2026-10-01" },
      { id: "f1", state: "FUTURE", startDate: "2026-10-20" },
      { id: "c", state: "CLOSED", startDate: "2026-09-01" },
    ]);
    expect(sorted.map((sprint) => sprint.id)).toEqual(["c", "a", "f1", "f2"]);
  });
});
