import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type DayKey = string;

export function dayKeyOf(date: Date): DayKey {
  return format(date, "yyyy-MM-dd");
}

/** Local Date for a "YYYY-MM-DD" key (or ISO timestamp's date part). */
export function dateOfKey(key: string) {
  return parseISO(key.slice(0, 10));
}

export type WeekStart = 0 | 1;

/** Weeks (Sunday- or Monday-first) covering the month containing `month`. */
export function buildMonthWeeks(month: Date, weekStartsOn: WeekStart = 0): DayKey[][] {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  }).map(dayKeyOf);
  const weeks: DayKey[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

export type DayRange = { start: DayKey; end: DayKey };

/** Due date places the issue; start→due spans when both are set. */
export function issueRange(issue: {
  startDate: string | null;
  dueDate: string | null;
}): DayRange | null {
  if (!issue.dueDate) return null;
  const end = issue.dueDate.slice(0, 10);
  const start = issue.startDate?.slice(0, 10);
  return { start: start && start <= end ? start : end, end };
}

export function shiftKey(key: DayKey, days: number) {
  return dayKeyOf(addDays(dateOfKey(key), days));
}

function daysBetween(from: DayKey, to: DayKey) {
  return Math.round(
    (Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
      Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) /
      86_400_000,
  );
}

/**
 * Dropping an issue on a day sets its due date there; a start date (if any)
 * moves by the same amount so the span keeps its length.
 */
export function moveToDay(
  issue: { startDate: string | null; dueDate: string | null },
  target: DayKey,
): { dueDate: DayKey; startDate?: DayKey | null } {
  const range = issueRange(issue);
  if (!range || !issue.startDate) return { dueDate: target };
  const delta = daysBetween(range.end, target);
  return { dueDate: target, startDate: shiftKey(range.start, delta) };
}

export type WeekPlacement<T> = {
  item: T;
  startColumn: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Packs ranged items into lanes for one calendar week row. */
export function layoutWeek<T>(
  week: DayKey[],
  items: { item: T; range: DayRange }[],
): WeekPlacement<T>[] {
  const first = week[0];
  const last = week[week.length - 1];
  const visible = items
    .filter(({ range }) => range.start <= last && range.end >= first)
    .sort(
      (left, right) =>
        left.range.start.localeCompare(right.range.start) ||
        daysBetween(right.range.start, right.range.end) -
          daysBetween(left.range.start, left.range.end),
    );
  const laneEnds: number[] = [];
  return visible.map(({ item, range }) => {
    const startColumn = range.start < first ? 0 : week.indexOf(range.start);
    const endColumn = range.end > last ? week.length - 1 : week.indexOf(range.end);
    let lane = laneEnds.findIndex((end) => end < startColumn);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endColumn);
    } else {
      laneEnds[lane] = endColumn;
    }
    return {
      item,
      startColumn,
      span: endColumn - startColumn + 1,
      lane,
      continuesBefore: range.start < first,
      continuesAfter: range.end > last,
    };
  });
}

/** Sprint covering a day, if any (inclusive of start and end dates). */
export function sprintForDay<T extends { startDate: string; endDate: string }>(
  day: DayKey,
  sprints: T[],
) {
  return (
    sprints.find(
      (sprint) =>
        sprint.startDate.slice(0, 10) <= day && sprint.endDate.slice(0, 10) >= day,
    ) ?? null
  );
}

/** The single week containing `date`. */
export function buildWeek(date: Date, weekStartsOn: WeekStart = 0): DayKey[][] {
  const start = startOfWeek(date, { weekStartsOn });
  return [Array.from({ length: 7 }, (_, index) => dayKeyOf(addDays(start, index)))];
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekdayNames(weekStartsOn: WeekStart) {
  return [...WEEKDAY_NAMES.slice(weekStartsOn), ...WEEKDAY_NAMES.slice(0, weekStartsOn)];
}

export type CalendarPrefs = {
  mode: "month" | "week";
  weekStartsOn: WeekStart;
  colorBy: "status" | "priority" | "type";
  showKey: boolean;
};

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = {
  mode: "month",
  weekStartsOn: 0,
  colorBy: "status",
  showKey: false,
};

export function parseCalendarPrefs(raw: string | null): CalendarPrefs {
  if (!raw) return DEFAULT_CALENDAR_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<CalendarPrefs>;
    return {
      mode: value.mode === "week" ? "week" : "month",
      weekStartsOn: value.weekStartsOn === 1 ? 1 : 0,
      colorBy:
        value.colorBy === "priority" || value.colorBy === "type" ? value.colorBy : "status",
      showKey: value.showKey === true,
    };
  } catch {
    return DEFAULT_CALENDAR_PREFS;
  }
}
