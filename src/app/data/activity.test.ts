import { describe, expect, it } from "vitest";
import {
  buildWorkspaceActivity,
  formatActivityTime,
} from "./activity";
import type { Issue } from "./issues";

function issue(overrides: Partial<Issue> & Pick<Issue, "id" | "createdAt">): Issue {
  return {
    title: `Issue ${overrides.id}`,
    description: "A sufficiently detailed issue description",
    status: "OPEN",
    priority: "MEDIUM",
    kind: "TASK",
    assignee: null,
    creator: null,
    dueDate: null,
    estimate: null,
    projectId: "project-1",
    cycleId: null,
    labels: [],
    updatedAt: "2026-07-24T10:00:00.000Z",
    parentId: null,
    parent: null,
    fixVersion: null,
    team: null,
    goal: null,
    components: [],
    startDate: null,
    rank: 0,
    flagged: false,
    resolution: null,
    resolvedAt: null,
    environment: null,
    originalEstimateMinutes: null,
    remainingEstimateMinutes: null,
    timeSpentMinutes: 0,
    childCount: 0,
    doneChildCount: 0,
    ...overrides,
  };
}

describe("buildWorkspaceActivity", () => {
  it("sorts real audit events across issues by recency", () => {
    const result = buildWorkspaceActivity([
      issue({
        id: "AMR-1",
        createdAt: "2026-07-20T09:00:00.000Z",
        activity: [
          {
            id: "event-1",
            type: "STATUS_CHANGED",
            description: "changed status from open to done",
            actor: "Amanuel",
            createdAt: "2026-07-29T08:00:00.000Z",
          },
        ],
      }),
      issue({
        id: "AMR-2",
        createdAt: "2026-07-28T09:00:00.000Z",
        activity: [
          {
            id: "event-2",
            type: "COMMENT_ADDED",
            description: "commented on the issue",
            actor: "Maya",
            createdAt: "2026-07-29T09:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(result.slice(0, 2).map((event) => event.id)).toEqual([
      "event-2",
      "event-1",
    ]);
    expect(result[0]).toMatchObject({
      actor: "Maya",
      issueId: "AMR-2",
      type: "COMMENT_ADDED",
    });
  });

  it("adds a truthful creation fallback when legacy issues lack audit events", () => {
    const result = buildWorkspaceActivity([
      issue({
        id: "AMR-3",
        createdAt: "2026-07-27T09:00:00.000Z",
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        id: "AMR-3-created",
        actor: null,
        description: "Issue created",
        type: "CREATED",
      }),
    ]);
  });

  it("respects the requested item limit", () => {
    const issues = [1, 2, 3].map((number) =>
      issue({
        id: `AMR-${number}`,
        createdAt: `2026-07-2${number}T09:00:00.000Z`,
      }),
    );

    expect(buildWorkspaceActivity(issues, 2)).toHaveLength(2);
  });
});

describe("formatActivityTime", () => {
  const now = new Date("2026-07-29T10:00:00.000Z");

  it("formats recent events compactly", () => {
    expect(formatActivityTime("2026-07-29T09:42:00.000Z", now)).toBe(
      "18m ago",
    );
    expect(formatActivityTime("2026-07-27T10:00:00.000Z", now)).toBe(
      "2d ago",
    );
  });
});
