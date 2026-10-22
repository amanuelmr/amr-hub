import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMELINE_PREFS,
  parseTimelinePrefs,
  addDays,
  applyDrag,
  barGeometry,
  barSpan,
  diffDays,
  headerSegments,
  pixelsToDays,
  timelineRange,
} from "./timelineMath";

describe("barSpan", () => {
  it("uses start and due when both exist", () => {
    expect(
      barSpan({
        startDate: "2026-10-01T00:00:00.000Z",
        dueDate: "2026-10-10T00:00:00.000Z",
        createdAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toEqual({ start: "2026-10-01", end: "2026-10-10", inferred: false });
  });

  it("falls back to createdAt when only due is set", () => {
    expect(
      barSpan({
        startDate: null,
        dueDate: "2026-10-10",
        createdAt: "2026-10-02T15:00:00.000Z",
      }),
    ).toEqual({ start: "2026-10-02", end: "2026-10-10", inferred: true });
  });

  it("clamps a creation date after the due date", () => {
    expect(
      barSpan({
        startDate: null,
        dueDate: "2026-10-10",
        createdAt: "2026-10-20T00:00:00.000Z",
      })?.start,
    ).toBe("2026-10-10");
  });

  it("uses a default length when only start is set", () => {
    expect(
      barSpan({ startDate: "2026-10-01", dueDate: null, createdAt: "2026-09-01" }),
    ).toEqual({ start: "2026-10-01", end: "2026-10-14", inferred: true });
  });

  it("returns null when unscheduled", () => {
    expect(
      barSpan({ startDate: null, dueDate: null, createdAt: "2026-09-01" }),
    ).toBeNull();
  });
});

describe("applyDrag", () => {
  const span = { start: "2026-10-05", end: "2026-10-09" };

  it("moves both ends", () => {
    expect(applyDrag(span, "move", 3)).toEqual({
      start: "2026-10-08",
      end: "2026-10-12",
    });
  });

  it("resizes the start without crossing the end", () => {
    expect(applyDrag(span, "start", -2).start).toBe("2026-10-03");
    expect(applyDrag(span, "start", 10)).toEqual({
      start: "2026-10-09",
      end: "2026-10-09",
    });
  });

  it("resizes the end without crossing the start", () => {
    expect(applyDrag(span, "end", 2).end).toBe("2026-10-11");
    expect(applyDrag(span, "end", -10).end).toBe("2026-10-05");
  });

  it("crosses month boundaries", () => {
    expect(applyDrag({ start: "2026-10-30", end: "2026-10-31" }, "move", 2)).toEqual({
      start: "2026-11-01",
      end: "2026-11-02",
    });
  });
});

describe("date helpers", () => {
  it("adds and diffs days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-01", "2026-10-15")).toBe(14);
  });

  it("rounds pixels to whole days", () => {
    expect(pixelsToDays(47, 32)).toBe(1);
    expect(pixelsToDays(-50, 32)).toBe(-2);
    expect(pixelsToDays(5, 32)).toBe(0);
  });

  it("computes bar geometry", () => {
    expect(
      barGeometry({ start: "2026-10-03", end: "2026-10-04" }, "2026-10-01", 10),
    ).toEqual({ left: 20, width: 20 });
  });
});

describe("timelineRange", () => {
  it("snaps to month boundaries and pads around today", () => {
    const range = timelineRange([], "2026-10-16", "WEEKS");
    expect(range.start).toBe("2026-09-01");
    expect(range.end).toBe("2027-04-30");
    expect(range.days).toBe(diffDays(range.start, range.end) + 1);
  });

  it("snaps to quarters and covers early dates", () => {
    const range = timelineRange(["2026-02-10"], "2026-10-16", "QUARTERS");
    expect(range.start).toBe("2026-01-01");
    expect(range.end.endsWith("-12-31") || range.end.endsWith("-09-30") ||
      range.end.endsWith("-06-30") || range.end.endsWith("-03-31")).toBe(true);
  });
});

describe("headerSegments", () => {
  it("builds month and week rows that cover the range", () => {
    const { top, bottom } = headerSegments("2026-10-01", "2026-11-30", "WEEKS");
    expect(top.map((segment) => segment.label)).toEqual(["Oct 2026", "Nov 2026"]);
    expect(top.reduce((total, segment) => total + segment.days, 0)).toBe(61);
    expect(bottom[0]).toMatchObject({ offset: 0, days: 4 });
    expect(bottom.reduce((total, segment) => total + segment.days, 0)).toBe(61);
  });

  it("labels quarters and years at the widest zoom", () => {
    const { top, bottom } = headerSegments("2026-01-01", "2026-12-31", "QUARTERS");
    expect(top).toHaveLength(1);
    expect(bottom.map((segment) => segment.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });
});

describe("parseTimelinePrefs", () => {
  it("defaults and reads stored values", () => {
    expect(parseTimelinePrefs(null)).toEqual(DEFAULT_TIMELINE_PREFS);
    expect(parseTimelinePrefs('{"hideDone":true,"showDependencies":false,"barColor":"status"}')).toEqual({
      hideDone: true,
      showDependencies: false,
      showWarnings: true,
      barColor: "status",
    });
  });
});
