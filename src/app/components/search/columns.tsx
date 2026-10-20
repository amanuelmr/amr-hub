import type { ReactNode } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import {
  PRIORITY_LABELS,
  RESOLUTION_LABELS,
  type Cycle,
  type Issue,
} from "../../data/issues";
import { customFieldJqlKey, type JqlField } from "../../data/jql";
import {
  formatFieldValue,
  isEmptyFieldValue,
  isMultiValueField,
  type CustomFieldDefinition,
} from "../../data/customFields";
import {
  getCustomFieldSnapshot,
  loadCustomFields,
  subscribeCustomFields,
} from "../fields/customFieldStore";
import { KindIcon, PriorityBadge, StatusBadge } from "../IssueVisuals";
import { IssueLabelChip } from "../IssueLabelChip";
import { statusName, typeName } from "../../data/workflow";

/** A custom field column: `cf:<field id>`. */
export type CustomColumnId = `cf:${string}`;

export type ColumnId = BuiltinColumnId | CustomColumnId;

type BuiltinColumnId =
  | "key"
  | "type"
  | "summary"
  | "status"
  | "priority"
  | "assignee"
  | "reporter"
  | "sprint"
  | "fixVersion"
  | "storyPoints"
  | "labels"
  | "created"
  | "updated"
  | "due"
  | "resolution"
  | "parent";

export type ColumnLookups = {
  cyclesById: Map<string, Cycle>;
  /** Where an issue link points; defaults to the full issue page. Pages pass a
   * `?selectedIssue=KEY` builder so links open the issue modal in place. */
  issueHref?: (issueId: string) => string;
};

export function issueLink(lookups: ColumnLookups, issueId: string) {
  return lookups.issueHref?.(issueId) ?? `/issues/${issueId}`;
}

export type ColumnDef = {
  id: ColumnId;
  label: string;
  sortField: JqlField;
  width: string;
  render: (issue: Issue, lookups: ColumnLookups) => ReactNode;
  text: (issue: Issue, lookups: ColumnLookups) => string;
};

