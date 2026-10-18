import { ISSUE_STATUSES, type IssueStatus } from "../../../data/issues";
import {
  CARD_EXTRA_FIELDS,
  MAX_CARD_EXTRA_FIELDS,
  type BoardColumnConfig,
  type BoardQuery,
  type CardField,
} from "../../../data/projects";

/**
 * Statuses (in workflow order) not mapped to any column. `order` is the
 * project's ordered status keys; it defaults to the built-ins.
 */
export function unmappedStatuses(
  columns: BoardColumnConfig[],
  order: readonly IssueStatus[] = ISSUE_STATUSES,
): IssueStatus[] {
  const mapped = new Set(columns.flatMap((column) => column.statuses));
  return order.filter((status) => !mapped.has(status));
}

/** Maps a status to one column (or unmaps it), keeping each status in at most one column. */
export function assignStatus(
  columns: BoardColumnConfig[],
  status: IssueStatus,
  columnId: string | null,
  order: readonly IssueStatus[] = ISSUE_STATUSES,
): BoardColumnConfig[] {
  const position = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return columns.map((column) => {
    const without = column.statuses.filter((candidate) => candidate !== status);
    if (column.id !== columnId) {
      return without.length === column.statuses.length
        ? column
        : { ...column, statuses: without };
    }
    return {
      ...column,
      // Keep the column's statuses in workflow order.
      statuses: [...without, status].sort((a, b) => position(a) - position(b)),
    };
  });
}

export function newColumnId(name: string, columns: BoardColumnConfig[]) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "column";
  const taken = new Set(columns.map((column) => column.id));
  let id = base;
  let suffix = 2;
  while (taken.has(id)) id = `${base}-${suffix++}`;
  return id;
}

export function addColumn(
  columns: BoardColumnConfig[],
  name: string,
): BoardColumnConfig[] {
  const trimmed = name.trim().slice(0, 40) || "New column";
  return [
    ...columns,
    {
      id: newColumnId(trimmed, columns),
      name: trimmed,
      statuses: [],
      wipLimit: null,
    },
  ];
}

export function moveColumn(
  columns: BoardColumnConfig[],
  fromId: string,
  toId: string,
): BoardColumnConfig[] {
  const from = columns.findIndex((column) => column.id === fromId);
  const to = columns.findIndex((column) => column.id === toId);
  if (from < 0 || to < 0 || from === to) return columns;
  const next = [...columns];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Turns a card field on or off. Extra fields are capped at
 * MAX_CARD_EXTRA_FIELDS; turning on one more is a no-op.
 */
export function toggleCardField(
  fields: CardField[],
  field: CardField,
): CardField[] {
  if (fields.includes(field)) return fields.filter((item) => item !== field);
  if (
    CARD_EXTRA_FIELDS.includes(field) &&
    fields.filter((item) => CARD_EXTRA_FIELDS.includes(item)).length >=
      MAX_CARD_EXTRA_FIELDS
  ) {
    return fields;
  }
  return [...fields, field];
}

export function newQueryId(queries: BoardQuery[]) {
  const taken = new Set(queries.map((query) => query.id));
  let index = queries.length + 1;
  while (taken.has(`q${index}`)) index += 1;
  return `q${index}`;
}

export function addQuery(
  queries: BoardQuery[],
  query: Omit<BoardQuery, "id">,
): BoardQuery[] {
  return [...queries, { ...query, id: newQueryId(queries) }];
}

export function updateQuery(
  queries: BoardQuery[],
  id: string,
  changes: Partial<Omit<BoardQuery, "id">>,
): BoardQuery[] {
  return queries.map((query) =>
    query.id === id ? { ...query, ...changes } : query,
  );
}

export function removeQuery(queries: BoardQuery[], id: string) {
  return queries.filter((query) => query.id !== id);
}

/** Moves a query one step up (-1) or down (+1). */
export function shiftQuery(
  queries: BoardQuery[],
  id: string,
  direction: -1 | 1,
): BoardQuery[] {
  const from = queries.findIndex((query) => query.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= queries.length) return queries;
  const next = [...queries];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
