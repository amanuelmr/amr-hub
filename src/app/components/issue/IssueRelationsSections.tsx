"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Globe, Plus, Unlink, X } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import { KindIcon } from "../IssueVisuals";
import { IssuePickerList, type PickerIssue } from "./IssuePicker";
import { childProgress, groupLinks, initials } from "./issueDetailLogic";
import { useIssueHref } from "./issueLinks";
import { issueUrl, type IssueDetailController } from "./useIssueDetail";
import {
  LINK_TYPE_LABELS,
  type Issue,
  type IssueKind,
  type IssueLinkType,
  type IssueRef,
  type IssueStatus,
} from "../../data/issues";
import {
  allowedTransitions,
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
  statusCategory,
  transitionLabel,
  typeName,
} from "../../data/workflow";
import { useWorkflow } from "../../WorkflowProvider";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function IssueRefRow({
  item,
  readOnly,
  onStatus,
  actions,
  projectId,
}: {
  item: IssueRef;
  projectId?: string;
  readOnly: boolean;
  onStatus: (status: IssueStatus) => void;
  actions?: React.ReactNode;
}) {
  const issueHref = useIssueHref();
  const ownerProjectId = item.projectId ?? projectId;
  const workflow = useWorkflow(ownerProjectId);
  const options = [
    { toKey: item.status, name: null },
    ...allowedTransitions(workflow, item.status),
  ];
  return (
    <li className="issue-ref-row">
      <KindIcon kind={item.kind} projectId={ownerProjectId} />
      <Link
        className={`issue-ref-key${isDoneStatus(item.status) ? " is-done" : ""}`}
        href={issueHref(item.id)}
      >
        {item.id}
      </Link>
      <span className="issue-ref-title">{item.title}</span>
      <label
        className={`issue-ref-status status-category-${statusCategory(
          item.status,
        ).toLowerCase()}`}
      >
        <span className="sr-only">Status of {item.id}</span>
        <select
          value={item.status}
          disabled={readOnly}
          onChange={(event) => onStatus(event.target.value as IssueStatus)}
        >
          {options.map((option) => (
            <option key={option.toKey} value={option.toKey}>
              {transitionLabel(option, workflow.statuses)}
            </option>
          ))}
        </select>
      </label>
      <span
        className="avatar avatar-small"
        title={item.assignee?.name ?? "Unassigned"}
      >
        {item.assignee ? initials(item.assignee.name) : "?"}
      </span>
      <span className="issue-ref-points" title="Story points">
        {item.estimate ?? "-"}
      </span>
      {actions}
    </li>
  );
}

