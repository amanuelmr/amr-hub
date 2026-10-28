import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const {
  canBeAssignedOnProject,
  hasPermission,
  jqlMentionsArchived,
  liveIssueWhere,
  resolveProjectPermissions,
  visibleIssueWhere,
  issueSecurityWhere,
  visibleProjectWhere,
} = await import("./projectAccess");
const { canTrashIssue, daysUntilPurge, purgeCutoff, trashExpiresAt } = await import(
  "./trash"
);

type Level = "OPEN" | "LIMITED" | "PRIVATE";
type Role = "ADMIN" | "MEMBER" | "VIEWER" | null;

function perms(
  accessLevel: Level,
  workspaceRole: string,
  projectRole: Role,
  extra: { isLead?: boolean; archived?: boolean; deleted?: boolean } = {},
) {
  return resolveProjectPermissions({
    accessLevel,
    workspaceRole,
    projectRole,
    isLead: extra.isLead ?? false,
    archived: extra.archived,
    deleted: extra.deleted,
  });
}

/** [view, comment, edit, admin] as a compact string like "VCE-". */
function flags(p: ReturnType<typeof perms>) {
  return [
    p.canView ? "V" : "-",
    p.canComment ? "C" : "-",
    p.canEdit ? "E" : "-",
    p.canAdmin ? "A" : "-",
  ].join("");
}

describe("resolveProjectPermissions matrix", () => {
  const cases: [Level, string, Role, string][] = [
    // Workspace owners are implicit admins everywhere.
    ["OPEN", "owner", null, "VCEA"],
    ["LIMITED", "owner", null, "VCEA"],
    ["PRIVATE", "owner", null, "VCEA"],
    // Open: every member edits; workspace viewers only view.
    ["OPEN", "member", null, "VCE-"],
    ["OPEN", "member", "MEMBER", "VCE-"],
    ["OPEN", "member", "ADMIN", "VCEA"],
    ["OPEN", "member", "VIEWER", "VC--"],
    ["OPEN", "viewer", null, "V---"],
    ["OPEN", "viewer", "ADMIN", "V---"],
    // Limited: everyone views, project members edit.
    ["LIMITED", "member", null, "VC--"],
    ["LIMITED", "member", "VIEWER", "VC--"],
    ["LIMITED", "member", "MEMBER", "VCE-"],
    ["LIMITED", "member", "ADMIN", "VCEA"],
    ["LIMITED", "viewer", "MEMBER", "V---"],
    // Private: only project members see it.
    ["PRIVATE", "member", null, "----"],
    ["PRIVATE", "viewer", null, "----"],
    ["PRIVATE", "member", "VIEWER", "VC--"],
    ["PRIVATE", "member", "MEMBER", "VCE-"],
    ["PRIVATE", "member", "ADMIN", "VCEA"],
    ["PRIVATE", "viewer", "ADMIN", "V---"],
  ];

  it.each(cases)("%s / workspace %s / project %s → %s", (level, ws, role, expected) => {
    expect(flags(perms(level, ws, role))).toBe(expected);
  });

  it("treats the project lead as an implicit admin", () => {
    expect(flags(perms("PRIVATE", "member", null, { isLead: true }))).toBe("VCEA");
    expect(flags(perms("LIMITED", "member", "VIEWER", { isLead: true }))).toBe("VCEA");
    expect(flags(perms("PRIVATE", "viewer", null, { isLead: true }))).toBe("V---");
  });

  it("makes archived projects read-only but keeps admin rights", () => {
    expect(flags(perms("OPEN", "member", "ADMIN", { archived: true }))).toBe("V--A");
    expect(flags(perms("OPEN", "owner", null, { archived: true }))).toBe("V--A");
    expect(flags(perms("OPEN", "member", null, { archived: true }))).toBe("V---");
  });

  it("hides deleted projects from everyone", () => {
    expect(flags(perms("OPEN", "owner", null, { deleted: true }))).toBe("----");
  });

  it("falls back to Private for unknown access levels", () => {
    expect(
      resolveProjectPermissions({
        accessLevel: "SOMETHING",
        workspaceRole: "member",
        projectRole: null,
        isLead: false,
      }).canView,
    ).toBe(false);
  });

  it("hasPermission maps needs to flags", () => {
    const limited = perms("LIMITED", "member", null);
    expect(hasPermission(limited, "view")).toBe(true);
    expect(hasPermission(limited, "comment")).toBe(true);
    expect(hasPermission(limited, "edit")).toBe(false);
    expect(hasPermission(limited, "admin")).toBe(false);
  });
});

