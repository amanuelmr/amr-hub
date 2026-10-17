/** Shared client/server shapes for the People directory, profiles and Teams. */

export type WorkCategory = "TODO" | "IN_PROGRESS" | "DONE";

export type WorkItemSummary = {
  id: string;
  title: string;
  kind: string;
  priority: string;
  status: string;
  statusName: string;
  statusCategory: WorkCategory;
  projectId: string;
  projectName: string;
  projectKey: string;
  assignee: { userId: string; name: string } | null;
  teamId: string | null;
  updatedAt: string;
};

export type TeamRef = { id: string; name: string };

export type PersonSummary = {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  joinedAt: string;
  teams: TeamRef[];
  openAssignedCount: number;
};

export type WorkedOnReason = "created" | "commented" | "updated";

export type WorkedOnEntry = {
  issue: WorkItemSummary;
  reason: WorkedOnReason;
  detail: string | null;
  at: string;
};

export type PersonPlace = {
  projectId: string;
  name: string;
  key: string;
  color: string | null;
  issueCount: number;
  lastAt: string;
};

export type TeamMemberRef = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  members: TeamMemberRef[];
  openIssueCount: number;
  canEdit: boolean;
};

export type TeamDetail = TeamSummary & { work: WorkItemSummary[] };

export type PersonProfile = {
  person: PersonSummary;
  assigned: WorkItemSummary[];
  workedOn: WorkedOnEntry[];
  places: PersonPlace[];
  teams: TeamSummary[];
};
