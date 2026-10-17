import type { Cycle, Issue } from "./issues";
import { isDoneStatus } from "./workflow";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type CyclePhase = "past" | "current" | "upcoming";

export function getCyclePhase(cycle: Cycle, now = new Date()): CyclePhase {
  const timestamp = now.getTime();

  if (timestamp < new Date(cycle.startDate).getTime()) return "upcoming";
  if (timestamp > new Date(cycle.endDate).getTime()) return "past";
  return "current";
}

export function findCurrentCycle(cycles: Cycle[], now = new Date()) {
  return (
    cycles.find((cycle) => getCyclePhase(cycle, now) === "current") ?? null
  );
}

export function findPlanningCycle(cycles: Cycle[], now = new Date()) {
  return (
    findCurrentCycle(cycles, now) ??
    cycles.find((cycle) => getCyclePhase(cycle, now) === "upcoming") ??
    cycles.at(-1) ??
    null
  );
}

export function formatCycleDateRange(cycle: Cycle) {
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(new Date(cycle.startDate))} - ${formatter.format(
    new Date(cycle.endDate),
  )}`;
}

export function getCycleMetrics(
  cycle: Cycle,
  issues: Issue[],
  now = new Date(),
) {
  const scopedIssues = issues.filter((issue) => issue.cycleId === cycle.id);
  const pointTotal = (items: Issue[]) =>
    items.reduce((total, issue) => total + (issue.estimate ?? 0), 0);
  const plannedPoints = pointTotal(scopedIssues);
  const completedPoints = pointTotal(
    scopedIssues.filter((issue) => isDoneStatus(issue.status)),
  );
  const remainingPoints = Math.max(plannedPoints - completedPoints, 0);
  const riskWindow = now.getTime() + 3 * DAY_IN_MS;
  const atRisk = scopedIssues.filter((issue) => {
    if (isDoneStatus(issue.status)) return false;
    if (issue.priority === "URGENT") return true;
    if (!issue.dueDate) return false;
    return new Date(issue.dueDate).getTime() <= riskWindow;
  }).length;
  const totalDays = Math.max(
    1,
    Math.ceil(
      (new Date(cycle.endDate).getTime() -
        new Date(cycle.startDate).getTime()) /
        DAY_IN_MS,
    ),
  );
  const elapsedDays = Math.min(
    totalDays,
    Math.max(
      1,
      Math.floor(
        (now.getTime() - new Date(cycle.startDate).getTime()) / DAY_IN_MS,
      ) + 1,
    ),
  );

  return {
    issues: scopedIssues,
    plannedPoints,
    completedPoints,
    remainingPoints,
    atRisk,
    unestimated: scopedIssues.filter((issue) => issue.estimate === null).length,
    completionPercent:
      plannedPoints === 0
        ? 0
        : Math.round((completedPoints / plannedPoints) * 100),
    capacityPercent:
      cycle.capacity === 0
        ? 0
        : Math.round((plannedPoints / cycle.capacity) * 100),
    totalDays,
    elapsedDays,
  };
}
