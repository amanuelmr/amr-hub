import {
  ISSUE_KINDS,
  PRIORITY_LABELS,
  type Cycle,
  type Issue,
  type IssuePriority,
  type IssueStatus,
  type SavedView,
} from "./issues";
import {
  DEFAULT_STATUSES,
  DEFAULT_TYPES,
  isDoneStatus,
  isEpicLevel,
  isInProgressStatus,
  orderStatuses,
  statusCategory,
  statusName,
  typeName,
  type WorkTypeConfig,
  type WorkflowStatusConfig,
} from "./workflow";

/** Statuses used to read history ("changed status from X to Y") by name. */
export type StatusList = readonly Pick<
  WorkflowStatusConfig,
  "key" | "name" | "category" | "position"
>[];

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Granularity = "day" | "week" | "month";

type DateInput = Date | string | number;

function toTime(value: DateInput) {
  return new Date(value).getTime();
}

export function startOfUtcDay(value: DateInput) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function endOfUtcDay(value: DateInput) {
  return startOfUtcDay(value) + DAY_MS - 1;
}

export function dayKey(value: DateInput) {
  return new Date(startOfUtcDay(value)).toISOString().slice(0, 10);
}

/** Inclusive list of UTC day keys between two instants (capped at 2 years). */
export function eachDayKey(start: DateInput, end: DateInput) {
  const keys: string[] = [];
  const last = startOfUtcDay(end);
  for (
    let cursor = startOfUtcDay(start);
    cursor <= last && keys.length < 731;
    cursor += DAY_MS
  ) {
    keys.push(dayKey(cursor));
  }
  return keys;
}

