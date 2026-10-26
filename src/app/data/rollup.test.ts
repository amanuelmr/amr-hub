import { describe, expect, it } from "vitest";
import type { Issue } from "./issues";
import { buildRollups } from "./rollup";

const item = (
  id: string,
  parentId: string | null,
  fields: Partial<Issue> = {},
) =>
  ({
    id,
    parentId,
    status: "OPEN",
    estimate: null,
    originalEstimateMinutes: null,
    remainingEstimateMinutes: null,
    timeSpentMinutes: 0,
    ...fields,
  }) as Issue;

describe("buildRollups", () => {
  it("sums an item with all of its descendants", () => {
    const rollups = buildRollups([
      item("EPIC", null, { estimate: null }),
      item("S1", "EPIC", { estimate: 5, originalEstimateMinutes: 480, remainingEstimateMinutes: 240, timeSpentMinutes: 240 }),
      item("S2", "EPIC", { estimate: 3, status: "DONE", remainingEstimateMinutes: 60, timeSpentMinutes: 120 }),
      item("T1", "S1", { estimate: 2, timeSpentMinutes: 30, remainingEstimateMinutes: 90 }),
    ]);
    expect(rollups.get("EPIC")).toEqual({
      points: 10,
      donePoints: 3,
      originalMinutes: 480,
      remainingMinutes: 330,
      spentMinutes: 390,
      descendants: 3,
      doneDescendants: 1,
      unestimated: 1,
    });
    expect(rollups.get("S1")).toMatchObject({ points: 7, spentMinutes: 270, descendants: 1 });
    expect(rollups.get("T1")).toMatchObject({ points: 2, descendants: 0 });
  });

  it("ignores missing parents and survives loops", () => {
    const rollups = buildRollups([
      item("A", "B", { estimate: 1 }),
      item("B", "A", { estimate: 2 }),
      item("C", "GONE", { estimate: 3 }),
    ]);
    expect(rollups.get("C")).toMatchObject({ points: 3, descendants: 0 });
    expect(rollups.get("A")!.points).toBeGreaterThan(0);
    expect(rollups.get("B")!.points).toBeGreaterThan(0);
  });
});
