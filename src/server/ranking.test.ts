import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const {
  InvalidRankTargetError,
  computeBlockRanks,
  planRankMove,
  rebalanceRanks,
} = await import("./ranking");

const ordered = [
  { id: "A", rank: 1000 },
  { id: "B", rank: 2000 },
  { id: "C", rank: 3000 },
  { id: "D", rank: 4000 },
];

describe("computeBlockRanks", () => {
  it("spaces ranks evenly between two neighbours", () => {
    expect(computeBlockRanks(1000, 2000, 3)).toEqual([1250, 1500, 1750]);
  });

  it("extends past open ends", () => {
    expect(computeBlockRanks(null, null, 2)).toEqual([1000, 2000]);
    expect(computeBlockRanks(5000, null, 2)).toEqual([6000, 7000]);
    expect(computeBlockRanks(null, 5000, 2)).toEqual([3000, 4000]);
  });

  it("asks for a rebalance when the gap is too small", () => {
    expect(computeBlockRanks(1, 1 + 1e-7, 1)).toBeNull();
    expect(computeBlockRanks(0, 0, 1)).toBeNull();
  });
});

describe("rebalanceRanks", () => {
  it("assigns spaced ranks in order", () => {
    expect([...rebalanceRanks(["x", "y"])]).toEqual([
      ["x", 1000],
      ["y", 2000],
    ]);
  });
});

describe("planRankMove", () => {
  it("places a block after an issue", () => {
    const plan = planRankMove({ ordered, movedIds: ["D"], afterId: "A" });
    expect(plan.rebalanced).toBe(false);
    expect(plan.ranks.get("D")).toBe(1500);
  });

  it("places a block before an issue", () => {
    const plan = planRankMove({ ordered, movedIds: ["A", "B"], beforeId: "D" });
    expect([...plan.ranks.values()]).toEqual([
      3000 + 1000 / 3,
      3000 + 2000 / 3,
    ]);
  });

  it("moves to the top when placed before the first issue", () => {
    const plan = planRankMove({ ordered, movedIds: ["C"], beforeId: "A" });
    expect(plan.ranks.get("C")).toBe(0);
  });

  it("appends to the end without a target", () => {
    const plan = planRankMove({ ordered, movedIds: ["A"] });
    expect(plan.ranks.get("A")).toBe(5000);
  });

  it("uses both neighbours when given", () => {
    const plan = planRankMove({
      ordered,
      movedIds: ["D"],
      afterId: "A",
      beforeId: "C",
    });
    expect(plan.ranks.get("D")).toBe(2000);
  });

  it("rebalances the project when ranks collide", () => {
    const tied = [
      { id: "A", rank: 0 },
      { id: "B", rank: 0 },
      { id: "C", rank: 0 },
    ];
    const plan = planRankMove({ ordered: tied, movedIds: ["C"], afterId: "A" });
    expect(plan.rebalanced).toBe(true);
    expect(Object.fromEntries(plan.ranks)).toEqual({
      A: 1000,
      C: 2000,
      B: 3000,
    });
  });

  it("rejects ranking relative to a moved issue", () => {
    expect(() =>
      planRankMove({ ordered, movedIds: ["A"], afterId: "A" }),
    ).toThrow(InvalidRankTargetError);
  });
});
