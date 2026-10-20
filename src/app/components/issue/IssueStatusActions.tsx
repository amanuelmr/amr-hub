"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ThumbsUp,
  UserPlus,
  X,
} from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import {
  RESOLUTION_LABELS,
  type Issue,
  type IssueResolution,
  type IssueStatus,
  type WorkspaceMember,
} from "../../data/issues";
import {
  allowedTransitions,
  isDoneStatus,
  statusCategory,
  statusName,
  transitionLabel,
} from "../../data/workflow";
import { useWorkflow } from "../../WorkflowProvider";
import { initials } from "./issueDetailLogic";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";
import type { WatcherSummary } from "./types";

const RESOLUTIONS = Object.keys(RESOLUTION_LABELS) as IssueResolution[];

export function StatusTransitionButton({
  issue,
  disabled,
  onTransition,
}: {
  issue: Issue;
  disabled: boolean;
  onTransition: (status: IssueStatus, resolution?: IssueResolution) => void;
}) {
  const workflow = useWorkflow(issue.projectId);
  const category = statusCategory(issue.status).toLowerCase();
  const options = allowedTransitions(workflow, issue.status);
  const currentDone = isDoneStatus(issue.status);

  return (
    <div className="issue-status-control">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <button
            className={`issue-status-button status-category-${category}`}
            type="button"
          >
            {statusName(issue.status, workflow.statuses)}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="issue-menu"
            align="start"
            sideOffset={6}
            collisionPadding={12}
          >
            <DropdownMenu.Label className="issue-menu-label">
              Transition to
            </DropdownMenu.Label>
            {options.length === 0 && (
              <DropdownMenu.Item className="issue-menu-item" disabled>
                No transitions available
              </DropdownMenu.Item>
            )}
            {options.map((option) => {
              const swatch = (
                <span
                  className={`issue-status-swatch status-category-${statusCategory(
                    option.toKey,
                  ).toLowerCase()}`}
                />
              );
              const label = transitionLabel(option, workflow.statuses);
              // Entering a done status asks for a resolution, like Jira's screen.
              if (isDoneStatus(option.toKey) && !currentDone) {
                return (
                  <DropdownMenu.Sub key={option.toKey}>
                    <DropdownMenu.SubTrigger className="issue-menu-item">
                      {swatch}
                      {label}
                      <ChevronRight
                        className="issue-menu-end"
                        size={14}
                        aria-hidden="true"
                      />
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent
                        className="issue-menu"
                        sideOffset={4}
                        collisionPadding={12}
                      >
                        <DropdownMenu.Label className="issue-menu-label">
                          Resolution
                        </DropdownMenu.Label>
                        {RESOLUTIONS.map((resolution) => (
                          <DropdownMenu.Item
                            key={resolution}
                            className="issue-menu-item"
                            onSelect={() => onTransition(option.toKey, resolution)}
                          >
                            {RESOLUTION_LABELS[resolution]}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                );
              }
              return (
                <DropdownMenu.Item
                  key={option.toKey}
                  className="issue-menu-item"
                  onSelect={() => onTransition(option.toKey)}
                >
                  {swatch}
                  {label}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {currentDone && issue.resolution && (
        <span className="issue-resolution">
          <Check size={13} aria-hidden="true" />
          {RESOLUTION_LABELS[issue.resolution]}
        </span>
      )}
    </div>
  );
}

export function WatchButton({
  issue,
  currentUserId,
  members,
  canManageOthers,
  controller,
}: {
  issue: Issue;
  currentUserId: string | null;
  members: WorkspaceMember[];
  canManageOthers: boolean;
  controller: IssueDetailController;
}) {
  const [watchers, setWatchers] = useState<WatcherSummary[] | null>(null);
  const [addMemberId, setAddMemberId] = useState("");
  const watcherIds = issue.watcherIds ?? [];
  const isWatching = currentUserId ? watcherIds.includes(currentUserId) : false;

  const loadWatchers = async () => {
    const loaded = await controller.run(() =>
      apiRequest<WatcherSummary[]>(issueUrl(issue.id, "/watchers")),
    );
    if (loaded) setWatchers(loaded);
  };

  const change = async (
    watching: boolean,
    target: { memberId?: string; userId?: string } = {},
  ) => {
    const response = await controller.run(() =>
      apiRequest<{ watchers: WatcherSummary[]; issue: Issue }>(
        issueUrl(issue.id, "/watchers"),
        {
          method: watching ? "POST" : "DELETE",
          body: JSON.stringify(target),
        },
      ),
    );
    if (response) {
      setWatchers(response.watchers);
      controller.applyIssue(response.issue);
    }
  };

  const watchingMemberIds = new Set(
    (watchers ?? []).map((watcher) => watcher.memberId),
  );

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) void loadWatchers();
      }}
    >
      <Popover.Trigger asChild>
        <button
          className={`secondary-button issue-toolbar-button${
            isWatching ? " is-active" : ""
          }`}
          type="button"
          aria-label={`Watchers: ${watcherIds.length}`}
        >
          {isWatching ? (
            <Eye size={15} aria-hidden="true" />
          ) : (
            <EyeOff size={15} aria-hidden="true" />
          )}
          {watcherIds.length}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="issue-popover issue-watchers"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <button
            className="secondary-button"
            type="button"
            onClick={() => void change(!isWatching)}
          >
            {isWatching ? (
              <EyeOff size={15} aria-hidden="true" />
            ) : (
              <Eye size={15} aria-hidden="true" />
            )}
            {isWatching ? "Stop watching" : "Start watching"}
          </button>
          <p className="issue-popover-heading">
            Watching this issue ({watcherIds.length})
          </p>
          <ul className="issue-watcher-list">
            {watchers === null && <li className="field-meta">Loading...</li>}
            {watchers?.map((watcher) => (
              <li key={watcher.userId}>
                <span className="avatar avatar-small">
                  {initials(watcher.name)}
                </span>
                <span>{watcher.name}</span>
                {(canManageOthers || watcher.userId === currentUserId) && (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Remove ${watcher.name} from watchers`}
                    onClick={() =>
                      void change(false, { userId: watcher.userId })
                    }
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canManageOthers && (
            <form
              className="issue-watcher-add"
              onSubmit={(event) => {
                event.preventDefault();
                if (!addMemberId) return;
                void change(true, { memberId: addMemberId });
                setAddMemberId("");
              }}
            >
              <label>
                <span className="sr-only">Add watcher</span>
                <select
                  value={addMemberId}
                  onChange={(event) => setAddMemberId(event.target.value)}
                >
                  <option value="">Add a watcher...</option>
                  {members
                    .filter((member) => !watchingMemberIds.has(member.id))
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="icon-button"
                type="submit"
                aria-label="Add watcher"
                disabled={!addMemberId}
              >
                <UserPlus size={14} aria-hidden="true" />
              </button>
            </form>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function VoteButton({
  issue,
  currentUserId,
  controller,
}: {
  issue: Issue;
  currentUserId: string | null;
  controller: IssueDetailController;
}) {
  const voterIds = issue.voterIds ?? [];
  const hasVoted = currentUserId ? voterIds.includes(currentUserId) : false;
  const isReporter = Boolean(currentUserId) && issue.creator?.id === currentUserId;
  const resolved = isDoneStatus(issue.status);
  const blocked = !hasVoted && (isReporter || resolved);

  return (
    <button
      className={`secondary-button issue-toolbar-button${
        hasVoted ? " is-active" : ""
      }`}
      type="button"
      disabled={blocked}
      title={
        isReporter
          ? "You cannot vote for an issue you reported"
          : resolved && !hasVoted
            ? "Resolved issues cannot be voted on"
            : hasVoted
              ? "Remove your vote"
              : "Vote for this issue"
      }
      aria-pressed={hasVoted}
      onClick={async () => {
        const updated = await controller.run(() =>
          apiRequest<Issue>(issueUrl(issue.id, "/vote"), {
            method: hasVoted ? "DELETE" : "POST",
          }),
        );
        controller.applyIssue(updated);
      }}
    >
      <ThumbsUp size={15} aria-hidden="true" />
      {voterIds.length}
    </button>
  );
}
