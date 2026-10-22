/** Rows of the Filter panel's Advanced tab, turned into one JQL query. */

export type ConditionField =
  | "assignee"
  | "status"
  | "priority"
  | "type"
  | "labels"
  | "due"
  | "created"
  | "updated"
  | "storypoints"
  | "summary";

export type ConditionOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "~"
  | "is EMPTY"
  | "is not EMPTY";

export type Condition = { field: ConditionField; operator: ConditionOperator; value: string };

export const CONDITION_FIELDS: {
  field: ConditionField;
  label: string;
  /** How the value is entered. */
  input: "choice" | "date" | "number" | "text";
  operators: ConditionOperator[];
}[] = [
  { field: "assignee", label: "Assignee", input: "choice", operators: ["=", "!=", "is EMPTY", "is not EMPTY"] },
  { field: "status", label: "Status", input: "choice", operators: ["=", "!="] },
  { field: "priority", label: "Priority", input: "choice", operators: ["=", "!=", ">", "<"] },
  { field: "type", label: "Work type", input: "choice", operators: ["=", "!="] },
  { field: "labels", label: "Labels", input: "choice", operators: ["=", "!=", "is EMPTY", "is not EMPTY"] },
  { field: "due", label: "Due date", input: "date", operators: ["<", "<=", ">", ">=", "is EMPTY", "is not EMPTY"] },
  { field: "created", label: "Created", input: "date", operators: [">=", "<=", ">", "<"] },
  { field: "updated", label: "Updated", input: "date", operators: [">=", "<=", ">", "<"] },
  { field: "storypoints", label: "Story points", input: "number", operators: ["=", ">", ">=", "<", "<=", "is EMPTY"] },
  { field: "summary", label: "Summary", input: "text", operators: ["~"] },
];

const JQL_FIELD: Record<ConditionField, string> = {
  assignee: "assignee",
  status: "status",
  priority: "priority",
  type: "type",
  labels: "labels",
  due: "due",
  created: "created",
  updated: "updated",
  storypoints: '"story points"',
  summary: "summary",
};

const needsValue = (operator: ConditionOperator) =>
  operator !== "is EMPTY" && operator !== "is not EMPTY";

/** Functions and relative dates (e.g. -7d) go in as written; text is quoted. */
function jqlValue(value: string, input: string) {
  const trimmed = value.trim();
  if (/^[a-zA-Z]+\(\)$/.test(trimmed)) return trimmed;
  if (input === "number" && /^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (input === "date" && /^-?\d+[dwmy]$/.test(trimmed)) return `"${trimmed}"`;
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** AND-combines complete rows; rows still missing a value are skipped. */
export function conditionsToJql(conditions: Condition[]) {
  return conditions
    .flatMap((condition) => {
      const meta = CONDITION_FIELDS.find((entry) => entry.field === condition.field);
      if (!meta) return [];
      const field = JQL_FIELD[condition.field];
      if (!needsValue(condition.operator)) return [`${field} ${condition.operator}`];
      if (!condition.value.trim()) return [];
      return [`${field} ${condition.operator} ${jqlValue(condition.value, meta.input)}`];
    })
    .join(" AND ");
}

export function operatorNeedsValue(operator: ConditionOperator) {
  return needsValue(operator);
}
