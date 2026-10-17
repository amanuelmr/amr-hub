const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineZoom = "WEEKS" | "MONTHS" | "QUARTERS";

export const ZOOM_DAY_WIDTH: Record<TimelineZoom, number> = {
  WEEKS: 32,
  MONTHS: 10,
  QUARTERS: 4,
};

/** Default bar length when only one end is known. */
export const DEFAULT_SPAN_DAYS = 14;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "YYYY-MM-DD" (or any ISO string) -> UTC midnight ms. */
export function keyToTime(key: string) {
  return Date.UTC(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
  );
}

export function timeToKey(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

export function toDayKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return timeToKey(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  );
}

export function addDays(key: string, days: number) {
  return timeToKey(keyToTime(key) + days * DAY_MS);
}

export function diffDays(from: string, to: string) {
  return Math.round((keyToTime(to) - keyToTime(from)) / DAY_MS);
}

export type BarSpan = {
  start: string;
  end: string;
  /** True when one end was inferred (createdAt or default length). */
  inferred: boolean;
};

export function barSpan(issue: {
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
}): BarSpan | null {
  const start = issue.startDate ? toDayKey(issue.startDate) : null;
  const due = issue.dueDate ? toDayKey(issue.dueDate) : null;

  if (start && due) {
    return start <= due
      ? { start, end: due, inferred: false }
      : { start: due, end: start, inferred: false };
  }
  if (due) {
    const created = toDayKey(issue.createdAt);
    return { start: created <= due ? created : due, end: due, inferred: true };
  }
  if (start) {
    return {
      start,
      end: addDays(start, DEFAULT_SPAN_DAYS - 1),
      inferred: true,
    };
  }
  return null;
}

export type DragMode = "move" | "start" | "end";

/** Applies a whole-day drag delta to a span, keeping start <= end. */
export function applyDrag(
  span: { start: string; end: string },
  mode: DragMode,
  deltaDays: number,
) {
  if (mode === "move") {
    return {
      start: addDays(span.start, deltaDays),
      end: addDays(span.end, deltaDays),
    };
  }
  if (mode === "start") {
    const start = addDays(span.start, deltaDays);
    return { start: start > span.end ? span.end : start, end: span.end };
  }
  const end = addDays(span.end, deltaDays);
  return { start: span.start, end: end < span.start ? span.start : end };
}

export function pixelsToDays(pixels: number, dayWidth: number) {
  const days = Math.round(pixels / dayWidth);
  return days === 0 ? 0 : days;
}

function monthStart(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function quarterStart(key: string) {
  const month = Number(key.slice(5, 7)) - 1;
  const quarterMonth = Math.floor(month / 3) * 3;
  return `${key.slice(0, 4)}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
}

function addMonths(key: string, months: number) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1 + months;
  return timeToKey(Date.UTC(year, month, 1));
}

/** Visible range: covers every dated item plus padding, snapped to months/quarters. */
export function timelineRange(
  dates: string[],
  today: string,
  zoom: TimelineZoom,
) {
  const keys = [...dates.map(toDayKey), today].sort();
  const earliest = addDays(keys[0], -14);
  const latest = addDays(keys[keys.length - 1], 30);
  const minimumEnd = addMonths(monthStart(today), zoom === "QUARTERS" ? 12 : 6);
  const snap = zoom === "QUARTERS" ? quarterStart : monthStart;
  const start = snap(
    earliest < addMonths(monthStart(today), -1)
      ? earliest
      : addMonths(monthStart(today), -1),
  );
  const endBoundary = latest > minimumEnd ? latest : minimumEnd;
  const end = addDays(
    zoom === "QUARTERS"
      ? addMonths(quarterStart(endBoundary), 3)
      : addMonths(monthStart(endBoundary), 1),
    -1,
  );
  return { start, end, days: diffDays(start, end) + 1 };
}

export type HeaderSegment = {
  key: string;
  label: string;
  offset: number;
  days: number;
};

function segmentsBetween(
  start: string,
  end: string,
  next: (key: string) => string,
  align: (key: string) => string,
  label: (key: string) => string,
) {
  const segments: HeaderSegment[] = [];
  let cursor = align(start);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const following = next(cursor);
    const segmentStart = cursor < start ? start : cursor;
    const segmentEnd = addDays(following, -1) > end ? end : addDays(following, -1);
    segments.push({
      key: cursor,
      label: label(cursor),
      offset: diffDays(start, segmentStart),
      days: diffDays(segmentStart, segmentEnd) + 1,
    });
    cursor = following;
    guard += 1;
  }
  return segments;
}

function weekStart(key: string) {
  const weekday = (new Date(keyToTime(key)).getUTCDay() + 6) % 7;
  return addDays(key, -weekday);
}

function monthLabel(key: string) {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

function quarterLabel(key: string) {
  return `Q${Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1} ${key.slice(0, 4)}`;
}

/** Two header rows: a coarse group row on top, the zoom unit below. */
export function headerSegments(start: string, end: string, zoom: TimelineZoom) {
  const months = segmentsBetween(
    start,
    end,
    (key) => addMonths(key, 1),
    monthStart,
    monthLabel,
  );
  if (zoom === "WEEKS") {
    return {
      top: months,
      bottom: segmentsBetween(
        start,
        end,
        (key) => addDays(key, 7),
        weekStart,
        (key) => String(Number(key.slice(8, 10))),
      ),
    };
  }
  const quarters = segmentsBetween(
    start,
    end,
    (key) => addMonths(key, 3),
    quarterStart,
    quarterLabel,
  );
  if (zoom === "MONTHS") {
    return {
      top: quarters,
      bottom: months.map((segment) => ({
        ...segment,
        label: MONTHS[Number(segment.key.slice(5, 7)) - 1],
      })),
    };
  }
  const years = segmentsBetween(
    start,
    end,
    (key) => addMonths(key, 12),
    (key) => `${key.slice(0, 4)}-01-01`,
    (key) => key.slice(0, 4),
  );
  return {
    top: years,
    bottom: quarters.map((segment) => ({
      ...segment,
      label: quarterLabel(segment.key).split(" ")[0],
    })),
  };
}

/** Pixel geometry of a span inside the range. */
export function barGeometry(
  span: { start: string; end: string },
  rangeStart: string,
  dayWidth: number,
) {
  const offset = diffDays(rangeStart, span.start);
  const days = diffDays(span.start, span.end) + 1;
  return { left: offset * dayWidth, width: Math.max(days * dayWidth, 6) };
}
