"use client";

import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import type { Issue, IssueComment } from "../../data/issues";
import {
  QUICK_REACTIONS,
  reactionTooltip,
  type CommentReactionSummary,
} from "../../data/reactions";
import { EmojiPicker } from "../EmojiPicker";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";

/**
 * Jira's reaction bar: chips for emoji people used (count + who), the quick
 * six on hover/focus, and a picker for more. Clicking toggles your reaction.
 */
export function CommentReactions({
  issueId,
  comment,
  canReact,
  currentUserId,
  controller,
}: {
  issueId: string;
  comment: IssueComment;
  canReact: boolean;
  currentUserId: string | null;
  controller: IssueDetailController;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const reactions = comment.reactions ?? [];
  const used = new Set(reactions.map((reaction) => reaction.emoji));
  const quick = QUICK_REACTIONS.filter((emoji) => !used.has(emoji));

  const mine = (reaction: CommentReactionSummary | undefined) =>
    Boolean(reaction && currentUserId && reaction.userIds.includes(currentUserId));

  const toggle = async (emoji: string) => {
    if (!canReact || pending) return;
    const existing = reactions.find((reaction) => reaction.emoji === emoji);
    setPending(emoji);
    const updated = await controller.run(() =>
      apiRequest<Issue>(
        issueUrl(
          issueId,
          `/comments/${encodeURIComponent(comment.id)}/reactions`,
        ),
        {
          method: mine(existing) ? "DELETE" : "POST",
          body: JSON.stringify({ emoji }),
        },
      ),
    );
    setPending(null);
    if (updated) controller.applyIssue(updated);
  };

  if (!canReact && reactions.length === 0) return null;

  return (
    <div className="comment-reactions" aria-label="Reactions">
      {reactions.map((reaction) => {
        const active = mine(reaction);
        const tooltip = reactionTooltip(reaction, currentUserId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={`reaction-chip${active ? " is-mine" : ""}`}
            aria-pressed={active}
            aria-label={tooltip}
            title={tooltip}
            disabled={!canReact || pending === reaction.emoji}
            onClick={() => void toggle(reaction.emoji)}
          >
            <span aria-hidden="true">{reaction.emoji}</span>
            <span className="reaction-count">{reaction.count}</span>
          </button>
        );
      })}
      {canReact && (
        <span className="reaction-quick">
          {quick.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-quick-button"
              aria-label={`React with ${emoji}`}
              title={`React with ${emoji}`}
              disabled={pending !== null}
              onClick={() => void toggle(emoji)}
            >
              {emoji}
            </button>
          ))}
          <EmojiPicker
            label="Add reaction"
            onPick={(emoji) => void toggle(emoji)}
            trigger={
              <button
                type="button"
                className="reaction-quick-button reaction-more"
                aria-label="Add reaction"
                title="Add reaction"
              >
                <SmilePlus size={14} aria-hidden="true" />
              </button>
            }
          />
        </span>
      )}
    </div>
  );
}