/** Day -> same day, week -> Monday of the ISO week, month -> first of month. */
export function bucketKey(value: DateInput, granularity: Granularity) {
  const day = startOfUtcDay(value);
  if (granularity === "day") return dayKey(day);
  if (granularity === "week") {
    const offset = (new Date(day).getUTCDay() + 6) % 7;
    return dayKey(day - offset * DAY_MS);
  }
  const date = new Date(day);
  return dayKey(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function eachBucketKey(
  start: DateInput,
  end: DateInput,
  granularity: Granularity,
) {
  return [
    ...new Set(eachDayKey(start, end).map((key) => bucketKey(key, granularity))),
  ];
}

export function formatDayLabel(key: string, granularity: Granularity = "day") {
  const date = new Date(`${key}T00:00:00.000Z`);
  if (granularity === "month") {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Trailing moving average; early points average whatever is available. */
export function rollingAverage(values: number[], window: number) {
  const size = Math.max(1, Math.floor(window));
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - size + 1), index + 1);
    return slice.reduce((total, value) => total + value, 0) / slice.length;
  });
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/* ---------- history reconstruction from Activity rows ---------- */

export type HistoryEntry<T> = { at: number; value: T };

function statusesByName(statuses: StatusList) {
  const byName = new Map<string, IssueStatus>();
  // Configured names win; built-in names still resolve older history.
  for (const status of [...statuses, ...DEFAULT_STATUSES]) {
    const name = status.name.toLowerCase();
    if (!byName.has(name)) byName.set(name, status.key);
  }
  return byName;
}

export function parseStatusChange(
  description: string,
  statuses: StatusList = DEFAULT_STATUSES,
) {
  const match = /changed status from (.+) to (.+)$/i.exec(description.trim());
  if (!match) return null;
  const byName = statusesByName(statuses);
  const to = byName.get(match[2].trim().toLowerCase());
  if (!to) return null;
  return {
    from: byName.get(match[1].trim().toLowerCase()) ?? null,
    to,
  };
}

export type CycleChange =
  | { kind: "moved"; to: string }
  | { kind: "removed"; from: string | null };

export function parseCycleChange(description: string): CycleChange | null {
  const text = description.trim();
  if (/^removed the issue from its cycle$/i.test(text)) {
    return { kind: "removed", from: null };
  }
  const removed = /^removed the issue from (.+)$/i.exec(text);
  if (removed) return { kind: "removed", from: removed[1] };
  const moved = /^moved the issue to (.+)$/i.exec(text);
  if (moved) return { kind: "moved", to: moved[1] };
  return null;
}

export function parseEstimateChange(description: string) {
  const text = description.trim();
  if (/^removed the estimate$/i.test(text)) return { estimate: null };
  const match = /^set the estimate to (\d+) points?$/i.exec(text);
  return match ? { estimate: Number(match[1]) } : null;
}

function activityOfType(issue: Issue, type: string) {
  return (issue.activity ?? [])
    .filter((event) => event.type === type)
    .map((event) => ({ ...event, at: toTime(event.createdAt) }))
    .sort((left, right) => left.at - right.at);
}

export function valueAt<T>(history: HistoryEntry<T>[], at: number) {
  let current: T | undefined;
  for (const entry of history) {
    if (entry.at > at) break;
    current = entry.value;
  }
  return current;
}

/** Status over time; the first entry is the issue's creation. */
export function statusHistory(
  issue: Issue,
  statuses: StatusList = DEFAULT_STATUSES,
): HistoryEntry<IssueStatus>[] {
  const created = toTime(issue.createdAt);
  const changes = activityOfType(issue, "STATUS_CHANGED")
    .map((event) => ({
      at: event.at,
      change: parseStatusChange(event.description, statuses),
    }))
    .filter(
      (entry): entry is { at: number; change: NonNullable<ReturnType<typeof parseStatusChange>> } =>
        entry.change !== null,
    );

  if (changes.length === 0) {
    const resolved = issue.resolvedAt ? toTime(issue.resolvedAt) : null;
    if (isDoneStatus(issue.status) && resolved && resolved - created > 60_000) {
      return [
        { at: created, value: "OPEN" },
        { at: resolved, value: issue.status },
      ];
    }
    return [{ at: created, value: issue.status }];
  }

  const history: HistoryEntry<IssueStatus>[] = [
    { at: created, value: changes[0].change.from ?? "OPEN" },
    ...changes.map(({ at, change }) => ({
      at: Math.max(at, created),
      value: change.to,
    })),
  ];
  history[history.length - 1] = {
    ...history[history.length - 1],
    value: issue.status,
  };
  return history;
}

/** When the issue last entered Done (null if it is not done now). */
export function resolutionTime(
  issue: Issue,
  history = statusHistory(issue),
) {
  if (!isDoneStatus(issue.status)) return null;
  for (let index = history.length - 1; index > 0; index -= 1) {
    if (
      isDoneStatus(history[index].value) &&
      !isDoneStatus(history[index - 1].value)
    ) {
      return history[index].at;
    }
  }
  if (issue.resolvedAt) return toTime(issue.resolvedAt);
  return history[0].at;
}

export function firstInProgressTime(history: HistoryEntry<IssueStatus>[]) {
  return (
    history.find((entry) => isInProgressStatus(entry.value))
      ?.at ?? null
  );
}

/**
 * Sprint membership over time from CYCLE_CHANGED rows ("moved the issue to X",
 * "removed the issue from X"). The final state always matches the issue now.
 */
export function cycleHistory(
  issue: Issue,
  cycleIdByName: Map<string, string>,
): HistoryEntry<string | null>[] {
  const created = toTime(issue.createdAt);
  const changes = activityOfType(issue, "CYCLE_CHANGED")
    .map((event) => ({ at: event.at, change: parseCycleChange(event.description) }))
    .filter((entry): entry is { at: number; change: CycleChange } => entry.change !== null);

  if (changes.length === 0) return [{ at: created, value: issue.cycleId }];

  const resolveName = (name: string) =>
    cycleIdByName.get(name) ?? `name:${name}`;
  const first = changes[0].change;
  const initial =
    first.kind === "removed" && first.from ? resolveName(first.from) : null;
  const history: HistoryEntry<string | null>[] = [
    { at: created, value: initial },
    ...changes.map(({ at, change }) => ({
      at: Math.max(at, created),
      value: change.kind === "moved" ? resolveName(change.to) : null,
    })),
  ];
  history[history.length - 1] = {
    ...history[history.length - 1],
    value: issue.cycleId,
  };
  return history;
}

/**
 * Story points over time. The creation estimate isn't recorded, so an issue
 * whose estimate was later edited is treated as unestimated before that edit.
 */
export function estimateHistory(issue: Issue): HistoryEntry<number | null>[] {
  const created = toTime(issue.createdAt);
  const changes = activityOfType(issue, "ESTIMATE_CHANGED")
    .map((event) => ({ at: event.at, change: parseEstimateChange(event.description) }))
    .filter(
      (entry): entry is { at: number; change: { estimate: number | null } } =>
        entry.change !== null,
    );

  if (changes.length === 0) return [{ at: created, value: issue.estimate }];

  const history: HistoryEntry<number | null>[] = [
    { at: created, value: null },
    ...changes.map(({ at, change }) => ({
      at: Math.max(at, created),
      value: change.estimate,
    })),
  ];
  history[history.length - 1] = {
    ...history[history.length - 1],
    value: issue.estimate,
  };
  return history;
}

type IssueTimeline = {
  issue: Issue;
  created: number;
  status: HistoryEntry<IssueStatus>[];
  cycle: HistoryEntry<string | null>[];
  estimate: HistoryEntry<number | null>[];
};

function buildTimelines(
  issues: Issue[],
  cycles: Cycle[],
  statuses: StatusList = DEFAULT_STATUSES,
) {
  const cycleIdByName = new Map(cycles.map((cycle) => [cycle.name, cycle.id]));
  return issues
    .filter((issue) => !isEpicLevel(issue.kind))
    .map<IssueTimeline>((issue) => ({
      issue,
      created: toTime(issue.createdAt),
      status: statusHistory(issue, statuses),
      cycle: cycleHistory(issue, cycleIdByName),
      estimate: estimateHistory(issue),
    }));
}

function inCycleAt(timeline: IssueTimeline, cycleId: string, at: number) {
  return at >= timeline.created && valueAt(timeline.cycle, at) === cycleId;
}

function pointsInCycleAt(timeline: IssueTimeline, cycleId: string, at: number) {
  return inCycleAt(timeline, cycleId, at)
    ? valueAt(timeline.estimate, at) ?? 0
    : 0;
}

function doneAt(timeline: IssueTimeline, at: number) {
  return isDoneStatus(valueAt(timeline.status, at));
}

/* ---------- sprint reports ---------- */

export function sprintWindow(cycle: Cycle, now = new Date()) {
  const start = toTime(cycle.startedAt ?? cycle.startDate);
  const plannedEnd = toTime(cycle.endDate);
  const completed = cycle.completedAt ? toTime(cycle.completedAt) : null;
  /** Probe just before completion so "move incomplete issues" isn't a removal. */
  const probe = completed ? completed - 60_000 : now.getTime();
  return { start, plannedEnd, completed, probe };
}

export type BurndownPoint = {
  date: string;
  label: string;
  remaining: number | null;
  completed: number | null;
  scope: number | null;
  guideline: number;
};

export type ScopeChange = {
  at: string;
  date: string;
  issueId: string;
  title: string;
  delta: number;
  reason: "added" | "removed" | "estimate";
};

export type BurndownSeries = {
  points: BurndownPoint[];
  scopeChanges: ScopeChange[];
  committed: number;
  currentScope: number;
  currentRemaining: number;
};

export function buildBurndown(
  cycle: Cycle,
  issues: Issue[],
  cycles: Cycle[],
  now = new Date(),
  statuses: StatusList = DEFAULT_STATUSES,
): BurndownSeries {
  const timelines = buildTimelines(issues, cycles, statuses);
  const { start, plannedEnd, completed } = sprintWindow(cycle, now);
  const end = Math.max(plannedEnd, completed ?? 0, start);
  const keys = eachDayKey(start, end);
  const cap = Math.min(now.getTime(), completed ?? Number.POSITIVE_INFINITY);
  const committed = timelines.reduce(
    (total, timeline) => total + pointsInCycleAt(timeline, cycle.id, start),
    0,
  );
  const lastIndex = Math.max(1, keys.length - 1);

  const points = keys.map<BurndownPoint>((key, index) => {
    const dayStart = toTime(`${key}T00:00:00.000Z`);
    const guideline =
      Math.round(committed * (1 - Math.min(index, lastIndex) / lastIndex) * 10) /
      10;
    if (dayStart > cap) {
      return {
        date: key,
        label: formatDayLabel(key),
        remaining: null,
        completed: null,
        scope: null,
        guideline,
      };
    }
    const at = index === 0 ? Math.max(start, Math.min(endOfUtcDay(key), cap)) : Math.min(endOfUtcDay(key), cap);
    let scope = 0;
    let done = 0;
    for (const timeline of timelines) {
      const points = pointsInCycleAt(timeline, cycle.id, at);
      scope += points;
      if (points && doneAt(timeline, at)) done += points;
    }
    return {
      date: key,
      label: formatDayLabel(key),
      remaining: scope - done,
      completed: done,
      scope,
      guideline,
    };
  });

  const scopeChanges: ScopeChange[] = [];
  for (const timeline of timelines) {
    const candidates = new Set<number>([timeline.created]);
    for (const entry of [...timeline.cycle, ...timeline.estimate]) {
      candidates.add(entry.at);
    }
    for (const at of [...candidates].sort((left, right) => left - right)) {
      if (at <= start || at > cap) continue;
      const before = pointsInCycleAt(timeline, cycle.id, at - 1);
      const after = pointsInCycleAt(timeline, cycle.id, at);
      const wasIn = inCycleAt(timeline, cycle.id, at - 1);
      const isIn = inCycleAt(timeline, cycle.id, at);
      if (wasIn === isIn && before === after) continue;
      scopeChanges.push({
        at: new Date(at).toISOString(),
        date: dayKey(at),
        issueId: timeline.issue.id,
        title: timeline.issue.title,
        delta: after - before,
        reason: !wasIn && isIn ? "added" : wasIn && !isIn ? "removed" : "estimate",
      });
    }
  }
  scopeChanges.sort((left, right) => left.at.localeCompare(right.at));

  const lastPoint = [...points].reverse().find((point) => point.scope !== null);
  return {
    points,
    scopeChanges,
    committed,
    currentScope: lastPoint?.scope ?? committed,
    currentRemaining: lastPoint?.remaining ?? committed,
  };
}

export type SprintReportItem = {
  issue: Issue;
  points: number;
};

export type SprintReport = {
  completed: SprintReportItem[];
  notCompleted: SprintReportItem[];
  removed: SprintReportItem[];
  addedAfterStart: SprintReportItem[];
  completedPoints: number;
  notCompletedPoints: number;
};

export function buildSprintReport(
  cycle: Cycle,
  issues: Issue[],
  cycles: Cycle[],
  now = new Date(),
  statuses: StatusList = DEFAULT_STATUSES,
): SprintReport {
  const timelines = buildTimelines(issues, cycles, statuses);
  const { start, probe } = sprintWindow(cycle, now);
  const report: SprintReport = {
    completed: [],
    notCompleted: [],
    removed: [],
    addedAfterStart: [],
    completedPoints: 0,
    notCompletedPoints: 0,
  };

  for (const timeline of timelines) {
    const atStart = inCycleAt(timeline, cycle.id, start);
    const atEnd = inCycleAt(timeline, cycle.id, probe);
    const joinedLater = timeline.cycle.some(
      (entry) =>
        entry.value === cycle.id && entry.at > start && entry.at <= probe,
    );
    if (!atStart && !atEnd && !joinedLater) continue;
    const points =
      valueAt(timeline.estimate, atEnd ? probe : Math.max(start, timeline.created)) ??
      timeline.issue.estimate ??
      0;
    const item = { issue: timeline.issue, points };

    if (atEnd) {
      if (doneAt(timeline, probe)) {
        report.completed.push(item);
        report.completedPoints += points;
      } else {
        report.notCompleted.push(item);
        report.notCompletedPoints += points;
      }
    } else {
      report.removed.push(item);
    }
    if (!atStart && joinedLater) report.addedAfterStart.push(item);
  }

  return report;
}

export type VelocityPoint = {
  cycleId: string;
  name: string;
  committed: number;
  completed: number;
};

export function isClosedCycle(cycle: Cycle, now = new Date()) {
  if (cycle.state) return cycle.state === "CLOSED";
  return toTime(cycle.endDate) < now.getTime();
}

export function buildVelocity(
  cycles: Cycle[],
  issues: Issue[],
  limit = 7,
  now = new Date(),
  statuses: StatusList = DEFAULT_STATUSES,
): VelocityPoint[] {
  const closed = cycles
    .filter((cycle) => isClosedCycle(cycle, now))
    .sort(
      (left, right) =>
        toTime(left.completedAt ?? left.endDate) -
        toTime(right.completedAt ?? right.endDate),
    )
    .slice(-limit);
  const timelines = buildTimelines(issues, cycles, statuses);

  return closed.map((cycle) => {
    const { start, probe } = sprintWindow(cycle, now);
    const committed =
      cycle.committedPoints ??
      timelines.reduce(
        (total, timeline) => total + pointsInCycleAt(timeline, cycle.id, start),
        0,
      );
    const completed =
      cycle.completedPoints ??
      timelines.reduce((total, timeline) => {
        const points = pointsInCycleAt(timeline, cycle.id, probe);
        return points && doneAt(timeline, probe) ? total + points : total;
      }, 0);
    return { cycleId: cycle.id, name: cycle.name, committed, completed };
  });
}

/** Total vs done (issues and points) per day — burnup for sprints, versions, epics. */
export type BurnupPoint = {
  date: string;
  label: string;
  total: number | null;
  done: number | null;
  totalPoints: number | null;
  donePoints: number | null;
};

export function buildBurnup(
  issues: Issue[],
  start: DateInput,
  end: DateInput,
  now = new Date(),
  statuses: StatusList = DEFAULT_STATUSES,
): BurnupPoint[] {
  const timelines = issues.map((issue) => ({
    issue,
    created: toTime(issue.createdAt),
    status: statusHistory(issue, statuses),
  }));
  return eachDayKey(start, end).map((key) => {
    const dayStart = toTime(`${key}T00:00:00.000Z`);
    if (dayStart > now.getTime()) {
      return {
        date: key,
        label: formatDayLabel(key),
        total: null,
        done: null,
        totalPoints: null,
        donePoints: null,
      };
    }
    const at = Math.min(endOfUtcDay(key), now.getTime());
    let total = 0;
    let done = 0;
    let totalPoints = 0;
    let donePoints = 0;
    for (const timeline of timelines) {
      if (timeline.created > at) continue;
      const points = timeline.issue.estimate ?? 0;
      total += 1;
      totalPoints += points;
      if (isDoneStatus(valueAt(timeline.status, at))) {
        done += 1;
        donePoints += points;
      }
    }
    return { date: key, label: formatDayLabel(key), total, done, totalPoints, donePoints };
  });
}

/* ---------- flow reports ---------- */

/** One day of the CFD: a count per status key (plus date/label). */
export type CumulativeFlowPoint = {
  date: string;
  label: string;
  [status: string]: number | string;
};

/** Status keys a CFD stacks, in workflow order (unknown keys appended). */
export function cumulativeFlowKeys(statuses: StatusList = DEFAULT_STATUSES) {
  return orderStatuses(statuses).map((status) => status.key);
}

export function buildCumulativeFlow(
  issues: Issue[],
  days: number,
  now = new Date(),
  statuses: StatusList = DEFAULT_STATUSES,
): CumulativeFlowPoint[] {
  const keys = cumulativeFlowKeys(statuses);
  const known = new Set(keys);
  const histories = issues.map((issue) => ({
    created: toTime(issue.createdAt),
    status: statusHistory(issue, statuses),
  }));
  const start = startOfUtcDay(now) - (days - 1) * DAY_MS;
  return eachDayKey(start, now).map((key) => {
    const at = Math.min(endOfUtcDay(key), now.getTime());
    const counts: Record<string, number> = Object.fromEntries(
      keys.map((status) => [status, 0]),
    );
    for (const history of histories) {
      if (history.created > at) continue;
      const status = valueAt(history.status, at);
      if (!status) continue;
      // A status outside this workflow (e.g. deleted) lands in its category's
      // first configured status so totals stay intact.
      const bucket = known.has(status)
        ? status
        : (orderStatuses(statuses).find(
            (candidate) => candidate.category === statusCategory(status),
          )?.key ?? status);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    return { date: key, label: formatDayLabel(key), ...counts };
  });
}

export type ControlChartPoint = {
  issueId: string;
  title: string;
  resolvedAt: number;
  date: string;
  cycleDays: number;
  rolling: number;
  /** True when the issue never entered In progress (measured from creation). */
  fromCreated: boolean;
};

export function buildControlChart(
  issues: Issue[],
  options: {
    days?: number;
    window?: number;
    now?: Date;
    statuses?: StatusList;
  } = {},
) {
  const now = options.now ?? new Date();
  const from = options.days
    ? startOfUtcDay(now) - (options.days - 1) * DAY_MS
    : Number.NEGATIVE_INFINITY;
  const raw = issues
    .map((issue) => {
      const history = statusHistory(issue, options.statuses);
      const resolved = resolutionTime(issue, history);
      if (resolved === null || resolved < from) return null;
      const started = firstInProgressTime(history);
      const begin = started !== null && started <= resolved ? started : toTime(issue.createdAt);
      return {
        issueId: issue.id,
        title: issue.title,
        resolvedAt: resolved,
        date: dayKey(resolved),
        cycleDays: Math.max(0, Math.round(((resolved - begin) / DAY_MS) * 10) / 10),
        fromCreated: started === null || started > resolved,
      };
    })
    .filter((point): point is Omit<ControlChartPoint, "rolling"> => point !== null)
    .sort((left, right) => left.resolvedAt - right.resolvedAt);
  const rolling = rollingAverage(
    raw.map((point) => point.cycleDays),
    options.window ?? 5,
  );
  const points: ControlChartPoint[] = raw.map((point, index) => ({
    ...point,
    rolling: Math.round(rolling[index] * 10) / 10,
  }));
  const values = points.map((point) => point.cycleDays);
  const average = values.length
    ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
    : 0;
  return { points, average, median: median(values) };
}

export type CreatedResolvedPoint = {
  key: string;
  label: string;
  created: number;
  resolved: number;
  createdTotal: number;
  resolvedTotal: number;
};

export function buildCreatedVsResolved(
  issues: Issue[],
  options: {
    days: number;
    granularity: Granularity;
    now?: Date;
    statuses?: StatusList;
  },
): CreatedResolvedPoint[] {
  const now = options.now ?? new Date();
  const start = startOfUtcDay(now) - (options.days - 1) * DAY_MS;
  const keys = eachBucketKey(start, now, options.granularity);
  const buckets = new Map(
    keys.map((key) => [key, { created: 0, resolved: 0 }]),
  );
  for (const issue of issues) {
    const created = toTime(issue.createdAt);
    if (created >= start && created <= now.getTime()) {
      const bucket = buckets.get(bucketKey(created, options.granularity));
      if (bucket) bucket.created += 1;
    }
    const resolved = resolutionTime(
      issue,
      statusHistory(issue, options.statuses),
    );
    if (resolved !== null && resolved >= start && resolved <= now.getTime()) {
      const bucket = buckets.get(bucketKey(resolved, options.granularity));
      if (bucket) bucket.resolved += 1;
    }
  }
  let createdTotal = 0;
  let resolvedTotal = 0;
  return keys.map((key) => {
    const bucket = buckets.get(key) ?? { created: 0, resolved: 0 };
    createdTotal += bucket.created;
    resolvedTotal += bucket.resolved;
    return {
      key,
      label: formatDayLabel(key, options.granularity),
      created: bucket.created,
      resolved: bucket.resolved,
      createdTotal,
      resolvedTotal,
    };
  });
}

/* ---------- grouping / statistics ---------- */

export type GroupField =
  | "assignee"
  | "priority"
  | "kind"
  | "status"
  | "label"
  | "component";

export const GROUP_FIELD_LABELS: Record<GroupField, string> = {
  assignee: "Assignee",
  priority: "Priority",
  kind: "Issue type",
  status: "Status",
  label: "Label",
  component: "Component",
};

export const GROUP_FIELDS = Object.keys(GROUP_FIELD_LABELS) as GroupField[];

const PRIORITY_ORDER: IssuePriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO_PRIORITY",
];

export type GroupKey = { key: string; label: string; color?: string };

/** Configured names/order for status and type grouping. */
export type GroupConfig = {
  statuses?: StatusList;
  types?: readonly Pick<WorkTypeConfig, "key" | "name" | "level" | "position">[];
};

export function groupKeysFor(
  issue: Issue,
  field: GroupField,
  config: GroupConfig = {},
): GroupKey[] {
  switch (field) {
    case "assignee":
      return [
        issue.assignee
          ? { key: issue.assignee.id, label: issue.assignee.name }
          : { key: "NONE", label: "Unassigned" },
      ];
    case "priority":
      return [{ key: issue.priority, label: PRIORITY_LABELS[issue.priority] }];
    case "kind":
      return [{ key: issue.kind, label: typeName(issue.kind, config.types) }];
    case "status":
      return [
        { key: issue.status, label: statusName(issue.status, config.statuses) },
      ];
    case "label":
      return issue.labels.length
        ? issue.labels.map((label) => ({
            key: label.id,
            label: label.name,
            color: label.color,
          }))
        : [{ key: "NONE", label: "No label" }];
    case "component":
      return issue.components?.length
        ? issue.components.map((component) => ({
            key: component.id,
            label: component.name,
          }))
        : [{ key: "NONE", label: "No component" }];
  }
}

function canonicalOrder(field: GroupField, config: GroupConfig): string[] | null {
  if (field === "status") {
    return orderStatuses(config.statuses ?? DEFAULT_STATUSES).map(
      (status) => status.key,
    );
  }
  if (field === "priority") return PRIORITY_ORDER;
  if (field === "kind") {
    return [...(config.types ?? DEFAULT_TYPES)]
      .sort((a, b) => b.level - a.level || a.position - b.position)
      .map((type) => type.key)
      .concat(ISSUE_KINDS);
  }
  return null;
}

/** Index in a canonical order; keys missing from it sort last. */
function orderIndex(order: string[], key: string) {
  const index = order.indexOf(key);
  return index === -1 ? order.length : index;
}

export type GroupCount = GroupKey & { count: number; points: number };

export function groupIssues(
  issues: Issue[],
  field: GroupField,
  config: GroupConfig = {},
): GroupCount[] {
  const groups = new Map<string, GroupCount>();
  for (const issue of issues) {
    for (const key of groupKeysFor(issue, field, config)) {
      const group = groups.get(key.key) ?? { ...key, count: 0, points: 0 };
      group.count += 1;
      group.points += issue.estimate ?? 0;
      groups.set(key.key, group);
    }
  }
  const order = canonicalOrder(field, config);
  return [...groups.values()].sort((left, right) => {
    if (order) {
      return (
        orderIndex(order, left.key) - orderIndex(order, right.key) ||
        left.label.localeCompare(right.label)
      );
    }
    if (left.key === "NONE") return 1;
    if (right.key === "NONE") return -1;
    return right.count - left.count || left.label.localeCompare(right.label);
  });
}

export function buildTwoDimensional(
  issues: Issue[],
  rowField: GroupField,
  columnField: GroupField,
  config: GroupConfig = {},
) {
  const rows = groupIssues(issues, rowField, config);
  const columns = groupIssues(issues, columnField, config);
  const cells: Record<string, Record<string, number>> = {};
  for (const issue of issues) {
    for (const row of groupKeysFor(issue, rowField, config)) {
      cells[row.key] ??= {};
      for (const column of groupKeysFor(issue, columnField, config)) {
        cells[row.key][column.key] = (cells[row.key][column.key] ?? 0) + 1;
      }
    }
  }
  return { rows, columns, cells, total: issues.length };
}

/* ---------- planning reports ---------- */

export type TimeTrackingRow = {
  issue: Issue;
  original: number;
  spent: number;
  remaining: number;
};

export function buildTimeTracking(issues: Issue[]) {
  const rows: TimeTrackingRow[] = issues
    .filter(
      (issue) =>
        issue.originalEstimateMinutes ||
        issue.timeSpentMinutes ||
        issue.remainingEstimateMinutes,
    )
    .map((issue) => {
      const original = issue.originalEstimateMinutes ?? 0;
      const spent = issue.timeSpentMinutes ?? 0;
      const remaining =
        issue.remainingEstimateMinutes ??
        (isDoneStatus(issue.status) ? 0 : Math.max(original - spent, 0));
      return { issue, original, spent, remaining };
    });
  const totals = rows.reduce(
    (sum, row) => ({
      original: sum.original + row.original,
      spent: sum.spent + row.spent,
      remaining: sum.remaining + row.remaining,
    }),
    { original: 0, spent: 0, remaining: 0 },
  );
  return { rows, totals };
}

export type WorkloadRow = {
  key: string;
  name: string;
  issues: number;
  points: number;
  remainingMinutes: number;
};

export function buildWorkload(issues: Issue[]): WorkloadRow[] {
  const rows = new Map<string, WorkloadRow>();
  for (const issue of issues) {
    if (isDoneStatus(issue.status) || isEpicLevel(issue.kind)) continue;
    const key = issue.assignee?.id ?? "NONE";
    const row = rows.get(key) ?? {
      key,
      name: issue.assignee?.name ?? "Unassigned",
      issues: 0,
      points: 0,
      remainingMinutes: 0,
    };
    row.issues += 1;
    row.points += issue.estimate ?? 0;
    row.remainingMinutes +=
      issue.remainingEstimateMinutes ??
      Math.max((issue.originalEstimateMinutes ?? 0) - issue.timeSpentMinutes, 0);
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (left, right) =>
      (left.key === "NONE" ? 1 : 0) - (right.key === "NONE" ? 1 : 0) ||
      right.points - left.points ||
      right.issues - left.issues,
  );
}

export function buildEpicReport(epic: Issue, issues: Issue[]) {
  const children = issues.filter((issue) => issue.parentId === epic.id);
  const done = children.filter((issue) => isDoneStatus(issue.status));
  const points = (items: Issue[]) =>
    items.reduce((total, issue) => total + (issue.estimate ?? 0), 0);
  return {
    children,
    total: children.length,
    done: done.length,
    totalPoints: points(children),
    donePoints: points(done),
    unestimated: children.filter((issue) => issue.estimate === null).length,
    percent: children.length ? Math.round((done.length / children.length) * 100) : 0,
  };
}

/* ---------- dashboards ---------- */

/** Mirrors /api/issues filtering so a saved view's results match the Issues page. */
export function matchesSavedView(issue: Issue, view: SavedView) {
  if (view.status === "ACTIVE" && isDoneStatus(issue.status)) return false;
  if (view.status !== "ALL" && view.status !== "ACTIVE" && issue.status !== view.status) {
    return false;
  }
  if (view.priority !== "ALL" && issue.priority !== view.priority) return false;
  if (view.labelId && !issue.labels.some((label) => label.id === view.labelId)) {
    return false;
  }
  if (view.assignee === "UNASSIGNED" && issue.assignee) return false;
  if (
    view.assignee !== "ALL" &&
    view.assignee !== "UNASSIGNED" &&
    issue.assignee?.id !== view.assignee
  ) {
    return false;
  }
  const query = view.query.trim().toLowerCase();
  if (query) {
    const haystack = [
      issue.title,
      issue.id,
      issue.assignee?.name ?? "",
      ...issue.labels.map((label) => label.name),
    ].map((value) => value.toLowerCase());
    if (!haystack.some((value) => value.includes(query))) return false;
  }
  return true;
}

export function applySavedView(issues: Issue[], view: SavedView) {
  const direction = view.sort === "OLDEST" ? 1 : -1;
  return issues
    .filter((issue) => matchesSavedView(issue, view))
    .sort(
      (left, right) =>
        direction * (toTime(left.createdAt) - toTime(right.createdAt)),
    );
}

export function buildSprintHealth(
  cycle: Cycle,
  issues: Issue[],
  now = new Date(),
) {
  const scoped = issues.filter((issue) => issue.cycleId === cycle.id);
  const points = (items: Issue[]) =>
    items.reduce((total, issue) => total + (issue.estimate ?? 0), 0);
  const total = points(scoped);
  const done = points(scoped.filter((issue) => isDoneStatus(issue.status)));
  const inProgress = points(
    scoped.filter((issue) => isInProgressStatus(issue.status)),
  );
  const start = toTime(cycle.startedAt ?? cycle.startDate);
  const end = toTime(cycle.endDate);
  const elapsed =
    end <= start
      ? 100
      : Math.round(
          Math.min(1, Math.max(0, (now.getTime() - start) / (end - start))) * 100,
        );
  const committed = cycle.committedPoints ?? null;
  return {
    issues: scoped.length,
    totalPoints: total,
    donePoints: done,
    inProgressPoints: inProgress,
    todoPoints: total - done - inProgress,
    workPercent: total ? Math.round((done / total) * 100) : 0,
    timePercent: elapsed,
    scopeChange:
      committed === null || committed === 0
        ? null
        : Math.round(((total - committed) / committed) * 100),
    blockers: scoped.filter(
      (issue) => issue.flagged && !isDoneStatus(issue.status),
    )
      .length,
    daysLeft: Math.max(0, Math.ceil((end - now.getTime()) / DAY_MS)),
  };
}

export function buildLabelHeatmap(issues: Issue[]) {
  const counts = groupIssues(issues, "label").filter((group) => group.key !== "NONE");
  const max = counts.reduce((value, group) => Math.max(value, group.count), 0);
  return counts.map((group) => ({
    ...group,
    intensity: max ? group.count / max : 0,
  }));
}
