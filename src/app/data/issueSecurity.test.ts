import { describe, expect, it } from "vitest";
import { belongsToSecurityLevel, canSeeSecuredIssue, type SecurityViewer } from "./issueSecurity";

const viewer = (overrides: Partial<SecurityViewer> = {}): SecurityViewer => ({
  userId: "u1",
  workspaceRole: "member",
  projectRole: null,
  isLead: false,
  ...overrides,
});

const item = (securityLevel: string | null, extra: { creatorId?: string; assigneeUserId?: string } = {}) => ({
  securityLevel,
  creatorId: extra.creatorId ?? "someone",
  assigneeUserId: extra.assigneeUserId ?? null,
});

describe("issue security", () => {
  it("lets everyone with project access see unrestricted items", () => {
    expect(canSeeSecuredIssue(item(null), viewer())).toBe(true);
  });

  it("limits member level items to project members, the lead and owners", () => {
    expect(canSeeSecuredIssue(item("MEMBERS"), viewer())).toBe(false);
    expect(canSeeSecuredIssue(item("MEMBERS"), viewer({ projectRole: "VIEWER" }))).toBe(true);
    expect(canSeeSecuredIssue(item("MEMBERS"), viewer({ isLead: true }))).toBe(true);
    expect(canSeeSecuredIssue(item("MEMBERS"), viewer({ workspaceRole: "owner" }))).toBe(true);
  });

  it("limits admin level items to project admins", () => {
    expect(canSeeSecuredIssue(item("ADMINS"), viewer({ projectRole: "MEMBER" }))).toBe(false);
    expect(canSeeSecuredIssue(item("ADMINS"), viewer({ projectRole: "ADMIN" }))).toBe(true);
  });

  it("always shows an item to its reporter and assignee", () => {
    expect(canSeeSecuredIssue(item("ADMINS", { creatorId: "u1" }), viewer())).toBe(true);
    expect(canSeeSecuredIssue(item("ADMINS", { assigneeUserId: "u1" }), viewer())).toBe(true);
  });

  it("treats unknown levels as unrestricted", () => {
    expect(canSeeSecuredIssue(item("SECRET"), viewer())).toBe(true);
    expect(belongsToSecurityLevel(null, viewer())).toBe(true);
  });
});
