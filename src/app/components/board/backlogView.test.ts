import { describe, expect, it } from "vitest";
import type { Issue } from "../../data/issues";
import { DEFAULT_BACKLOG_VIEW, parseBacklogView, workloadByAssignee } from "./backlogView";

const person = (id: string, name: string) => ({ id, name, email: `${id}@example.com` });
const item = (estimate: number | null, assignee: ReturnType<typeof person> | null) =>
  ({ estimate, assignee }) as unknown as Issue;

describe("parseBacklogView", () => {
  it("keeps known fields and falls back on bad data", () => {
    expect(parseBacklogView(null)).toEqual(DEFAULT_BACKLOG_VIEW);
    expect(parseBacklogView("oops")).toEqual(DEFAULT_BACKLOG_VIEW);
    expect(parseBacklogView('{"density":"compact","hidden":["epic","nope"]}')).toEqual({
      density: "compact",
      hidden: ["epic"],
    });
  });
});

describe("workloadByAssignee", () => {
  it("sums items and points per person with unassigned last", () => {
    const ada = person("a", "Ada");
    const bo = person("b", "Bo");
    const result = workloadByAssignee([item(3, bo), item(null, null), item(2, ada), item(5, bo)]);
    expect(result.rows.map((row) => [row.name, row.items, row.points])).toEqual([
      ["Ada", 1, 2],
      ["Bo", 2, 8],
      ["Unassigned", 1, 0],
    ]);
    expect(result.total).toEqual({ items: 4, points: 10 });
  });

  it("adds subtasks when asked", () => {
    const ada = person("a", "Ada");
    expect(workloadByAssignee([item(3, ada)], [item(1, ada)]).total).toEqual({ items: 2, points: 4 });
  });
});
