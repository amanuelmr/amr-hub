import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_PREFS,
  buildMonthWeeks,
  buildWeek,
  parseCalendarPrefs,
  weekdayNames,
  issueRange,
  layoutWeek,
  moveToDay,
  shiftKey,
  sprintForDay,
} from "./calendarMath";

describe("buildMonthWeeks", () => {
  it("covers the month in Sunday-first weeks", () => {
    const weeks = buildMonthWeeks(new Date(2026, 9, 16));
    expect(weeks[0][0]).toBe("2026-09-27");
    expect(weeks.at(-1)?.at(-1)).toBe("2026-10-31");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.flat()).toContain("2026-10-31");
  });
});

describe("issueRange", () => {
  it("needs a due date", () => {
    expect(issueRange({ startDate: "2026-10-01", dueDate: null })).toBeNull();
  });

  it("spans from start to due", () => {
    expect(
      issueRange({
        startDate: "2026-10-01T00:00:00.000Z",
        dueDate: "2026-10-04T00:00:00.000Z",
      }),
    ).toEqual({ start: "2026-10-01", end: "2026-10-04" });
  });

  it("ignores a start after the due date", () => {
    expect(issueRange({ startDate: "2026-10-09", dueDate: "2026-10-04" })).toEqual({
      start: "2026-10-04",
      end: "2026-10-04",
    });
  });
});

describe("moveToDay", () => {
  it("sets only the due date for single-day issues", () => {
    expect(moveToDay({ startDate: null, dueDate: "2026-10-04" }, "2026-10-10")).toEqual({
      dueDate: "2026-10-10",
    });
  });

  it("drops an unscheduled issue on a day", () => {
    expect(moveToDay({ startDate: null, dueDate: null }, "2026-10-10")).toEqual({
      dueDate: "2026-10-10",
    });
  });

  it("keeps the span length when a start date exists", () => {
    expect(
      moveToDay({ startDate: "2026-10-01", dueDate: "2026-10-04" }, "2026-11-02"),
    ).toEqual({ dueDate: "2026-11-02", startDate: "2026-10-30" });
  });
});

describe("layoutWeek", () => {
  const week = [
    "2026-10-11",
    "2026-10-12",
    "2026-10-13",
    "2026-10-14",
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
  ];

  it("clips spans to the week and packs lanes", () => {
    const placements = layoutWeek(week, [
      { item: "a", range: { start: "2026-10-08", end: "2026-10-12" } },
      { item: "b", range: { start: "2026-10-12", end: "2026-10-20" } },
      { item: "c", range: { start: "2026-10-14", end: "2026-10-14" } },
      { item: "d", range: { start: "2026-10-01", end: "2026-10-02" } },
    ]);
    expect(placements.map((placement) => placement.item)).toEqual(["a", "b", "c"]);
    expect(placements[0]).toMatchObject({
      startColumn: 0,
      span: 2,
      lane: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(placements[1]).toMatchObject({
      startColumn: 1,
      span: 6,
      lane: 1,
      continuesAfter: true,
    });
    expect(placements[2]).toMatchObject({ startColumn: 3, span: 1, lane: 0 });
  });
});

describe("helpers", () => {
  it("shifts keys across months", () => {
    expect(shiftKey("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("finds the sprint covering a day", () => {
    const sprints = [
      { id: "s1", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-14T23:59:59.000Z" },
    ];
    expect(sprintForDay("2026-10-14", sprints)?.id).toBe("s1");
    expect(sprintForDay("2026-10-15", sprints)).toBeNull();
  });
});

describe("week options", () => {
  it("builds Monday-first months and single weeks", () => {
    const weeks = buildMonthWeeks(new Date(2026, 9, 15), 1);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(buildWeek(new Date(2026, 9, 22), 1)).toEqual([
      ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
    ]);
    expect(weekdayNames(1)[0]).toBe("Mon");
  });

  it("parses stored calendar settings safely", () => {
    expect(parseCalendarPrefs(null)).toEqual(DEFAULT_CALENDAR_PREFS);
    expect(parseCalendarPrefs("{bad")).toEqual(DEFAULT_CALENDAR_PREFS);
    expect(parseCalendarPrefs('{"mode":"week","weekStartsOn":1,"colorBy":"type","showKey":true}')).toEqual({
      mode: "week",
      weekStartsOn: 1,
      colorBy: "type",
      showKey: true,
    });
  });
});