export function ChildIssuesSection({
  issue,
  readOnly,
  composerOpen,
  setComposerOpen,
  controller,
}: {
  issue: Issue;
  readOnly: boolean;
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  controller: IssueDetailController;
}) {
  const isEpic = isEpicLevel(issue.kind);
  const workflow = useWorkflow(issue.projectId);
  const childTypes = workflow.types.filter((type) =>
    isEpic ? type.level === 0 : type.level === -1,
  );
  const childKinds: IssueKind[] =
    childTypes.length > 0
      ? childTypes.map((type) => type.key)
      : isEpic
        ? ["STORY", "TASK", "BUG"]
        : ["SUBTASK"];
  const children = issue.children ?? [];
  const progress = childProgress(children);
  const [title, setTitle] = useState("");
  const [kindChoice, setKind] = useState<IssueKind | null>(null);
  const kind =
    kindChoice && childKinds.includes(kindChoice) ? kindChoice : childKinds[0];
  const [isSaving, setIsSaving] = useState(false);

  if (isSubtaskLevel(issue.kind)) return null;
  if (children.length === 0 && !composerOpen) return null;

  const patchChild = async (id: string, body: Record<string, unknown>) => {
    const updated = await controller.run(() =>
      apiRequest<Issue>(issueUrl(id), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    );
    if (updated) {
      controller.applyIssue(updated);
      await controller.refresh();
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 4) {
      controller.setActionError("Use at least 4 characters for the title.");
      return;
    }
    setIsSaving(true);
    const created = await controller.run(() =>
      apiRequest<Issue>("/api/issues", {
        method: "POST",
        body: JSON.stringify({
          title: trimmed,
          description: `<p>${escapeHtml(trimmed)}</p><p>Created from ${escapeHtml(
            issue.id,
          )}.</p>`,
          priority: "MEDIUM",
          kind,
          assigneeId: null,
          dueDate: null,
          estimate: null,
          projectId: issue.projectId,
          cycleId: issue.cycleId,
          labelIds: [],
          parentId: issue.id,
        }),
      }),
    );
    setIsSaving(false);
    if (created) {
      controller.applyIssue(created);
      setTitle("");
      await controller.refresh();
    }
  };

  return (
    <section className="panel issue-section" id="issue-children">
      <div className="panel-header">
        <div>
          <h2>{isEpic ? "Child issues" : "Subtasks"}</h2>
          <p>
            {progress.total === 0
              ? "None yet"
              : `${progress.done} of ${progress.total} done`}
          </p>
        </div>
        {!readOnly && (
          <button
            className="icon-button"
            type="button"
            aria-label={isEpic ? "Add child issue" : "Add subtask"}
            onClick={() => setComposerOpen(!composerOpen)}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {progress.total > 0 && (
        <div
          className="issue-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label="Child issues done"
        >
          <span style={{ width: `${progress.percent}%` }} />
          <em>{progress.percent}%</em>
        </div>
      )}
      <ul className="issue-ref-list">
        {children.map((child) => (
          <IssueRefRow
            key={child.id}
            item={child}
            projectId={issue.projectId}
            readOnly={readOnly}
            onStatus={(status) => void patchChild(child.id, { status })}
            actions={
              !readOnly && !isSubtaskLevel(child.kind) ? (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove ${child.id} from ${issue.id}`}
                  title="Unlink from parent"
                  onClick={() => void patchChild(child.id, { parentId: null })}
                >
                  <Unlink size={13} aria-hidden="true" />
                </button>
              ) : null
            }
          />
        ))}
      </ul>
      {composerOpen && !readOnly && (
        <form className="issue-inline-create" onSubmit={create}>
          <label>
            <span className="sr-only">Child issue type</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as IssueKind)}
            >
              {childKinds.map((option) => (
                <option key={option} value={option}>
                  {typeName(option, workflow.types)}
                </option>
              ))}
            </select>
          </label>
          <label className="issue-inline-create-title">
            <span className="sr-only">Title</span>
            <input
              value={title}
              maxLength={255}
              autoFocus
              placeholder="What needs to be done?"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Creating..." : "Create"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setComposerOpen(false)}
          >
            Cancel
          </button>
        </form>
      )}
    </section>
  );
}

const LINK_TYPES = Object.keys(LINK_TYPE_LABELS) as IssueLinkType[];

export function LinkedIssuesSection({
  issue,
  allIssues,
  readOnly,
  composerOpen,
  setComposerOpen,
  controller,
}: {
  issue: Issue;
  allIssues: Issue[];
  readOnly: boolean;
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  controller: IssueDetailController;
}) {
  const [type, setType] = useState<IssueLinkType>("RELATES_TO");
  const links = issue.links ?? [];
  const groups = groupLinks(links);
  const candidates: PickerIssue[] = allIssues.filter(
    (candidate) => candidate.id !== issue.id,
  );

  if (links.length === 0 && !composerOpen) return null;

  const addLink = async (target: PickerIssue) => {
    const updated = await controller.run(() =>
      apiRequest<Issue>(issueUrl(issue.id, "/links"), {
        method: "POST",
        body: JSON.stringify({ type, targetId: target.id }),
      }),
    );
    if (updated) {
      controller.applyIssue(updated);
      setComposerOpen(false);
    }
  };

  const removeLink = async (linkId: string) => {
    const updated = await controller.run(() =>
      apiRequest<Issue>(
        issueUrl(issue.id, `/links?linkId=${encodeURIComponent(linkId)}`),
        { method: "DELETE" },
      ),
    );
    controller.applyIssue(updated);
  };

  const patchLinked = async (id: string, status: IssueStatus) => {
    const updated = await controller.run(() =>
      apiRequest<Issue>(issueUrl(id), {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    );
    if (updated) {
      controller.applyIssue(updated);
      await controller.refresh();
    }
  };

  return (
    <section className="panel issue-section" id="issue-links">
      <div className="panel-header">
        <div>
          <h2>Linked work items</h2>
          <p>
            {links.length} {links.length === 1 ? "link" : "links"}
          </p>
        </div>
        {!readOnly && (
          <button
            className="icon-button"
            type="button"
            aria-label="Link issue"
            onClick={() => setComposerOpen(!composerOpen)}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {composerOpen && !readOnly && (
        <div className="issue-link-composer">
          <div className="issue-link-composer-top">
            <label className="form-field">
              <span>This issue</span>
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as IssueLinkType)
                }
              >
                {LINK_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {LINK_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label="Cancel linking"
              onClick={() => setComposerOpen(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <IssuePickerList
            candidates={candidates}
            onSelect={(target) => void addLink(target)}
            placeholder="Search issues to link"
          />
        </div>
      )}
      {groups.map((group) => (
        <div className="issue-link-group" key={group.type}>
          <h3>{LINK_TYPE_LABELS[group.type]}</h3>
          <ul className="issue-ref-list">
            {group.links.map((link) => (
              <IssueRefRow
                key={link.id}
                item={link.issue}
                readOnly={readOnly}
                onStatus={(status) => void patchLinked(link.issue.id, status)}
                actions={
                  !readOnly ? (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove link to ${link.issue.id}`}
                      onClick={() => void removeLink(link.id)}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  ) : null
                }
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Links to outside pages (docs, designs, tickets elsewhere). */
export function WebLinksSection({
  issue,
  readOnly,
  composerOpen,
  setComposerOpen,
  controller,
}: {
  issue: Issue;
  readOnly: boolean;
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  controller: IssueDetailController;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const links = issue.webLinks ?? [];

  // The Link menu hands focus back to its button as it closes, so focus the
  // URL field once that has happened instead of relying on autoFocus.
  useEffect(() => {
    if (!composerOpen) return;
    const timer = window.setTimeout(() => urlRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [composerOpen]);

  if (links.length === 0 && !composerOpen) return null;

  const close = () => {
    setUrl("");
    setTitle("");
    setComposerOpen(false);
  };

  const addLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const updated = await controller.run(() =>
      apiRequest<Issue>(issueUrl(issue.id, "/weblinks"), {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), title: title.trim() || undefined }),
      }),
    );
    if (updated) {
      controller.applyIssue(updated);
      close();
    }
  };

  const removeLink = async (linkId: string) => {
    const updated = await controller.run(() =>
      apiRequest<Issue>(
        issueUrl(issue.id, `/weblinks?linkId=${encodeURIComponent(linkId)}`),
        { method: "DELETE" },
      ),
    );
    controller.applyIssue(updated);
  };

  return (
    <section className="panel issue-section" id="issue-web-links">
      <div className="panel-header">
        <div>
          <h2>Web links</h2>
          <p>
            {links.length} {links.length === 1 ? "link" : "links"}
          </p>
        </div>
        {!readOnly && (
          <button
            className="icon-button"
            type="button"
            aria-label="Add web link"
            onClick={() => (composerOpen ? close() : setComposerOpen(true))}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {composerOpen && !readOnly && (
        <form
          className="issue-link-composer issue-web-link-form"
          onSubmit={(event) => void addLink(event)}
          onKeyDown={(event) => event.key === "Escape" && close()}
        >
          <label className="form-field">
            <span>URL</span>
            <input
              ref={urlRef}
              type="url"
              value={url}
              required
              placeholder="https://example.com"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Link text</span>
            <input
              value={title}
              maxLength={255}
              placeholder="Shown instead of the URL"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="issue-web-link-actions">
            <button className="secondary-button" type="button" onClick={close}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={!url.trim()}>
              Link
            </button>
          </div>
        </form>
      )}
      {links.length > 0 && (
        <ul className="issue-ref-list">
          {links.map((link) => (
            <li className="issue-ref-row" key={link.id}>
              <Globe className="issue-web-link-icon" size={16} aria-hidden="true" />
              <a
                className="issue-web-link"
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                title={link.url}
              >
                {link.title}
              </a>
              <span className="issue-web-link-host">{hostOf(link.url)}</span>
              {!readOnly && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove web link ${link.title}`}
                  onClick={() => void removeLink(link.id)}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
