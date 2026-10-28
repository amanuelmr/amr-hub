import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const { createGroupSchema, updateGroupSchema } = await import("./groups");

describe("group input", () => {
  it("needs a name and accepts members", () => {
    expect(createGroupSchema.safeParse({ name: "Design", memberIds: ["u1"] }).success).toBe(true);
    expect(createGroupSchema.safeParse({ name: "D" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "Design", extra: 1 }).success).toBe(false);
  });

  it("needs at least one field to update", () => {
    expect(updateGroupSchema.safeParse({}).success).toBe(false);
    expect(updateGroupSchema.safeParse({ memberIds: [] }).success).toBe(true);
    expect(updateGroupSchema.safeParse({ description: null }).success).toBe(true);
  });
});
