/**
 * Jira-style configurable workflows and work types.
 *
 * Issue.status stores a workflow status key and Issue.kind stores a work type
 * key. Built-in keys are plain words (DONE, EPIC, ...). Custom keys encode
 * their semantics so the rest of the app can reason about them without a
 * database lookup:
 *   - statuses: "<CATEGORY>:<slug>"  e.g. "IN_PROGRESS:qa", "DONE:released"
 *   - types:    "L<level>:<slug>"    e.g. "L0:spike", "L1:initiative", "L-1:chore"
 */

export type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";
export const STATUS_CATEGORIES: StatusCategory[] = ["TODO", "IN_PROGRESS", "DONE"];

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export type BuiltinStatus =
  | "BACKLOG"
  | "OPEN"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE";

export const BUILTIN_STATUSES: BuiltinStatus[] = [
  "BACKLOG",
  "OPEN",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];

export const STATUS_CATEGORY: Record<BuiltinStatus, StatusCategory> = {
  BACKLOG: "TODO",
  OPEN: "TODO",
  IN_PROGRESS: "IN_PROGRESS",
  IN_REVIEW: "IN_PROGRESS",
  DONE: "DONE",
};

export const BUILTIN_STATUS_NAMES: Record<BuiltinStatus, string> = {
  BACKLOG: "Backlog",
  OPEN: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export type TypeLevel = 1 | 0 | -1;

export type BuiltinKind = "EPIC" | "STORY" | "TASK" | "BUG" | "SUBTASK";
export const BUILTIN_KINDS: BuiltinKind[] = [
  "EPIC",
  "STORY",
  "TASK",
  "BUG",
  "SUBTASK",
];

export const BUILTIN_KIND_LEVEL: Record<BuiltinKind, TypeLevel> = {
  EPIC: 1,
  STORY: 0,
  TASK: 0,
  BUG: 0,
  SUBTASK: -1,
};

export const BUILTIN_KIND_NAMES: Record<BuiltinKind, string> = {
  EPIC: "Epic",
  STORY: "Story",
  TASK: "Task",
  BUG: "Bug",
  SUBTASK: "Subtask",
};

export const TYPE_LEVEL_LABELS: Record<TypeLevel, string> = {
  1: "Epic level",
  0: "Standard",
  [-1]: "Subtask level",
} as Record<TypeLevel, string>;

/** Curated lucide icon names a work type may use. */
export const WORK_TYPE_ICONS = [
  "square-check",
  "bookmark",
  "bug",
  "zap",
  "square-split-vertical",
  "flask-conical",
  "rocket",
  "lightbulb",
  "wrench",
  "shield",
  "file-text",
  "flag",
  "star",
  "target",
  "layers",
  "circle-help",
] as const;
export type WorkTypeIcon = (typeof WORK_TYPE_ICONS)[number];

export const WORKFLOW_COLORS = [
  "#6b778c",
  "#39c6d0",
  "#2563eb",
  "#6d4fd8",
  "#8fbe35",
  "#16a34a",
  "#d97706",
  "#e94f75",
  "#dc2626",
  "#0f766e",
] as const;

export type WorkflowStatusConfig = {
  id?: string;
  key: string;
  name: string;
  category: StatusCategory;
  color: string | null;
  position: number;
};

export type WorkflowTransitionConfig = {
  id: string;
  name: string;
  /** null = global transition: any status may move to `toKey`. */
  fromKey: string | null;
  toKey: string;
};

export type WorkTypeConfig = {
  id?: string;
  key: string;
  name: string;
  level: TypeLevel;
  icon: string;
  color: string;
  description: string | null;
  position: number;
};

export type ProjectWorkflow = {
  statuses: WorkflowStatusConfig[];
  transitions: WorkflowTransitionConfig[];
  types: WorkTypeConfig[];
};

export const DEFAULT_STATUSES: WorkflowStatusConfig[] = BUILTIN_STATUSES.map(
  (key, position) => ({
    key,
    name: BUILTIN_STATUS_NAMES[key],
    category: STATUS_CATEGORY[key],
    color: null,
    position,
  }),
);

const BUILTIN_TYPE_STYLE: Record<BuiltinKind, { icon: string; color: string }> = {
  EPIC: { icon: "zap", color: "#987dff" },
  STORY: { icon: "bookmark", color: "#8fbe35" },
  TASK: { icon: "square-check", color: "#39c6d0" },
  BUG: { icon: "bug", color: "#e94f75" },
  SUBTASK: { icon: "square-split-vertical", color: "#39c6d0" },
};

export const DEFAULT_TYPES: WorkTypeConfig[] = BUILTIN_KINDS.map(
  (key, position) => ({
    key,
    name: BUILTIN_KIND_NAMES[key],
    level: BUILTIN_KIND_LEVEL[key],
    icon: BUILTIN_TYPE_STYLE[key].icon,
    color: BUILTIN_TYPE_STYLE[key].color,
    description: null,
    position,
  }),
);

export const DEFAULT_WORKFLOW: ProjectWorkflow = {
  statuses: DEFAULT_STATUSES,
  transitions: [],
  types: DEFAULT_TYPES,
};

/* ------------------------------------------------------------------ */
/* Key encoding                                                        */
/* ------------------------------------------------------------------ */

const SLUG_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
const CUSTOM_STATUS_PATTERN = new RegExp(
  `^(TODO|IN_PROGRESS|DONE):(${SLUG_PATTERN})$`,
);
const CUSTOM_TYPE_PATTERN = new RegExp(`^L(1|0|-1):(${SLUG_PATTERN})$`);

export function isBuiltinStatus(key: string): key is BuiltinStatus {
  return Object.prototype.hasOwnProperty.call(STATUS_CATEGORY, key);
}

export function isBuiltinKind(key: string): key is BuiltinKind {
  return Object.prototype.hasOwnProperty.call(BUILTIN_KIND_LEVEL, key);
}

/** True for a built-in key or a well-formed "<CATEGORY>:<slug>" key. */
export function isValidStatusKey(key: string) {
  return isBuiltinStatus(key) || CUSTOM_STATUS_PATTERN.test(key);
}

/** True for a built-in key or a well-formed "L<level>:<slug>" key. */
export function isValidTypeKey(key: string) {
  return isBuiltinKind(key) || CUSTOM_TYPE_PATTERN.test(key);
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "item"
  );
}

