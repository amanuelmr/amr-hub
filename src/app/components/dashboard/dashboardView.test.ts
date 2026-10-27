import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_VIEW,
  parseDashboardView,
  stepSlide,
  toggleMinimized,
} from "./dashboardView";

describe("parseDashboardView", () => {
  it("keeps string ids and falls back on bad data", () => {
    expect(parseDashboardView(null)).toEqual(DEFAULT_DASHBOARD_VIEW);
    expect(parseDashboardView("{")).toEqual(DEFAULT_DASHBOARD_VIEW);
    expect(parseDashboardView('{"minimized":["a",2,"b"]}')).toEqual({ minimized: ["a", "b"] });
  });
});

describe("toggleMinimized", () => {
  it("adds and removes a gadget", () => {
    const once = toggleMinimized(DEFAULT_DASHBOARD_VIEW, "g1");
    expect(once.minimized).toEqual(["g1"]);
    expect(toggleMinimized(once, "g1").minimized).toEqual([]);
  });
});

describe("stepSlide", () => {
  it("wraps in both directions", () => {
    expect(stepSlide(0, 3, 1)).toBe(1);
    expect(stepSlide(2, 3, 1)).toBe(0);
    expect(stepSlide(0, 3, -1)).toBe(2);
    expect(stepSlide(0, 0, 1)).toBe(0);
  });
});
