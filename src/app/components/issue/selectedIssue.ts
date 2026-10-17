"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Jira keeps the open issue in the URL (`?selectedIssue=KEY`) so a board,
 * backlog or list can show it in a modal or side panel without leaving the
 * page, and the link stays shareable.
 */
export const SELECTED_ISSUE_PARAM = "selectedIssue";

export function selectedIssueHref(
  pathname: string,
  search: URLSearchParams | string,
  issueId: string | null,
) {
  const params = new URLSearchParams(search.toString());
  if (issueId) {
    params.set(SELECTED_ISSUE_PARAM, issueId);
  } else {
    params.delete(SELECTED_ISSUE_PARAM);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function useSelectedIssue() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedIssueId = searchParams.get(SELECTED_ISSUE_PARAM);

  const open = useCallback(
    (issueId: string) => {
      router.push(selectedIssueHref(pathname, searchParams, issueId), {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  const close = useCallback(() => {
    router.push(selectedIssueHref(pathname, searchParams, null), {
      scroll: false,
    });
  }, [router, pathname, searchParams]);

  return { selectedIssueId, open, close };
}
