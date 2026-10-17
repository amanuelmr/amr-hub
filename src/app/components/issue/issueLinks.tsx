"use client";

import { createContext, useContext } from "react";

/**
 * How issue keys inside the issue view link. On the full page they go to
 * /issues/KEY; inside the modal or a side panel they swap `?selectedIssue`
 * so the user stays on the board/backlog/list.
 */
const IssueHrefContext = createContext<(issueId: string) => string>(
  (issueId) => `/issues/${encodeURIComponent(issueId)}`,
);

export const IssueHrefProvider = IssueHrefContext.Provider;

export function useIssueHref() {
  return useContext(IssueHrefContext);
}

/**
 * Radix modal dialogs treat anything outside their content as "outside".
 * The Tiptap mention list mounts on document.body, so keep interacting with
 * it from closing the dialog.
 */
export function isEditorPopupTarget(target: EventTarget | null) {
  return (
    target instanceof Element && Boolean(target.closest(".mention-suggestions"))
  );
}