describe("visibleProjectWhere / visibleIssueWhere", () => {
  it("lets owners see every live project", () => {
    expect(visibleProjectWhere({ id: "u1", role: "owner" }, "org")).toEqual({
      organizationId: "org",
      deletedAt: null,
      archivedAt: null,
    });
  });

  it("limits other users to non-private projects or their own", () => {
    const where = visibleProjectWhere({ id: "u2", role: "member" }, "org", {
      includeArchived: true,
    });
    expect(where).toEqual({
      organizationId: "org",
      deletedAt: null,
      OR: [
        { accessLevel: { not: "PRIVATE" } },
        { leadUserId: "u2" },
        { members: { some: { userId: "u2" } } },
      ],
    });
  });

  it("excludes trashed and archived issues by default", () => {
    const where = visibleIssueWhere({ id: "u2", role: "viewer" }, "org");
    expect(where.organizationId).toBe("org");
    expect(where.deletedAt).toBeNull();
    expect(where.archivedAt).toBeNull();
    expect(where.project).toMatchObject({ deletedAt: null, archivedAt: null });
    expect(Object.keys(where).sort()).toEqual(
      ["AND", "archivedAt", "deletedAt", "organizationId", "project"].sort(),
    );
  });

  it("hides items above the user's security level", () => {
    const where = visibleIssueWhere({ id: "u2", role: "member" }, "org");
    const security = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(security).toEqual(
      expect.arrayContaining([
        { securityLevel: null },
        { creatorId: "u2" },
        { assignee: { userId: "u2" } },
      ]),
    );
    expect(issueSecurityWhere({ id: "u1", role: "owner" })).toEqual({});
  });

  it("can include archived issues and archived projects", () => {
    const where = visibleIssueWhere({ id: "u1", role: "owner" }, "org", {
      includeArchived: true,
      includeArchivedProjects: true,
    });
    expect(where).toEqual({
      organizationId: "org",
      deletedAt: null,
      project: { organizationId: "org", deletedAt: null },
    });
  });

  it("liveIssueWhere excludes trash and archive for system jobs", () => {
    expect(liveIssueWhere("org")).toEqual({
      organizationId: "org",
      deletedAt: null,
      archivedAt: null,
      project: { deletedAt: null, archivedAt: null },
    });
  });
});

describe("jqlMentionsArchived", () => {
  it("detects the archived field", () => {
    expect(jqlMentionsArchived("archived = true")).toBe(true);
    expect(jqlMentionsArchived("project = WEB AND Archived = false")).toBe(true);
    expect(jqlMentionsArchived("summary ~ archivedThing")).toBe(false);
    expect(jqlMentionsArchived("project = WEB")).toBe(false);
  });
});

describe("canBeAssignedOnProject", () => {
  const project = { accessLevel: "PRIVATE", leadUserId: "lead", memberUserIds: ["m1"] };
  it("allows anyone on open and limited projects", () => {
    expect(
      canBeAssignedOnProject(
        { ...project, accessLevel: "LIMITED" },
        { userId: "x", workspaceRole: "member" },
      ),
    ).toBe(true);
  });
  it("allows only members, the lead and owners on private projects", () => {
    expect(canBeAssignedOnProject(project, { userId: "m1", workspaceRole: "member" })).toBe(true);
    expect(canBeAssignedOnProject(project, { userId: "lead", workspaceRole: "member" })).toBe(true);
    expect(canBeAssignedOnProject(project, { userId: "o", workspaceRole: "owner" })).toBe(true);
    expect(canBeAssignedOnProject(project, { userId: "x", workspaceRole: "member" })).toBe(false);
  });
});

describe("trash rules", () => {
  it("lets admins, or editors who reported the item, trash it", () => {
    expect(canTrashIssue("u1", "u2", { canEdit: true, canAdmin: true })).toBe(true);
    expect(canTrashIssue("u1", "u1", { canEdit: true, canAdmin: false })).toBe(true);
    expect(canTrashIssue("u1", "u2", { canEdit: true, canAdmin: false })).toBe(false);
    expect(canTrashIssue("u1", "u1", { canEdit: false, canAdmin: false })).toBe(false);
    expect(canTrashIssue(null, "u1", { canEdit: true, canAdmin: false })).toBe(false);
  });

  it("keeps items for 60 days", () => {
    const deletedAt = new Date("2026-01-01T00:00:00.000Z");
    expect(trashExpiresAt(deletedAt).toISOString()).toBe("2026-03-02T00:00:00.000Z");
    expect(purgeCutoff(new Date("2026-03-02T00:00:00.000Z")).toISOString()).toBe(
      deletedAt.toISOString(),
    );
    expect(daysUntilPurge(deletedAt, new Date("2026-01-31T00:00:00.000Z"))).toBe(30);
    expect(daysUntilPurge(deletedAt, new Date("2026-06-01T00:00:00.000Z"))).toBe(0);
  });
});
