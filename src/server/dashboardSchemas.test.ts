import { describe, expect, it } from "vitest";
import {
  createDashboardSchema,
  defaultGadgets,
  gadgetsSchema,
  parseStoredGadgets,
  updateDashboardSchema,
} from "./dashboardSchemas";

describe("dashboard schemas", () => {
  it("accepts known gadget types and defaults config", () => {
    const result = gadgetsSchema.safeParse([
      { id: "a", type: "PIE_CHART", config: { groupBy: "status", projectId: null } },
      { id: "b", type: "ACTIVITY_STREAM" },
    ]);
    expect(result.success).toBe(true);
    expect(result.success && result.data[1].config).toEqual({});
  });

  it("rejects unknown gadget types and invalid periods", () => {
    expect(gadgetsSchema.safeParse([{ id: "a", type: "NOPE", config: {} }]).success).toBe(false);
    expect(
      gadgetsSchema.safeParse([
        { id: "a", type: "CREATED_VS_RESOLVED", config: { days: 12 } },
      ]).success,
    ).toBe(false);
  });

  it("strips unknown config keys", () => {
    const result = gadgetsSchema.parse([
      { id: "a", type: "LABEL_HEATMAP", config: { evil: "<script>" } },
    ]);
    expect(result[0].config).toEqual({});
  });

  it("caps the gadget count", () => {
    const many = Array.from({ length: 31 }, (_, index) => ({
      id: `g${index}`,
      type: "ACTIVITY_STREAM",
    }));
    expect(gadgetsSchema.safeParse(many).success).toBe(false);
  });

  it("validates create and update bodies strictly", () => {
    expect(createDashboardSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createDashboardSchema.safeParse({ name: "Ops" }).success).toBe(true);
    expect(updateDashboardSchema.safeParse({ owner: "x" }).success).toBe(false);
    expect(updateDashboardSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });
});

describe("parseStoredGadgets", () => {
  it("returns an empty list for bad JSON or non-arrays", () => {
    expect(parseStoredGadgets("{")).toEqual([]);
    expect(parseStoredGadgets('{"a":1}')).toEqual([]);
    expect(parseStoredGadgets(null)).toEqual([]);
  });

  it("drops invalid and duplicate gadgets but keeps the rest", () => {
    const stored = JSON.stringify([
      { id: "a", type: "WATCHED_ISSUES", config: {} },
      { id: "b", type: "BOGUS", config: {} },
      { id: "a", type: "PIE_CHART", config: {} },
      { id: "c", type: "SPRINT_HEALTH" },
    ]);
    expect(parseStoredGadgets(stored).map((gadget) => gadget.id)).toEqual(["a", "c"]);
  });

  it("round-trips the default gadgets", () => {
    const defaults = defaultGadgets();
    expect(parseStoredGadgets(JSON.stringify(defaults))).toEqual(defaults);
  });
});
