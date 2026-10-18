"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ArrowDownUp,
  CalendarDays,
  CirclePlus,
  Clock3,
  FilePenLine,
  Hash,
  Link2,
  MessageSquare,
  Paperclip,
  Pencil,
  RefreshCcw,
  Repeat2,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { CommentBody } from "../CommentBody";
import { RichTextEditor, type ImageUploader } from "../RichTextEditor";
import { legacyCommentToHtml, stripHtml } from "../../data/richText";
import { CommentReactions } from "./CommentReactions";
import {
  formatDuration,
  type Issue,
  type IssueActivity,
  type IssueComment,
  type WorkspaceMember,
} from "../../data/issues";
import {
  formatAbsolute,
  initials,
  relativeTime,
  sortByDate,
  type SortOrder,
} from "./issueDetailLogic";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";
import type { Worklog } from "./types";

function When({ value }: { value: string }) {
  return (
    <time dateTime={value} title={formatAbsolute(value)}>
      {relativeTime(value)}
    </time>
  );
}

function ActivityIcon({ type }: { type: IssueActivity["type"] }) {
  let Icon = RefreshCcw;
  if (type === "CREATED") Icon = CirclePlus;
  if (type === "COMMENT_ADDED") Icon = MessageSquare;
  if (type === "ASSIGNEE_CHANGED") Icon = UserRound;
  if (type === "CONTENT_UPDATED") Icon = FilePenLine;
  if (type === "DUE_DATE_CHANGED" || type === "START_DATE_CHANGED") {
    Icon = CalendarDays;
  }
  if (type === "CYCLE_CHANGED") Icon = Repeat2;
  if (type === "ESTIMATE_CHANGED") Icon = Hash;
  if (type === "WORK_LOGGED" || type === "TIME_TRACKING_CHANGED") Icon = Clock3;
  if (type === "LINK_ADDED" || type === "LINK_REMOVED") Icon = Link2;
  if (type === "ATTACHMENT_ADDED" || type === "ATTACHMENT_REMOVED") {
    Icon = Paperclip;
  }
  if (
    type === "TYPE_CHANGED" ||
    type === "PRIORITY_CHANGED" ||
    type === "LABELS_CHANGED"
  ) {
    Icon = Tag;
  }
  return (
    <span className={`activity-icon activity-${type.toLowerCase()}`}>
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

function HistoryItem({ event }: { event: IssueActivity }) {
  return (
    <article className="activity-item">
      <ActivityIcon type={event.type} />
      <div>
        <p>
          <strong>{event.actor}</strong> {event.description}
        </p>
        <When value={event.createdAt} />
      </div>
    </article>
  );
}

/** Rich comment bodies need visible text (2+ chars) or an image. */
function hasCommentContent(html: string) {
  return stripHtml(html).length >= 2 || /<img\b/i.test(html);
}

function CommentItem({
  issueId,
  comment,
  members,
  canEdit,
  canDelete,
  canReact,
  currentUserId,
  controller,
  onUploadImages,
}: {
  issueId: string;
  comment: IssueComment;
  members: WorkspaceMember[];
  canEdit: boolean;
  canDelete: boolean;
  canReact: boolean;
  currentUserId: string | null;
  controller: IssueDetailController;
  onUploadImages?: ImageUploader;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => legacyCommentToHtml(comment.body));
  const url = issueUrl(issueId, `/comments/${encodeURIComponent(comment.id)}`);

  const save = async () => {
    if (!hasCommentContent(draft)) return;
    const updated = await controller.run(() =>
      apiRequest<Issue>(url, {
        method: "PATCH",
        body: JSON.stringify({ body: draft }),
      }),
    );
    if (updated) {
      controller.applyIssue(updated);
      setIsEditing(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this comment?")) return;
    controller.applyIssue(
      await controller.run(() => apiRequest<Issue>(url, { method: "DELETE" })),
    );
  };

  return (
    <article className="comment">
      <span className="avatar">{initials(comment.author)}</span>
      <div>
        <header>
          <strong>{comment.author}</strong>
          <When value={comment.createdAt} />
          {comment.editedAt && (
            <span className="issue-comment-edited">(edited)</span>
          )}
        </header>
        {isEditing ? (
          <div className="issue-comment-edit">
            <RichTextEditor
              value={draft}
              onChange={setDraft}
              members={members}
              autoFocus
              onUploadImages={onUploadImages}
              onSubmitShortcut={() => void save()}
            />
            <div className="issue-comment-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!hasCommentContent(draft)}
                onClick={() => void save()}
              >
                Save
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setDraft(legacyCommentToHtml(comment.body));
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <CommentBody body={comment.body} />
            <CommentReactions
              issueId={issueId}
              comment={comment}
              canReact={canReact}
              currentUserId={currentUserId}
              controller={controller}
            />
            {(canEdit || canDelete) && (
              <div className="issue-comment-actions">
                {canEdit && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setDraft(legacyCommentToHtml(comment.body));
                      setIsEditing(true);
                    }}
                  >
                    <Pencil size={12} aria-hidden="true" />
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void remove()}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function WorklogItem({
  worklog,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  worklog: Worklog;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="comment issue-worklog">
      <span className="avatar">{initials(worklog.author)}</span>
      <div>
        <header>
          <strong>{worklog.author}</strong>
          <span>logged {formatDuration(worklog.minutes)}</span>
          <When value={worklog.startedAt} />
        </header>
        {worklog.comment && <p className="comment-body">{worklog.comment}</p>}
        {(canEdit || canDelete) && (
          <div className="issue-comment-actions">
            {canEdit && (
              <button className="text-button" type="button" onClick={onEdit}>
                <Pencil size={12} aria-hidden="true" />
                Edit
              </button>
            )}
            {canDelete && (
              <button className="text-button" type="button" onClick={onDelete}>
                <Trash2 size={12} aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

type FeedEntry =
  | { kind: "comment"; createdAt: string; item: IssueComment }
  | { kind: "history"; createdAt: string; item: IssueActivity }
  | { kind: "worklog"; createdAt: string; item: Worklog };

const ORDER_STORAGE_KEY = "issue-activity-order";
type ActivityTab = "all" | "comments" | "history" | "worklog";

function readStoredOrder(): SortOrder {
  try {
    return window.localStorage.getItem(ORDER_STORAGE_KEY) === "OLDEST"
      ? "OLDEST"
      : "NEWEST";
  } catch {
    return "NEWEST";
  }
}

function isEditableTarget(element: Element) {
  const html = element as HTMLElement;
  return (
    html.tagName === "INPUT" ||
    html.tagName === "TEXTAREA" ||
    html.tagName === "SELECT" ||
    html.isContentEditable ||
    Boolean(
      element.closest(
        "[contenteditable='true'], [role='menu'], [role='listbox']",
      ),
    )
  );
}

function CommentComposer({
  issueId,
  members,
  currentUserName,
  expanded,
  setExpanded,
  controller,
  onUploadImages,
}: {
  issueId: string;
  members: WorkspaceMember[];
  currentUserName: string | null;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  controller: IssueDetailController;
  onUploadImages?: ImageUploader;
}) {
  const [comment, setComment] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  const postComment = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    // Stored as rich HTML; the server sanitizes it.
    const body = comment;
    if (!hasCommentContent(body) || isPosting) return;
    setIsPosting(true);
    const updated = await controller.run(() =>
      apiRequest<Issue>(issueUrl(issueId, "/comments"), {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    );
    setIsPosting(false);
    if (updated) {
      setComment("");
      setExpanded(false);
      await controller.refresh();
    }
  };

  return (
    <div className="issue-comment-composer">
      <span className="avatar avatar-green">
        {currentUserName ? initials(currentUserName) : "?"}
      </span>
      {expanded ? (
        <form className="issue-comment-form" onSubmit={postComment}>
          <div role="group" aria-label="Add a comment">
            <RichTextEditor
              value={comment}
              onChange={setComment}
              members={members}
              autoFocus
              onUploadImages={onUploadImages}
              onSubmitShortcut={() => void postComment()}
              placeholder="Add a comment… Type @ to mention someone."
            />
          </div>
          <div className="issue-comment-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={!hasCommentContent(comment) || isPosting}
            >
              {isPosting ? "Saving..." : "Save"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setComment("");
                setExpanded(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="issue-comment-collapsed">
          <button
            className="issue-comment-placeholder"
            type="button"
            onClick={() => setExpanded(true)}
          >
            Add a comment…
          </button>
          <p className="issue-comment-tip">
            <strong>Pro tip:</strong> press <kbd>M</kbd> to comment
          </p>
        </div>
      )}
    </div>
  );
}

export function IssueActivityTabs({
  issue,
  worklogs,
  members,
  currentUserId,
  currentUserName,
  readOnly,
  canComment = !readOnly,
  isOwner,
  controller,
  onEditWorklog,
  onUploadImages,
}: {
  issue: Issue;
  worklogs: Worklog[];
  members: WorkspaceMember[];
  currentUserId: string | null;
  currentUserName: string | null;
  readOnly: boolean;
  /** Limited projects let non-members comment without editing. */
  canComment?: boolean;
  isOwner: boolean;
  controller: IssueDetailController;
  onEditWorklog: (worklog: Worklog | null) => void;
  /** Pasted/dropped images in comments become issue attachments. */
  onUploadImages?: ImageUploader;
}) {
  // The view only mounts after the client fetch, so localStorage is safe here.
  const [order, setOrderState] = useState<SortOrder>(readStoredOrder);
  const [tab, setTab] = useState<ActivityTab>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  const setOrder = (next: SortOrder) => {
    setOrderState(next);
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works.
    }
  };

  useEffect(() => {
    if (!canComment) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "m" && event.key !== "M") return;
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const section = sectionRef.current;
      if (!section) return;
      const target =
        event.target instanceof Element ? event.target : document.body;
      if (isEditableTarget(target)) return;
      const ownDialog = section.closest("[role='dialog']");
      if (target.closest("[role='dialog']") !== ownDialog) return;
      if (!ownDialog && document.querySelector("[data-issue-modal]")) return;
      event.preventDefault();
      setTab((current) =>
        current === "history" || current === "worklog" ? "all" : current,
      );
      setComposerOpen(true);
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canComment]);

  const comments = sortByDate(issue.comments ?? [], order);
  const history = sortByDate(
    (issue.activity ?? []).filter((event) => event.type !== "COMMENT_ADDED"),
    order,
  );
  const sortedWorklogs = sortByDate(
    worklogs.map((worklog) => ({ ...worklog, createdAt: worklog.startedAt })),
    order,
  );
  const feed = sortByDate<FeedEntry>(
    [
      ...comments.map((item) => ({
        kind: "comment" as const,
        createdAt: item.createdAt,
        item,
      })),
      ...history.map((item) => ({
        kind: "history" as const,
        createdAt: item.createdAt,
        item,
      })),
      ...worklogs.map((item) => ({
        kind: "worklog" as const,
        createdAt: item.createdAt,
        item,
      })),
    ],
    order,
  );

  const deleteWorklog = async (worklog: Worklog) => {
    if (!window.confirm("Delete this work log?")) return;
    const updated = await controller.run(() =>
      apiRequest<Issue>(
        issueUrl(issue.id, `/worklogs/${encodeURIComponent(worklog.id)}`),
        { method: "DELETE" },
      ),
    );
    if (updated) {
      controller.applyIssue(updated);
      await controller.refreshWorklogs();
    }
  };

  const renderComment = (item: IssueComment) => (
    <CommentItem
      key={`comment-${item.id}`}
      issueId={issue.id}
      comment={item}
      members={members}
      canEdit={canComment && item.authorId === currentUserId}
      canDelete={canComment && (isOwner || item.authorId === currentUserId)}
      canReact={canComment}
      currentUserId={currentUserId}
      controller={controller}
      onUploadImages={onUploadImages}
    />
  );

  const renderWorklog = (item: Worklog) => (
    <WorklogItem
      key={`worklog-${item.id}`}
      worklog={item}
      canEdit={!readOnly && item.userId === currentUserId}
      canDelete={!readOnly && (isOwner || item.userId === currentUserId)}
      onEdit={() => onEditWorklog(item)}
      onDelete={() => void deleteWorklog(item)}
    />
  );

  const composer = canComment && (
    <CommentComposer
      issueId={issue.id}
      members={members}
      currentUserName={currentUserName}
      expanded={composerOpen}
      setExpanded={setComposerOpen}
      controller={controller}
      onUploadImages={onUploadImages}
    />
  );

  return (
    <section className="issue-section issue-activity" ref={sectionRef}>
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(value as ActivityTab)}
      >
        <div className="issue-section-header issue-activity-header">
          <h2>Activity</h2>
          <button
            className="text-button"
            type="button"
            title="Change sort order"
            onClick={() => setOrder(order === "NEWEST" ? "OLDEST" : "NEWEST")}
          >
            <ArrowDownUp size={13} aria-hidden="true" />
            {order === "NEWEST" ? "Newest first" : "Oldest first"}
          </button>
        </div>
        <div className="issue-activity-show">
          <span>Show:</span>
          <Tabs.List className="issue-activity-tabs" aria-label="Activity">
            <Tabs.Trigger value="all">All</Tabs.Trigger>
            <Tabs.Trigger value="comments">
              Comments <span>{comments.length}</span>
            </Tabs.Trigger>
            <Tabs.Trigger value="history">History</Tabs.Trigger>
            <Tabs.Trigger value="worklog">
              Work log <span>{worklogs.length}</span>
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value="all" className="issue-activity-content">
          {composer}
          <div className="comment-list">
            {feed.map((entry) =>
              entry.kind === "comment" ? (
                renderComment(entry.item)
              ) : entry.kind === "worklog" ? (
                renderWorklog(entry.item)
              ) : (
                <HistoryItem
                  key={`history-${entry.item.id}`}
                  event={entry.item}
                />
              ),
            )}
          </div>
        </Tabs.Content>

        <Tabs.Content value="comments" className="issue-activity-content">
          {composer}
          <div className="comment-list">
            {comments.length === 0 && (
              <p className="field-meta">No comments yet.</p>
            )}
            {comments.map(renderComment)}
          </div>
        </Tabs.Content>

        <Tabs.Content value="history" className="issue-activity-content">
          <div className="activity-list">
            {history.map((event) => (
              <HistoryItem key={event.id} event={event} />
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="worklog" className="issue-activity-content">
          {!readOnly && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => onEditWorklog(null)}
            >
              <Clock3 size={15} aria-hidden="true" />
              Log work
            </button>
          )}
          <div className="comment-list">
            {sortedWorklogs.length === 0 && (
              <p className="field-meta">No work logged yet.</p>
            )}
            {sortedWorklogs.map(renderWorklog)}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
