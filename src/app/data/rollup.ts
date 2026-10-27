import type { Issue } from "./issues";
import { isDoneStatus } from "./workflow";

type RollupSource = Pick<
  Issue,
  | "id"
  | "parentId"
  | "status"
  | "estimate"
  | "originalEstimateMinutes"
  | "remainingEstimateMinutes"
  | "timeSpentMinutes"
>;

/** An item's own numbers plus everything beneath it, at any depth. */
export type RollupTotals = {
  points: number;
  /** Points on finished items, for "x of y points done". */
  donePoints: number;
  originalMinutes: number;
  remainingMinutes: number;
  spentMinutes: number;
  /** Items beneath this one (children, grandchildren…). */
  descendants: number;
  doneDescendants: number;
  /** Items in the total, including this one, without story points. */
  unestimated: number;
};

const EMPTY: RollupTotals = {
  points: 0,
  donePoints: 0,
  originalMinutes: 0,
  remainingMinutes: 0,
  spentMinutes: 0,
  descendants: 0,
  doneDescendants: 0,
  unestimated: 0,
};

/**
 * Totals for every item: its own estimates and time plus all of its
 * descendants'. Parent links that loop are cut so totals stay finite.
 */
export function buildRollups(issues: RollupSource[]): Map<string, RollupTotals> {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const childrenOf = new Map<string, RollupSource[]>();
  for (const issue of issues) {
    if (!issue.parentId || !byId.has(issue.parentId)) continue;
    childrenOf.set(issue.parentId, [...(childrenOf.get(issue.parentId) ?? []), issue]);
  }

  const totals = new Map<string, RollupTotals>();
  const visiting = new Set<string>();

  const total = (issue: RollupSource): RollupTotals => {
    const known = totals.get(issue.id);
    if (known) return known;
    if (visiting.has(issue.id)) return EMPTY;
    visiting.add(issue.id);

    const done = isDoneStatus(issue.status);
    const sum: RollupTotals = {
      points: issue.estimate ?? 0,
      donePoints: done ? (issue.estimate ?? 0) : 0,
      originalMinutes: issue.originalEstimateMinutes ?? 0,
      // Finished work has nothing left, whatever its stale estimate says.
      remainingMinutes: done ? 0 : (issue.remainingEstimateMinutes ?? 0),
      spentMinutes: issue.timeSpentMinutes,
      descendants: 0,
      doneDescendants: 0,
      unestimated: issue.estimate === null ? 1 : 0,
    };
    for (const child of childrenOf.get(issue.id) ?? []) {
      const childTotal = total(child);
      sum.points += childTotal.points;
      sum.donePoints += childTotal.donePoints;
      sum.originalMinutes += childTotal.originalMinutes;
      sum.remainingMinutes += childTotal.remainingMinutes;
      sum.spentMinutes += childTotal.spentMinutes;
      sum.descendants += 1 + childTotal.descendants;
      sum.doneDescendants += (isDoneStatus(child.status) ? 1 : 0) + childTotal.doneDescendants;
      sum.unestimated += childTotal.unestimated;
    }

    visiting.delete(issue.id);
    totals.set(issue.id, sum);
    return sum;
  };

  for (const issue of issues) total(issue);
  return totals;
}
