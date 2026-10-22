import { describe, expect, it } from "vitest";
import { groupRecent, recentGroup } from "./recentGroups";

const now = new Date(2026, 9, 22, 15, 0);

describe("recentGroup", () => {
  it("buckets by calendar day, week and month", () => {
    expect(recentGroup(new Date(2026, 9, 22, 9).toISOString(), now)).toBe("Today");
    expect(recentGroup(new Date(2026, 9, 21, 23).toISOString(), now)).toBe("Yesterday");
    expect(recentGroup(new Date(2026, 9, 17).toISOString(), now)).toBe("This week");
    expect(recentGroup(new Date(2026, 9, 3).toISOString(), now)).toBe("This month");
    expect(recentGroup(new Date(2026, 8, 30).toISOString(), now)).toBe("Older");
  });

  it("drops empty groups and keeps order", () => {
    const groups = groupRecent(
      [
        { id: "a", viewedAt: new Date(2026, 9, 22, 10).toISOString() },
        { id: "b", viewedAt: new Date(2026, 8, 1).toISOString() },
        { id: "c", viewedAt: new Date(2026, 9, 22, 8).toISOString() },
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual(["Today", "Older"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "c"]);
  });
});
