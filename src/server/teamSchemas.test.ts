import { describe, expect, it } from "vitest";
import { createTeamSchema, teamMembersSchema, updateTeamSchema } from "./teamSchemas";

describe("createTeamSchema", () => {
  it("trims, defaults and de-duplicates members", () => {
    expect(
      createTeamSchema.parse({ name: "  Platform ", memberUserIds: ["a", "a", "b"] }),
    ).toEqual({ name: "Platform", description: null, memberUserIds: ["a", "b"] });
  });

  it("turns a blank description into null", () => {
    expect(createTeamSchema.parse({ name: "X", description: "   " }).description).toBeNull();
  });

  it("rejects empty or long names and unknown keys", () => {
    expect(createTeamSchema.safeParse({ name: " " }).success).toBe(false);
    expect(createTeamSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
    expect(createTeamSchema.safeParse({ name: "X", owner: "me" }).success).toBe(false);
  });
});

describe("updateTeamSchema", () => {
  it("requires at least one field", () => {
    expect(updateTeamSchema.safeParse({}).success).toBe(false);
    expect(updateTeamSchema.parse({ description: null })).toEqual({ description: null });
  });
});

describe("teamMembersSchema", () => {
  it("requires at least one user id", () => {
    expect(teamMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
    expect(teamMembersSchema.parse({ userIds: ["u", "u"] })).toEqual({ userIds: ["u"] });
  });
});
