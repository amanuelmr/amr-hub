"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import { authClient } from "../../../lib/auth-client";
import { projectsByKeyFrom, type JqlContext } from "../../data/jql";
import { selectedIssueHref } from "../issue/selectedIssue";
import { useCustomFields } from "../fields/customFieldStore";
import type { ColumnLookups } from "./columns";

/** Evaluation context for client-side JQL, evaluated at `now`. */
export function useJqlContext(now: Date): JqlContext {
  const { issues, cycles, members } = useIssues();
  const { projects } = useProjects();
  const { data: session } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const userId = session?.user.id ?? null;
  const memberId = activeMember?.id ?? null;
  const { fields: customFields } = useCustomFields();

  return useMemo(
    () => ({
      now,
      customFields,
      currentUserId: userId,
      currentMemberId: memberId,
      projectsByKey: projectsByKeyFrom(projects),
      cycles,
      members,
      issuesById: new Map(issues.map((issue) => [issue.id, issue])),
    }),
    [now, userId, memberId, projects, cycles, members, issues, customFields],
  );
}

export function useColumnLookups(): ColumnLookups {
  const { cycles } = useIssues();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useMemo(
    () => ({
      cyclesById: new Map(cycles.map((cycle) => [cycle.id, cycle])),
      issueHref: (issueId: string) => selectedIssueHref(pathname, searchParams, issueId),
    }),
    [cycles, pathname, searchParams],
  );
}
