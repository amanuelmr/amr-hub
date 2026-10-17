import { describe, expect, it } from "vitest";
import {
  buildStatusLookup,
  canCreateTeam,
  canEditTeam,
  mergeWorkedOn,
  resolveStatus,
  summarizePlaces,
} from "./peopleLogic";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 12, minute));

describe("resolveStatus", () => {
  const lookup = buildStatusLookup([
    { projectId: "p1", key: "CLOSED", name: "Closed", category: "DONE" },
    { projectId: "p1", key: "QA", name: "QA", category: "IN_PROGRESS" },
  ]);

  it("uses the project's workflow status", () => {
    expect(resolveStatus(lookup, "p1", "CLOSED")).toEqual({ name: "Closed", category: "DONE" });
    expect(resolveStatus(lookup, "p1", "QA").category).toBe("IN_PROGRESS");
  });

  it("falls back to built-in statuses and humanized keys", () => {
    expect(resolveStatus(lookup, "p2", "IN_REVIEW")).toEqual({
      name: "In review",
      category: "IN_PROGRESS",
    });
    expect(resolveStatus(lookup, "p2", "WAITING_ON_CUSTOMER")).toEqual({
      name: "Waiting on customer",
      category: "TODO",
    });
  });
});

describe("mergeWorkedOn", () => {
  it("keeps the latest event per issue, newest first, limited", () => {
    const merged = mergeWorkedOn(
      [
        { issueId: "A", at: at(1), reason: "created", detail: null },
        { issueId: "A", at: at(5), reason: "commented", detail: null },
        { issueId: "B", at: at(3), reason: "updated", detail: "changed status" },
        { issueId: "C", at: at(2), reason: "updated", detail: null },
      ],
      2,
    );
    expect(merged.map((entry) => [entry.issueId, entry.reason])).toEqual([
      ["A", "commented"],
      ["B", "updated"],
    ]);
  });
});

describe("summarizePlaces", () => {
  it("counts distinct issues per project and orders by recency", () => {
    const places = summarizePlaces([
      { projectId: "p1", issueId: "A", at: at(1) },
      { projectId: "p1", issueId: "A", at: at(2) },
      { projectId: "p1", issueId: "B", at: at(3) },
      { projectId: "p2", issueId: "C", at: at(9) },
    ]);
    expect(places).toEqual([
      { projectId: "p2", issueCount: 1, lastAt: at(9) },
      { projectId: "p1", issueCount: 2, lastAt: at(3) },
    ]);
  });
});

describe("team permissions", () => {
  it("lets owners edit any team and members only their own", () => {
    expect(canEditTeam("owner", "u1", [])).toBe(true);
    expect(canEditTeam("member", "u1", ["u1"])).toBe(true);
    expect(canEditTeam("member", "u1", ["u2"])).toBe(false);
    expect(canEditTeam("viewer", "u1", ["u1"])).toBe(false);
  });

  it("lets owners and members create teams", () => {
    expect(canCreateTeam("owner")).toBe(true);
    expect(canCreateTeam("member")).toBe(true);
    expect(canCreateTeam("viewer")).toBe(false);
  });
});
