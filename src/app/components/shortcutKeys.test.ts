import { describe, expect, it } from "vitest";
import { goToDestination, isTypingTarget, issueIdFromPath } from "./shortcutKeys";

describe("shortcut helpers", () => {
  it("resolves g-sequences", () => {
    expect(goToDestination("w", null)).toBe("/your-work");
    expect(goToDestination("D", null)).toBe("/dashboards");
    expect(goToDestination("b", "p1")).toBe("/projects/p1/board");
    expect(goToDestination("l", null)).toBeNull();
    expect(goToDestination("z", "p1")).toBeNull();
  });

  it("reads the issue key from issue pages only", () => {
    expect(issueIdFromPath("/issues/AMR-12")).toBe("AMR-12");
    expect(issueIdFromPath("/issues/new")).toBeNull();
    expect(issueIdFromPath("/issues")).toBeNull();
    expect(issueIdFromPath("/issues/AMR-1/edit")).toBeNull();
  });

  it("treats non-elements as not typing", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});
