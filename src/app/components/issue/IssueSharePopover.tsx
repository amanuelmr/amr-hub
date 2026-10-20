"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Link2, Search, Share2, X } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import type { WorkspaceMember } from "../../data/issues";
import { initials } from "./issueDetailLogic";
import { issueUrl } from "./useIssueDetail";

export function issueShareLink(issueId: string) {
  return `${window.location.origin}/issues/${encodeURIComponent(issueId)}`;
}

export async function copyIssueLink(issueId: string) {
  try {
    await navigator.clipboard.writeText(issueShareLink(issueId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Jira's Share: pick teammates, add an optional note, and they get an
 * in-app notification. The link is copied too.
 */
export function IssueSharePopover({
  issueId,
  members,
  currentMemberId,
  compact = false,
  open,
  onOpenChange,
}: {
  issueId: string;
  members: WorkspaceMember[];
  currentMemberId: string | null;
  compact?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "done"; text: string }
  >({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const candidates = members.filter(
    (member) =>
      member.id !== currentMemberId &&
      !selected.includes(member.id) &&
      `${member.name} ${member.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const selectedMembers = selected
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is WorkspaceMember => Boolean(member));

  const reset = () => {
    setQuery("");
    setSelected([]);
    setMessage("");
    setError(null);
  };

  const copy = async () => {
    const ok = await copyIssueLink(issueId);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    if (selected.length === 0) return;
    setStatus({ kind: "sending" });
    setError(null);
    try {
      const result = await apiRequest<{ sharedWith: { name: string }[] }>(
        issueUrl(issueId, "/share"),
        {
          method: "POST",
          body: JSON.stringify({
            memberIds: selected,
            message: message.trim() || undefined,
          }),
        },
      );
      await copyIssueLink(issueId);
      const names = result.sharedWith.map((person) => person.name);
      setStatus({
        kind: "done",
        text:
          names.length === 1
            ? `Shared with ${names[0]}. Link copied.`
            : `Shared with ${names.length} people. Link copied.`,
      });
      reset();
    } catch (shareError) {
      setStatus({ kind: "idle" });
      setError(
        shareError instanceof Error
          ? shareError.message
          : "The issue could not be shared",
      );
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
          setStatus({ kind: "idle" });
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          className={`secondary-button issue-toolbar-button${
            compact ? " is-compact" : ""
          }`}
          type="button"
          title="Share (s)"
          aria-label="Share"
        >
          <Share2 size={15} aria-hidden="true" />
          {!compact && "Share"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="issue-popover share-popover"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <p className="issue-popover-heading">Share {issueId}</p>
          <form
            className="share-form"
            onSubmit={(event) => {
              event.preventDefault();
              void share();
            }}
          >
            {selectedMembers.length > 0 && (
              <ul className="share-chips" aria-label="Sharing with">
                {selectedMembers.map((member) => (
                  <li key={member.id}>
                    <span className="avatar avatar-small">
                      {initials(member.name)}
                    </span>
                    {member.name}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove ${member.name}`}
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((id) => id !== member.id),
                        )
                      }
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="share-search">
              <Search size={13} aria-hidden="true" />
              <span className="sr-only">Find teammates</span>
              <input
                value={query}
                autoFocus
                placeholder="Names or emails"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <ul className="share-results" role="listbox" aria-label="Teammates">
              {candidates.length === 0 && (
                <li className="field-meta">
                  {members.length <= 1
                    ? "Invite teammates to share issues with them."
                    : "No matching teammates."}
                </li>
              )}
              {candidates.slice(0, 6).map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setSelected((current) => [...current, member.id]);
                      setQuery("");
                    }}
                  >
                    <span className="avatar avatar-small">
                      {initials(member.name)}
                    </span>
                    <span>
                      {member.name}
                      <small>{member.email}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <label className="share-message">
              <span className="sr-only">Message (optional)</span>
              <textarea
                value={message}
                maxLength={1000}
                rows={2}
                placeholder="Add a message (optional)"
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            {error && (
              <p className="form-submit-error" role="alert">
                {error}
              </p>
            )}
            {status.kind === "done" && (
              <p className="share-status" role="status">
                <Check size={13} aria-hidden="true" />
                {status.text}
              </p>
            )}
            <div className="share-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => void copy()}
              >
                {copied ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Link2 size={13} aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={selected.length === 0 || status.kind === "sending"}
              >
                {status.kind === "sending" ? "Sharing…" : "Share"}
              </button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