function uniqueKey(base: string, existing: Iterable<string>) {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function makeStatusKey(
  category: StatusCategory,
  name: string,
  existingKeys: Iterable<string> = [],
) {
  return uniqueKey(`${category}:${slugify(name)}`, existingKeys);
}

export function makeTypeKey(
  level: TypeLevel,
  name: string,
  existingKeys: Iterable<string> = [],
) {
  return uniqueKey(`L${level}:${slugify(name)}`, existingKeys);
}

/* ------------------------------------------------------------------ */
/* Status semantics                                                    */
/* ------------------------------------------------------------------ */

/** Pure: the Jira status category a key belongs to. Unknown keys are "TODO". */
export function statusCategory(key: string | null | undefined): StatusCategory {
  if (!key) return "TODO";
  if (isBuiltinStatus(key)) return STATUS_CATEGORY[key];
  const prefix = key.slice(0, key.indexOf(":"));
  if (prefix === "DONE" || prefix === "IN_PROGRESS" || prefix === "TODO") {
    return prefix;
  }
  return "TODO";
}

export function isDoneStatus(key: string | null | undefined) {
  return statusCategory(key) === "DONE";
}

export function isTodoStatus(key: string | null | undefined) {
  return statusCategory(key) === "TODO";
}

export function isInProgressStatus(key: string | null | undefined) {
  return statusCategory(key) === "IN_PROGRESS";
}

/** "IN_PROGRESS:ready-for-qa" -> "Ready for qa". */
function prettifySlug(key: string) {
  const slug = key.slice(key.indexOf(":") + 1).replace(/-/g, " ");
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Display name for a status, preferring configured rows. */
export function statusName(
  key: string,
  statuses?: readonly Pick<WorkflowStatusConfig, "key" | "name">[] | null,
) {
  const configured = statuses?.find((status) => status.key === key);
  if (configured) return configured.name;
  if (isBuiltinStatus(key)) return BUILTIN_STATUS_NAMES[key];
  return prettifySlug(key);
}

/** CSS class used by badges/dots: built-ins keep their own, customs use the category. */
export function statusClassName(key: string) {
  if (isBuiltinStatus(key)) return `status-${key.toLowerCase()}`;
  const category = statusCategory(key);
  return category === "DONE"
    ? "status-done"
    : category === "IN_PROGRESS"
      ? "status-in_progress"
      : "status-open";
}

/** Lozenge tone used by planning surfaces. */
export function statusTone(key: string): "todo" | "progress" | "done" {
  const category = statusCategory(key);
  return category === "DONE" ? "done" : category === "IN_PROGRESS" ? "progress" : "todo";
}

/* ------------------------------------------------------------------ */
/* Type semantics                                                      */
/* ------------------------------------------------------------------ */

/** Pure: hierarchy level of a work type key. Unknown keys are standard (0). */
export function typeLevel(key: string | null | undefined): TypeLevel {
  if (!key) return 0;
  if (isBuiltinKind(key)) return BUILTIN_KIND_LEVEL[key];
  const match = /^L(1|0|-1):/.exec(key);
  if (!match) return 0;
  return Number(match[1]) as TypeLevel;
}

export function isEpicLevel(key: string | null | undefined) {
  return typeLevel(key) === 1;
}

export function isSubtaskLevel(key: string | null | undefined) {
  return typeLevel(key) === -1;
}

export function isStandardLevel(key: string | null | undefined) {
  return typeLevel(key) === 0;
}

export function typeName(
  key: string,
  types?: readonly Pick<WorkTypeConfig, "key" | "name">[] | null,
) {
  const configured = types?.find((type) => type.key === key);
  if (configured) return configured.name;
  if (isBuiltinKind(key)) return BUILTIN_KIND_NAMES[key];
  return prettifySlug(key);
}

export function defaultTypeStyle(key: string) {
  if (isBuiltinKind(key)) return BUILTIN_TYPE_STYLE[key];
  const level = typeLevel(key);
  return level === 1
    ? BUILTIN_TYPE_STYLE.EPIC
    : level === -1
      ? BUILTIN_TYPE_STYLE.SUBTASK
      : BUILTIN_TYPE_STYLE.TASK;
}

/* ------------------------------------------------------------------ */
/* Ordering, transitions and cross-project mapping                     */
/* ------------------------------------------------------------------ */

const CATEGORY_ORDER: Record<StatusCategory, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
};

/** Statuses ordered Jira-style: by category, then configured position. */
export function orderStatuses<T extends Pick<WorkflowStatusConfig, "category" | "position">>(
  statuses: readonly T[],
) {
  return [...statuses].sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      a.position - b.position,
  );
}

