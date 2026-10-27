"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { CircleCheck, Maximize2, Minus, SlidersHorizontal, X } from "lucide-react";
import type { Issue } from "../data/issues";
import { CreateIssueForm, type CreateIssueDefaults } from "./CreateIssueForm";
import { isEditorPopupTarget } from "./issue/issueLinks";
import { selectedIssueHref } from "./issue/selectedIssue";
import { useStoredPrefs } from "./useStoredPrefs";
import {
  CREATE_FIELDS,
  parseHiddenCreateFields,
  type CreateDraft,
  type CreateField,
} from "./createFields";

/** Create dialog: stacked fields, scrolling body, sticky footer. */
export function CreateIssueModal({
  projectId,
  defaults,
  initialDraft,
  onDraftChange,
  onMinimize,
  onClose,
  onCreated,
}: {
  projectId: string | null;
  defaults?: CreateIssueDefaults;
  initialDraft?: CreateDraft | null;
  onDraftChange?: (draft: CreateDraft) => void;
  /** Docks the dialog at the bottom of the page, keeping what was typed. */
  onMinimize?: () => void;
  onClose: () => void;
  onCreated?: (issue: Issue) => void;
}) {
  const { value: hiddenFields, update: updateHidden } = useStoredPrefs(
    "amr.create.hiddenFields",
    parseHiddenCreateFields,
  );

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
            <div className="create-issue-header-actions">
              <ConfigureFields
                hidden={hiddenFields}
                onChange={(next) => updateHidden(() => next)}
              />
              {onMinimize && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Minimize"
                  title="Minimize"
                  onClick={onMinimize}
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close create issue dialog"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
          </header>
          <CreateIssueForm
            defaultProjectId={projectId}
            defaults={defaults}
            allowCreateAnother
            initialDraft={initialDraft}
            onDraftChange={onDraftChange}
            hiddenFields={hiddenFields}
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

/** Choose which optional fields the Create dialog shows, per person. */
function ConfigureFields({
  hidden,
  onChange,
}: {
  hidden: CreateField[];
  onChange: (hidden: CreateField[]) => void;
}) {
  const toggle = (field: CreateField) =>
    onChange(
      hidden.includes(field)
        ? hidden.filter((key) => key !== field)
        : [...hidden, field],
    );
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="icon-button"
          type="button"
          aria-label="Configure fields"
          title="Configure fields"
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="create-fields-popover"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <h3>Show fields</h3>
          <div className="create-fields-modes" role="radiogroup" aria-label="Show fields">
            <button
              type="button"
              role="radio"
              aria-checked={hidden.length === 0}
              className={hidden.length === 0 ? "active" : undefined}
              onClick={() => onChange([])}
            >
              All fields
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={hidden.length > 0}
              className={hidden.length > 0 ? "active" : undefined}
              onClick={() =>
                onChange(
                  hidden.length > 0
                    ? hidden
                    : CREATE_FIELDS.map((field) => field.key).filter(
                        (key) => !["description", "assignee", "priority"].includes(key),
                      ),
                )
              }
            >
              Custom
            </button>
          </div>
          <p className="create-fields-note">
            Project, type, summary and required fields always show.
          </p>
          <ul className="create-fields-list">
            {CREATE_FIELDS.map((field) => (
              <li key={field.key}>
                <label>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(field.key)}
                    onChange={() => toggle(field.key)}
                  />
                  {field.label}
                </label>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The minimized Create dialog, docked at the bottom of the page. */
export function CreateDraftDock({
  label,
  hasContent,
  onExpand,
  onDiscard,
}: {
  label: string;
  hasContent: boolean;
  onExpand: () => void;
  onDiscard: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  return (
    <div className="create-draft-dock" role="region" aria-label="Minimized create dialog">
      {isConfirming ? (
        <>
          <span className="create-draft-dock-text">Discard this draft?</span>
          <button className="text-button" type="button" onClick={() => setIsConfirming(false)}>
            Keep
          </button>
          <button className="danger-button create-draft-discard" type="button" onClick={onDiscard}>
            Discard
          </button>
        </>
      ) : (
        <>
          <button className="create-draft-dock-main" type="button" onClick={onExpand}>
            <span className="create-draft-dock-kicker">Create issue</span>
            <span className="create-draft-dock-text">{label}</span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Expand create dialog"
            title="Expand"
            onClick={onExpand}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Discard draft"
            title="Discard"
            onClick={() => (hasContent ? setIsConfirming(true) : onDiscard())}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
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
