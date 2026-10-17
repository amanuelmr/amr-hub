"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { usePathname, useSearchParams } from "next/navigation";
import { IssueDetailContainer } from "./IssueDetailView";
import { isIssuePanelRoute } from "./issueDetailLogic";
import { isEditorPopupTarget } from "./issueLinks";
import { useSelectedIssue } from "./selectedIssue";

export { isIssuePanelRoute };

/**
 * Routes that show `?selectedIssue` in their own side panel rather than this
 * modal: the backlog and the /issues search page in detail view.
 */
export const ISSUE_PANEL_ROUTES = {
  matches: isIssuePanelRoute,
};

function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * Global Jira-style issue modal driven by `?selectedIssue=KEY`.
 * Mounted once in AppShell. Radix handles focus trap and body scroll lock.
 */
export function IssueOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedIssueId, close } = useSelectedIssue();

  if (!selectedIssueId || isIssuePanelRoute(pathname, searchParams)) {
    return null;
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="issue-modal-overlay" />
        <Dialog.Content
          className="issue-modal"
          data-issue-modal=""
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            // Esc first leaves an inline editor; a second Esc closes.
            if (isTextEntry(document.activeElement)) {
              event.preventDefault();
              (document.activeElement as HTMLElement).blur();
            }
          }}
          onInteractOutside={(event) => {
            if (isEditorPopupTarget(event.target)) event.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">Issue {selectedIssueId}</Dialog.Title>
          <IssueDetailContainer
            issueId={selectedIssueId}
            variant="modal"
            onClose={close}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
