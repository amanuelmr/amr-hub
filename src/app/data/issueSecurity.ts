/**
 * Issue security: a work item can be narrowed below its project's audience.
 * Workspace owners, the item's reporter and its assignee always see it.
 */
export const ISSUE_SECURITY_LEVELS = [
  {
    key: "MEMBERS",
    label: "Project members",
    description: "Only people added to the project, its lead and workspace owners",
  },
  {
    key: "ADMINS",
    label: "Project admins",
    description: "Only project admins, the lead and workspace owners",
  },
] as const;

export type IssueSecurityLevel = (typeof ISSUE_SECURITY_LEVELS)[number]["key"];

export function isIssueSecurityLevel(value: unknown): value is IssueSecurityLevel {
  return ISSUE_SECURITY_LEVELS.some((level) => level.key === value);
}

export type SecurityViewer = {
  userId: string;
  workspaceRole: string;
  /** The viewer's explicit project role, or null when not a project member. */
  projectRole: string | null;
  isLead: boolean;
};

/** Whether the viewer belongs to a security level by their role alone. */
export function belongsToSecurityLevel(
  level: IssueSecurityLevel | null,
  viewer: SecurityViewer,
) {
  if (level === null || viewer.workspaceRole === "owner" || viewer.isLead) return true;
  if (level === "MEMBERS") return viewer.projectRole !== null;
  return viewer.projectRole === "ADMIN";
}

/** Whether the viewer may see an item, given they can see its project. */
export function canSeeSecuredIssue(
  issue: {
    securityLevel: string | null;
    creatorId: string | null;
    assigneeUserId: string | null;
  },
  viewer: SecurityViewer,
) {
  const level = isIssueSecurityLevel(issue.securityLevel) ? issue.securityLevel : null;
  return (
    belongsToSecurityLevel(level, viewer) ||
    issue.creatorId === viewer.userId ||
    issue.assigneeUserId === viewer.userId
  );
}
