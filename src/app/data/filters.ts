/*
 * Jira-style filters: who can see or edit a saved filter, and the built-in
 * default filters every user gets. Pure and shared by the API and the UI.
 */

/** A filter audience. Teams play the role of Jira's groups. */
export type FilterShare =
  | { type: "WORKSPACE" }
  | { type: "PROJECT"; id: string }
  | { type: "TEAM"; id: string }
  | { type: "USER"; id: string };

export type FilterShareType = FilterShare["type"];

export const SHARE_TYPE_LABELS: Record<FilterShareType, string> = {
  WORKSPACE: "My organization",
  PROJECT: "Project",
  TEAM: "Team",
  USER: "User",
};

/** What the viewer is, for matching shares. */
export type FilterAudience = {
  userId: string;
  /** Workspace role: owner, member or viewer. */
  role: string;
  teamIds: string[];
  /** Projects the viewer can see. */
  projectIds: string[];
};

export type ShareableFilter = {
  ownerId: string | null;
  viewers: FilterShare[];
  editors: FilterShare[];
};

export function parseShares(raw: string | null | undefined): FilterShare[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const shares: FilterShare[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const { type, id } = item as { type?: unknown; id?: unknown };
      if (type === "WORKSPACE") shares.push({ type });
      else if (
        (type === "PROJECT" || type === "TEAM" || type === "USER") &&
        typeof id === "string" &&
        id
      ) {
        shares.push({ type, id });
      }
    }
    return dedupeShares(shares);
  } catch {
    return [];
  }
}

export function shareKey(share: FilterShare) {
  return share.type === "WORKSPACE" ? "WORKSPACE" : `${share.type}:${share.id}`;
}

export function dedupeShares(shares: FilterShare[]) {
  const seen = new Set<string>();
  return shares.filter((share) => {
    const key = shareKey(share);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function shareMatches(share: FilterShare, audience: FilterAudience) {
  switch (share.type) {
    case "WORKSPACE":
      return true;
    case "PROJECT":
      return audience.projectIds.includes(share.id);
    case "TEAM":
      return audience.teamIds.includes(share.id);
    case "USER":
      return audience.userId === share.id;
  }
}

/** Owners and editors can always view; system filters are visible to all. */
export function canViewFilter(filter: ShareableFilter, audience: FilterAudience) {
  if (filter.ownerId === null || filter.ownerId === audience.userId) return true;
  return [...filter.viewers, ...filter.editors].some((share) =>
    shareMatches(share, audience),
  );
}

/** The owner and anyone an editor share matches; workspace viewers never edit. */
export function canEditFilter(filter: ShareableFilter, audience: FilterAudience) {
  if (filter.ownerId === null) return false;
  if (filter.ownerId === audience.userId) return true;
  if (audience.role === "viewer") return false;
  return filter.editors.some((share) => shareMatches(share, audience));
}

/** Deleting, changing the owner: the owner, or a workspace owner (Jira admin). */
export function canManageFilter(filter: ShareableFilter, audience: FilterAudience) {
  if (filter.ownerId === null) return false;
  return filter.ownerId === audience.userId || audience.role === "owner";
}

export type DefaultFilter = {
  id: string;
  name: string;
  jql: string;
};

/** Jira's default filters, available to everyone and never editable. */
export const DEFAULT_FILTERS: DefaultFilter[] = [
  {
    id: "default:my-open",
    name: "My open work items",
    jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
  },
  {
    id: "default:reported",
    name: "Reported by me",
    jql: "reporter = currentUser() ORDER BY created DESC",
  },
  {
    id: "default:viewed",
    name: "Viewed recently",
    jql: "issue in issueHistory() ORDER BY lastViewed DESC",
  },
  {
    id: "default:all",
    name: "All work items",
    jql: "ORDER BY created DESC",
  },
  {
    id: "default:open",
    name: "Open work items",
    jql: "statusCategory != Done ORDER BY priority DESC, updated DESC",
  },
  {
    id: "default:done",
    name: "Done work items",
    jql: "statusCategory = Done ORDER BY updated DESC",
  },
  {
    id: "default:created",
    name: "Created recently",
    jql: "created >= -1w ORDER BY created DESC",
  },
  {
    id: "default:resolved",
    name: "Resolved recently",
    jql: "resolved >= -1w ORDER BY updated DESC",
  },
  {
    id: "default:updated",
    name: "Updated recently",
    jql: "updated >= -1w ORDER BY updated DESC",
  },
];

export function defaultFilter(id: string | null | undefined) {
  return DEFAULT_FILTERS.find((filter) => filter.id === id) ?? null;
}

/** A saved filter as the API returns it. */
export type FilterSummary = {
  id: string;
  name: string;
  description: string | null;
  jql: string;
  ownerId: string | null;
  ownerName: string;
  viewers: FilterShare[];
  editors: FilterShare[];
  isStarred: boolean;
  starCount: number;
  canEdit: boolean;
  canManage: boolean;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
};
