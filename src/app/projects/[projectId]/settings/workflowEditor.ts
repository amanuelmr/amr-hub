import {
  STATUS_CATEGORIES,
  orderStatuses,
  statusCategory,
  type StatusCategory,
  type TypeLevel,
  type WorkTypeConfig,
  type WorkflowStatusConfig,
  type WorkflowTransitionConfig,
} from "../../../data/workflow";

export type StatusGroups = Record<StatusCategory, WorkflowStatusConfig[]>;

/** Statuses grouped by Jira category, each group in configured order. */
export function groupStatuses(statuses: readonly WorkflowStatusConfig[]) {
  const groups: StatusGroups = { TODO: [], IN_PROGRESS: [], DONE: [] };
  for (const status of orderStatuses(statuses)) {
    groups[status.category].push(status);
  }
  return groups;
}

/**
 * Full key order after dragging `activeKey` onto `overKey`. Moves only
 * happen inside one category (category order is fixed); returns null for
 * a no-op or a cross-category drop.
 */
export function reorderStatusKeys(
  statuses: readonly WorkflowStatusConfig[],
  activeKey: string,
  overKey: string,
): string[] | null {
  if (activeKey === overKey) return null;
  const groups = groupStatuses(statuses);
  const active = statuses.find((status) => status.key === activeKey);
  const over = statuses.find((status) => status.key === overKey);
  if (!active || !over || active.category !== over.category) return null;
  const group = groups[active.category].map((status) => status.key);
  const from = group.indexOf(activeKey);
  const to = group.indexOf(overKey);
  group.splice(from, 1);
  group.splice(to, 0, activeKey);
  groups[active.category] = group.map(
    (key) => statuses.find((status) => status.key === key)!,
  );
  return STATUS_CATEGORIES.flatMap((category) =>
    groups[category].map((status) => status.key),
  );
}

/** The global ("from any status") transition into `toKey`, if any. */
export function globalTransitionTo(
  transitions: readonly WorkflowTransitionConfig[],
  toKey: string,
) {
  return transitions.find(
    (transition) => transition.fromKey === null && transition.toKey === toKey,
  );
}

/** Transitions with a specific source status, ordered by source then target. */
export function specificTransitions(
  transitions: readonly WorkflowTransitionConfig[],
  statuses: readonly WorkflowStatusConfig[],
) {
  const order = new Map(
    orderStatuses(statuses).map((status, index) => [status.key, index]),
  );
  const rank = (key: string | null) => (key ? (order.get(key) ?? 999) : -1);
  return transitions
    .filter((transition) => transition.fromKey !== null)
    .sort(
      (a, b) =>
        rank(a.fromKey) - rank(b.fromKey) || rank(a.toKey) - rank(b.toKey),
    );
}

/** True when the status restricts where work may go next (Jira semantics). */
export function hasRestrictedExits(
  transitions: readonly WorkflowTransitionConfig[],
  key: string,
) {
  return transitions.some((transition) => transition.fromKey === key);
}

/** Why a status cannot be deleted, or null when it can. */
export function statusDeleteBlocker(
  statuses: readonly WorkflowStatusConfig[],
  key: string,
) {
  const target = statuses.find((status) => status.key === key);
  if (!target) return "This status no longer exists.";
  if (statuses.length <= 1) return "A workflow needs at least one status.";
  if (target.category === "IN_PROGRESS") return null;
  const peers = statuses.filter((status) => status.category === target.category);
  if (peers.length <= 1) {
    return `A workflow needs at least one ${
      target.category === "DONE" ? "done" : "to do"
    } status.`;
  }
  return null;
}

/** Replacement candidates: same category first, then the rest. */
export function statusReplacementOptions(
  statuses: readonly WorkflowStatusConfig[],
  key: string,
) {
  const category = statuses.find((status) => status.key === key)?.category ??
    statusCategory(key);
  const others = orderStatuses(statuses).filter((status) => status.key !== key);
  return [
    ...others.filter((status) => status.category === category),
    ...others.filter((status) => status.category !== category),
  ];
}

export const TYPE_LEVEL_NAMES: Record<string, string> = {
  "1": "Epic level",
  "0": "Standard",
  "-1": "Subtask level",
};

export function levelName(level: TypeLevel) {
  return TYPE_LEVEL_NAMES[String(level)];
}

/** Work types grouped by hierarchy level: epics, standard, subtasks. */
export function groupTypes(types: readonly WorkTypeConfig[]) {
  const levels: TypeLevel[] = [1, 0, -1];
  return levels.map((level) => ({
    level,
    types: types
      .filter((type) => type.level === level)
      .sort((a, b) => a.position - b.position),
  }));
}

/** Why a work type cannot be deleted, or null when it can. */
export function typeDeleteBlocker(
  types: readonly WorkTypeConfig[],
  key: string,
) {
  const target = types.find((type) => type.key === key);
  if (!target) return "This work type no longer exists.";
  if (
    target.level === 0 &&
    types.filter((type) => type.level === 0).length <= 1
  ) {
    return "A project needs at least one standard work type.";
  }
  return null;
}

/** Replacement types must sit at the same hierarchy level. */
export function typeReplacementOptions(
  types: readonly WorkTypeConfig[],
  key: string,
) {
  const target = types.find((type) => type.key === key);
  if (!target) return [];
  return types.filter(
    (type) => type.key !== key && type.level === target.level,
  );
}