export type AllowedTransition = {
  toKey: string;
  /** Transition name when one is configured, e.g. "Send to QA". */
  name: string | null;
};

/**
 * Jira semantics: if the project defines specific (non-global) transitions
 * out of the current status, only those plus global transitions apply.
 * Otherwise every status is reachable. Named transitions keep their name.
 */
export function allowedTransitions(
  workflow: Pick<ProjectWorkflow, "statuses" | "transitions">,
  currentKey: string,
): AllowedTransition[] {
  const ordered = orderStatuses(workflow.statuses);
  const specific = workflow.transitions.filter(
    (transition) => transition.fromKey === currentKey,
  );
  const global = workflow.transitions.filter(
    (transition) => transition.fromKey === null,
  );
  const known = new Set(ordered.map((status) => status.key));

  if (specific.length === 0) {
    return ordered
      .filter((status) => status.key !== currentKey)
      .map((status) => ({
        toKey: status.key,
        name: global.find((transition) => transition.toKey === status.key)?.name ?? null,
      }));
  }

  const result: AllowedTransition[] = [];
  const seen = new Set<string>();
  for (const transition of [...specific, ...global]) {
    if (transition.toKey === currentKey) continue;
    if (!known.has(transition.toKey) || seen.has(transition.toKey)) continue;
    seen.add(transition.toKey);
    result.push({ toKey: transition.toKey, name: transition.name || null });
  }
  const position = new Map(ordered.map((status, index) => [status.key, index]));
  return result.sort(
    (a, b) => (position.get(a.toKey) ?? 0) - (position.get(b.toKey) ?? 0),
  );
}