export function formatShortDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function initials(name: string | undefined | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Person({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="search-muted">Unassigned</span>;
  return (
    <span className="search-person">
      <span className="avatar avatar-small">{initials(name)}</span>
      <span>{name}</span>
    </span>
  );
}

function DateCell({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>{formatShortDate(value)}</time>
  ) : (
    <span className="search-muted">—</span>
  );
}

const BUILTIN_COLUMNS: ColumnDef[] = [
  {
    id: "type",
    label: "Type",
    sortField: "issuetype",
    width: "44px",
    render: (issue) => <KindIcon kind={issue.kind} />,
    text: (issue) => typeName(issue.kind),
  },
  {
    id: "key",
    label: "Key",
    sortField: "key",
    width: "92px",
    render: (issue, lookups) => (
      <Link className="search-key" href={issueLink(lookups, issue.id)} scroll={false}>
        {issue.id}
      </Link>
    ),
    text: (issue) => issue.id,
  },
  {
    id: "summary",
    label: "Summary",
    sortField: "summary",
    width: "minmax(220px, 2fr)",
    render: (issue, lookups) => (
      <span className="search-summary">
        {issue.flagged && (
          <Flag className="search-flag" size={13} aria-label="Flagged" />
        )}
        <Link href={issueLink(lookups, issue.id)} scroll={false}>
          {issue.title}
        </Link>
      </span>
    ),
    text: (issue) => issue.title,
  },
  {
    id: "status",
    label: "Status",
    sortField: "status",
    width: "130px",
    render: (issue) => <StatusBadge status={issue.status} />,
    text: (issue) => statusName(issue.status),
  },
  {
    id: "priority",
    label: "Priority",
    sortField: "priority",
    width: "110px",
    render: (issue) => <PriorityBadge priority={issue.priority} />,
    text: (issue) => PRIORITY_LABELS[issue.priority],
  },
  {
    id: "assignee",
    label: "Assignee",
    sortField: "assignee",
    width: "minmax(130px, 0.8fr)",
    render: (issue) => <Person name={issue.assignee?.name} />,
    text: (issue) => issue.assignee?.name ?? "",
  },
  {
    id: "reporter",
    label: "Reporter",
    sortField: "reporter",
    width: "minmax(130px, 0.8fr)",
    render: (issue) => <Person name={issue.creator?.name} />,
    text: (issue) => issue.creator?.name ?? "",
  },
  {
    id: "sprint",
    label: "Sprint",
    sortField: "sprint",
    width: "120px",
    render: (issue, { cyclesById }) =>
      issue.cycleId ? (
        <span className="search-chip">
          {cyclesById.get(issue.cycleId)?.name ?? "Sprint"}
        </span>
      ) : (
        <span className="search-muted">—</span>
      ),
    text: (issue, { cyclesById }) =>
      issue.cycleId ? (cyclesById.get(issue.cycleId)?.name ?? "") : "",
  },
  {
    id: "fixVersion",
    label: "Fix version",
    sortField: "fixversion",
    width: "110px",
    render: (issue) =>
      issue.fixVersion ? (
        <span className="search-chip">{issue.fixVersion.name}</span>
      ) : (
        <span className="search-muted">—</span>
      ),
    text: (issue) => issue.fixVersion?.name ?? "",
  },
  {
    id: "storyPoints",
    label: "Points",
    sortField: "storypoints",
    width: "70px",
    render: (issue) =>
      issue.estimate === null ? (
        <span className="search-muted">—</span>
      ) : (
        <span className="estimate-chip">{issue.estimate}</span>
      ),
    text: (issue) => (issue.estimate === null ? "" : String(issue.estimate)),
  },
  {
    id: "labels",
    label: "Labels",
    sortField: "labels",
    width: "minmax(120px, 0.8fr)",
    render: (issue) =>
      issue.labels.length ? (
        <span className="search-labels">
          {issue.labels.map((label) => (
            <IssueLabelChip label={label} compact key={label.id} />
          ))}
        </span>
      ) : (
        <span className="search-muted">—</span>
      ),
    text: (issue) => issue.labels.map((label) => label.name).join("; "),
  },
  {
    id: "created",
    label: "Created",
    sortField: "created",
    width: "104px",
    render: (issue) => <DateCell value={issue.createdAt} />,
    text: (issue) => issue.createdAt,
  },
  {
    id: "updated",
    label: "Updated",
    sortField: "updated",
    width: "104px",
    render: (issue) => <DateCell value={issue.updatedAt} />,
    text: (issue) => issue.updatedAt,
  },
  {
    id: "due",
    label: "Due",
    sortField: "due",
    width: "104px",
    render: (issue) => <DateCell value={issue.dueDate} />,
    text: (issue) => issue.dueDate?.slice(0, 10) ?? "",
  },
  {
    id: "resolution",
    label: "Resolution",
    sortField: "resolution",
    width: "110px",
    render: (issue) =>
      issue.resolution ? (
        <span>{RESOLUTION_LABELS[issue.resolution]}</span>
      ) : (
        <span className="search-muted">Unresolved</span>
      ),
    text: (issue) =>
      issue.resolution ? RESOLUTION_LABELS[issue.resolution] : "Unresolved",
  },
  {
    id: "parent",
    label: "Parent",
    sortField: "parent",
    width: "minmax(110px, 0.7fr)",
    render: (issue, lookups) =>
      issue.parent ? (
        <Link className="search-parent" href={issueLink(lookups, issue.parent.id)} scroll={false}>
          <KindIcon kind={issue.parent.kind} />
          <span>{issue.parent.id}</span>
        </Link>
      ) : (
        <span className="search-muted">—</span>
      ),
    text: (issue) => issue.parentId ?? "",
  },
];

/** Built-in columns followed by one per workspace custom field (kept in sync). */
export const COLUMNS: ColumnDef[] = [...BUILTIN_COLUMNS];

class ColumnRegistry extends Map<ColumnId, ColumnDef> {
  /** Custom columns count as known before the field list loads (saved layouts). */
  override has(id: ColumnId) {
    return super.has(id) || (typeof id === "string" && id.startsWith("cf:"));
  }
}

export const COLUMNS_BY_ID: Map<ColumnId, ColumnDef> = new ColumnRegistry(
  COLUMNS.map((column) => [column.id, column]),
);

export function customColumnId(fieldId: string): CustomColumnId {
  return `cf:${fieldId}`;
}

function CustomFieldCell({ field, issue }: { field: CustomFieldDefinition; issue: Issue }) {
  const value = issue.customFields?.[field.id];
  if (isEmptyFieldValue(value)) return <span className="search-muted">—</span>;
  const { members } = getCustomFieldSnapshot();
  const display = formatFieldValue(field, value, members);
  if (field.type === "URL") {
    return (
      <a className="search-cf-link" href={display} target="_blank" rel="noreferrer noopener">
        {display}
      </a>
    );
  }
  if (isMultiValueField(field.type)) {
    return (
      <span className="search-labels">
        {display.split(", ").map((item) => (
          <span className="search-chip" key={item}>
            {item}
          </span>
        ))}
      </span>
    );
  }
  if (field.type === "USER") return <Person name={display} />;
  return <span className="search-cf-text" title={display}>{display}</span>;
}

export function customFieldColumn(field: CustomFieldDefinition): ColumnDef {
  const width =
    field.type === "NUMBER"
      ? "90px"
      : field.type === "DATE"
        ? "110px"
        : "minmax(120px, 0.8fr)";
  return {
    id: customColumnId(field.id),
    label: field.name,
    sortField: customFieldJqlKey(field.id),
    width,
    render: (issue) => <CustomFieldCell field={field} issue={issue} />,
    text: (issue) =>
      formatFieldValue(field, issue.customFields?.[field.id], getCustomFieldSnapshot().members),
  };
}

function syncCustomColumns() {
  const { fields } = getCustomFieldSnapshot();
  const custom = fields.map(customFieldColumn);
  COLUMNS.splice(0, COLUMNS.length, ...BUILTIN_COLUMNS, ...custom);
  COLUMNS_BY_ID.clear();
  for (const column of COLUMNS) COLUMNS_BY_ID.set(column.id, column);
}

if (typeof window !== "undefined") {
  subscribeCustomFields(syncCustomColumns);
  syncCustomColumns();
  void loadCustomFields();
}

export const DEFAULT_COLUMNS: ColumnId[] = [
  "type",
  "key",
  "summary",
  "status",
  "priority",
  "assignee",
  "sprint",
  "updated",
];

export function columnsFrom(ids: ColumnId[]) {
  return COLUMNS.filter((column) => ids.includes(column.id));
}

export function issuesCsv(issues: Issue[], ids: ColumnId[], lookups: ColumnLookups) {
  const columns = columnsFrom(ids);
  return {
    header: columns.map((column) => column.label),
    rows: issues.map((issue) => columns.map((column) => column.text(issue, lookups))),
  };
}
