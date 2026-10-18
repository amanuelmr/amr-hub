import { describe, expect, it } from "vitest";
import { isDependencyConflict } from "./DependencyLayer";

describe("timeline dependency conflicts", () => {
  it("flags a blocker that ends after the blocked work starts", () => {
    expect(
      isDependencyConflict(
        { start: "2026-10-12", end: "2026-10-20" },
        { start: "2026-10-18", end: "2026-10-28" },
      ),
    ).toBe(true);
  });

  it("accepts a blocker that finishes before the blocked work starts", () => {
    expect(
      isDependencyConflict(
        { start: "2026-10-12", end: "2026-10-17" },
        { start: "2026-10-18", end: "2026-10-28" },
      ),
    ).toBe(false);
  });
});