export function canTransition(
  workflow: Pick<ProjectWorkflow, "statuses" | "transitions">,
  fromKey: string,
  toKey: string,
) {
  if (fromKey === toKey) return true;
  return allowedTransitions(workflow, fromKey).some(
    (transition) => transition.toKey === toKey,
  );
}

/** Maps a status key into another workflow: same key, else same category. */
export function mapStatusByCategory(
  key: string,
  target: readonly Pick<WorkflowStatusConfig, "key" | "category" | "position">[],
) {
  if (target.some((status) => status.key === key)) return key;
  const category = statusCategory(key);
  const ordered = [...target].sort((a, b) => a.position - b.position);
  return (
    ordered.find((status) => status.category === category)?.key ??
    ordered[0]?.key ??
    (category === "DONE" ? "DONE" : category === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN")
  );
}

/** Maps a type key into another project's types: same key, else same level. */
export function mapTypeByLevel(
  key: string,
  target: readonly Pick<WorkTypeConfig, "key" | "level" | "position">[],
) {
  if (target.some((type) => type.key === key)) return key;
  const level = typeLevel(key);
  const ordered = [...target].sort((a, b) => a.position - b.position);
  // Prefer the built-in of the same level (EPIC/TASK/SUBTASK) when present.
  const builtin = level === 1 ? "EPIC" : level === -1 ? "SUBTASK" : "TASK";
  if (ordered.some((type) => type.key === builtin)) return builtin;
  return (
    ordered.find((type) => type.level === level)?.key ??
    ordered.find((type) => type.level === 0)?.key ??
    builtin
  );
}

/** Resolves a user-typed status (name or key, case-insensitive) to keys. */
export function matchStatusKeys(
  value: string,
  statuses: readonly Pick<WorkflowStatusConfig, "key" | "name">[],
) {
  const needle = value.trim().toLowerCase();
  const keys = new Set<string>();
  for (const status of statuses) {
    if (
      status.key.toLowerCase() === needle ||
      status.name.toLowerCase() === needle
    ) {
      keys.add(status.key);
    }
  }
  return [...keys];
}

/** Resolves a user-typed work type (name or key, case-insensitive) to keys. */
export function matchTypeKeys(
  value: string,
  types: readonly Pick<WorkTypeConfig, "key" | "name">[],
) {
  const needle = value.trim().toLowerCase().replace(/[-\s]/g, "");
  const keys = new Set<string>();
  for (const type of types) {
    if (
      type.key.toLowerCase().replace(/[-\s]/g, "") === needle ||
      type.name.toLowerCase().replace(/[-\s]/g, "") === needle
    ) {
      keys.add(type.key);
    }
  }
  return [...keys];
}

/** Menu label for a transition: "Send to QA → QA", or just the status name. */
export function transitionLabel(
  transition: AllowedTransition,
  statuses?: readonly Pick<WorkflowStatusConfig, "key" | "name">[] | null,
) {
  const target = statusName(transition.toKey, statuses);
  if (!transition.name) return target;
  return transition.name.trim().toLowerCase() === target.toLowerCase()
    ? target
    : `${transition.name} → ${target}`;
}
