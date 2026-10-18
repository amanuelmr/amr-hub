/**
 * j / k on the issue view move to the next / previous issue of the list or
 * board it was opened from.
 *
 * Contract for list/board/backlog pages: write the issue keys in their
 * on-screen order to sessionStorage under ISSUE_NAV_KEY as
 *   { "ids": ["WEB-3", "WEB-1", ...], "source": "/projects/p1/board", "savedAt": 1700000000000 }
 * (use setIssueNavigation). The issue view uses that list when it contains the
 * open issue. Otherwise it falls back to the order of `?selectedIssue=` links
 * rendered on the page behind the modal (board cards, list rows).
 */
export const ISSUE_NAV_KEY = "amr-hub:issue-nav";

export type IssueNavigation = {
  ids: string[];
  source?: string;
  savedAt: number;
};

export function parseIssueNavigation(raw: string | null): IssueNavigation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<IssueNavigation> | null;
    if (!value || !Array.isArray(value.ids)) return null;
    const ids = value.ids.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    return {
      ids,
      source: typeof value.source === "string" ? value.source : undefined,
      savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function setIssueNavigation(ids: string[], source?: string) {
  try {
    window.sessionStorage.setItem(
      ISSUE_NAV_KEY,
      JSON.stringify({
        ids: [...new Set(ids)],
        source: source ?? window.location.pathname,
        savedAt: Date.now(),
      } satisfies IssueNavigation),
    );
  } catch {
    // Storage unavailable: j/k falls back to the links on the page.
  }
}

export function readIssueNavigation(): IssueNavigation | null {
  try {
    return parseIssueNavigation(window.sessionStorage.getItem(ISSUE_NAV_KEY));
  } catch {
    return null;
  }
}

/** The id `delta` steps from `currentId`, or null at either end / not found. */
export function adjacentIssueId(
  ids: string[],
  currentId: string,
  delta: 1 | -1,
): string | null {
  const index = ids.indexOf(currentId);
  if (index === -1) return null;
  return ids[index + delta] ?? null;
}

/** Issue keys from `?selectedIssue=` hrefs, deduplicated, in order. */
export function issueIdsFromHrefs(hrefs: string[]): string[] {
  const ids: string[] = [];
  for (const href of hrefs) {
    const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
    const id = new URLSearchParams(query.split("#")[0]).get("selectedIssue");
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Ordered ids of the list/board behind the open issue (see contract above). */
export function resolveIssueOrder(currentId: string): string[] {
  const stored = readIssueNavigation();
  if (stored?.ids.includes(currentId)) return stored.ids;
  if (typeof document === "undefined") return [];
  const hrefs = [
    ...document.querySelectorAll<HTMLAnchorElement>('a[href*="selectedIssue="]'),
  ]
    .filter((anchor) => !anchor.closest("[data-issue-modal], .issue-view"))
    .map((anchor) => anchor.getAttribute("href") ?? "");
  const ids = issueIdsFromHrefs(hrefs);
  return ids.includes(currentId) ? ids : [];
}
