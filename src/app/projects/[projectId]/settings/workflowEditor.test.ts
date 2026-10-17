import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUSES,
  DEFAULT_TYPES,
  type WorkTypeConfig,
  type WorkflowStatusConfig,
  type WorkflowTransitionConfig,
} from "../../../data/workflow";
import {
  globalTransitionTo,
  groupStatuses,
  groupTypes,
  hasRestrictedExits,
  reorderStatusKeys,
  specificTransitions,
  statusDeleteBlocker,
  statusReplacementOptions,
  typeDeleteBlocker,
  typeReplacementOptions,
} from "./workflowEditor";

const statuses: WorkflowStatusConfig[] = [
  ...DEFAULT_STATUSES,
  {
    key: "IN_PROGRESS:qa",
    name: "QA",
    category: "IN_PROGRESS",
    color: null,
    position: 5,
  },
];

const transitions: WorkflowTransitionConfig[] = [
  { id: "t1", name: "Done", fromKey: null, toKey: "DONE" },
  { id: "t2", name: "Send to QA", fromKey: "IN_REVIEW", toKey: "IN_PROGRESS:qa" },
  { id: "t3", name: "Start", fromKey: "OPEN", toKey: "IN_PROGRESS" },
];

describe("workflow editor", () => {
  it("groups statuses by category in order", () => {
    const groups = groupStatuses(statuses);
    expect(groups.TODO.map((status) => status.key)).toEqual(["BACKLOG", "OPEN"]);
    expect(groups.IN_PROGRESS.map((status) => status.key)).toEqual([
      "IN_PROGRESS",
      "IN_REVIEW",
      "IN_PROGRESS:qa",
    ]);
  });

  it("reorders only within a category", () => {
    expect(reorderStatusKeys(statuses, "IN_PROGRESS:qa", "IN_PROGRESS")).toEqual([
      "BACKLOG",
      "OPEN",
      "IN_PROGRESS:qa",
      "IN_PROGRESS",
      "IN_REVIEW",
      "DONE",
    ]);
    expect(reorderStatusKeys(statuses, "DONE", "OPEN")).toBeNull();
    expect(reorderStatusKeys(statuses, "OPEN", "OPEN")).toBeNull();
  });

  it("finds global and specific transitions", () => {
    expect(globalTransitionTo(transitions, "DONE")?.id).toBe("t1");
    expect(globalTransitionTo(transitions, "OPEN")).toBeUndefined();
    expect(specificTransitions(transitions, statuses).map((t) => t.id)).toEqual([
      "t3",
      "t2",
    ]);
    expect(hasRestrictedExits(transitions, "OPEN")).toBe(true);
    expect(hasRestrictedExits(transitions, "DONE")).toBe(false);
  });

  it("blocks deleting the last to-do or done status", () => {
    expect(statusDeleteBlocker(statuses, "DONE")).toMatch(/done status/);
    expect(statusDeleteBlocker(statuses, "OPEN")).toBeNull();
    expect(statusDeleteBlocker(statuses, "IN_PROGRESS:qa")).toBeNull();
  });

  it("offers same-category replacements first", () => {
    expect(
      statusReplacementOptions(statuses, "IN_PROGRESS:qa").map((s) => s.key),
    ).toEqual(["IN_PROGRESS", "IN_REVIEW", "BACKLOG", "OPEN", "DONE"]);
  });

  it("handles work type hierarchy rules", () => {
    const types: WorkTypeConfig[] = [
      ...DEFAULT_TYPES,
      {
        key: "L0:spike",
        name: "Spike",
        level: 0,
        icon: "flask-conical",
        color: "#6d4fd8",
        description: null,
        position: 5,
      },
    ];
    expect(groupTypes(types).map((group) => group.types.length)).toEqual([1, 4, 1]);
    expect(typeReplacementOptions(types, "L0:spike").map((t) => t.key)).toEqual([
      "STORY",
      "TASK",
      "BUG",
    ]);
    expect(typeReplacementOptions(types, "EPIC")).toEqual([]);
    expect(typeDeleteBlocker(types, "L0:spike")).toBeNull();
    expect(
      typeDeleteBlocker(
        types.filter((type) => type.level !== 0 || type.key === "TASK"),
        "TASK",
      ),
    ).toMatch(/standard/);
  });
});
