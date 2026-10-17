"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleCheck, X } from "lucide-react";
import type { Issue } from "../data/issues";
import { CreateIssueForm, type CreateIssueDefaults } from "./CreateIssueForm";
import { isEditorPopupTarget } from "./issue/issueLinks";
import { selectedIssueHref } from "./issue/selectedIssue";

/** Jira "Create issue" dialog: stacked fields, scrolling body, sticky footer. */
export function CreateIssueModal({
  projectId,
  defaults,
  onClose,
  onCreated,
}: {
  projectId: string | null;
  defaults?: CreateIssueDefaults;
  onClose: () => void;
  onCreated?: (issue: Issue) => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="issue-modal-overlay" />
        <Dialog.Content
          className="create-issue-modal"
          onInteractOutside={(event) => {
            if (isEditorPopupTarget(event.target)) event.preventDefault();
          }}
        >
          <header className="create-issue-header">
            <Dialog.Title asChild>
              <h2>Create issue</h2>
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Required fields are marked with an asterisk.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                type="button"
                aria-label="Close create issue dialog"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <CreateIssueForm
            defaultProjectId={projectId}
            defaults={defaults}
            allowCreateAnother
            onCreated={(issue, { createAnother }) => {
              onCreated?.(issue);
              if (!createAnother) onClose();
            }}
            onCancel={onClose}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CreatedToastBody({
  issueId,
  onDismiss,
}: {
  issueId: string;
  onDismiss: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timeout);
  }, [issueId, onDismiss]);

  return (
    <div className="create-issue-toast" role="status" aria-live="polite">
      <CircleCheck size={18} aria-hidden="true" />
      <div>
        <p>
          <strong>{issueId}</strong> has been created
        </p>
        <Link
          href={selectedIssueHref(pathname, searchParams, issueId)}
          scroll={false}
          onClick={onDismiss}
        >
          View issue
        </Link>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Small Jira-style flag shown after an issue is created from the dialog. */
export function CreatedIssueToast({
  issueId,
  onDismiss,
}: {
  issueId: string | null;
  onDismiss: () => void;
}) {
  if (!issueId) return null;
  return (
    <Suspense fallback={null}>
      <CreatedToastBody key={issueId} issueId={issueId} onDismiss={onDismiss} />
    </Suspense>
  );
}
