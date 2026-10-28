import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  canEditFilter,
  canManageFilter,
  canViewFilter,
  parseShares,
  type FilterAudience,
} from "./filters";
import { parseJql } from "./jql";

const member: FilterAudience = {
  userId: "u2",
  role: "member",
  teamIds: ["t1"],
  groupIds: ["g1"],
  projectIds: ["p1"],
};

describe("filter sharing", () => {
  it("keeps private filters to their owner", () => {
    const filter = { ownerId: "u1", viewers: [], editors: [] };
    expect(canViewFilter(filter, member)).toBe(false);
    expect(canViewFilter(filter, { ...member, userId: "u1" })).toBe(true);
  });

  it("matches workspace, project, team and user shares", () => {
    const shared = (share: object) => ({
      ownerId: "u1",
      viewers: parseShares(JSON.stringify([share])),
      editors: [],
    });
    expect(canViewFilter(shared({ type: "WORKSPACE" }), member)).toBe(true);
    expect(canViewFilter(shared({ type: "PROJECT", id: "p1" }), member)).toBe(true);
    expect(canViewFilter(shared({ type: "PROJECT", id: "p9" }), member)).toBe(false);
    expect(canViewFilter(shared({ type: "TEAM", id: "t1" }), member)).toBe(true);
    expect(canViewFilter(shared({ type: "GROUP", id: "g1" }), member)).toBe(true);
    expect(canViewFilter(shared({ type: "GROUP", id: "g2" }), member)).toBe(false);
    expect(canViewFilter(shared({ type: "USER", id: "u2" }), member)).toBe(true);
  });

  it("lets editors edit but not manage, and never lets viewers edit", () => {
    const filter = { ownerId: "u1", viewers: [], editors: parseShares('[{"type":"TEAM","id":"t1"}]') };
    expect(canViewFilter(filter, member)).toBe(true);
    expect(canEditFilter(filter, member)).toBe(true);
    expect(canManageFilter(filter, member)).toBe(false);
    expect(canEditFilter(filter, { ...member, role: "viewer" })).toBe(false);
    expect(canManageFilter(filter, { ...member, role: "owner" })).toBe(true);
  });

  it("drops malformed and duplicate shares", () => {
    expect(
      parseShares('[{"type":"WORKSPACE"},{"type":"WORKSPACE"},{"type":"TEAM"},{"type":"X","id":"1"},5]'),
    ).toEqual([{ type: "WORKSPACE" }]);
    expect(parseShares("not json")).toEqual([]);
  });
});

describe("default filters", () => {
  it("are all valid JQL", () => {
    for (const filter of DEFAULT_FILTERS) {
      expect(parseJql(filter.jql).ok, filter.name).toBe(true);
    }
  });
});

describe("basic filters to JQL", () => {
  it("adds type, reporter, sprint and created clauses", async () => {
    const { basicFiltersToJql, parseJql: parse } = await import("./jql");
    const jql = basicFiltersToJql({
      typeName: "Bug",
      reporter: "dana@example.com",
      sprint: "OPEN",
      createdWithin: "-2w",
    });
    expect(jql).toBe(
      'type = Bug AND reporter = dana@example.com AND sprint in openSprints() AND created >= -2w ORDER BY created DESC',
    );
    expect(parse(jql).ok).toBe(true);
  });
});
