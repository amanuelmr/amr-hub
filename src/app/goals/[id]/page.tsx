"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertTriangle, ChevronRight, Link2, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { WorkspaceLoading } from "../../components/WorkspaceLoading";
import { DescriptionView } from "../../components/DescriptionView";
import { RichTextEditor } from "../../components/RichTextEditor";
import { KindIcon } from "../../components/IssueVisuals";
import { IssuePickerList, type PickerIssue } from "../../components/issue/IssuePicker";
import { selectedIssueHref } from "../../components/issue/selectedIssue";
import * as Popover from "@radix-ui/react-popover";
import {
  AdminDialog,
  PersonAvatar,
  useWorkspaceRole,
} from "../../projects/[projectId]/settings/adminUi";
import { CreateGoalDialog } from "../../components/goals/CreateGoalDialog";
import {
  formatGoalDate,
  GoalIcon,
  GoalProgressBar,
  GoalStatusLozenge,
} from "../../components/goals/GoalVisuals";
import {
  descendantGoalIds,
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  isGoalOverdue,
  sortGoals,
  type GoalDetail,
  type GoalListResponse,
  type GoalStatus,
} from "../../components/goals/goalModel";
import type { IssueKind } from "../../data/issues";

const TIMESTAMP = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const goalId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isViewer } = useWorkspaceRole();
  const { issues: workspaceIssues, members } = useIssues();
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [directory, setDirectory] = useState<GoalListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState("");
  const [updateStatus, setUpdateStatus] = useState<GoalStatus>("ON_TRACK");
  const [updateBody, setUpdateBody] = useState("");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCreatingSubGoal, setIsCreatingSubGoal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const base = `/api/goals/${encodeURIComponent(goalId)}`;

  const loadDirectory = useCallback(async () => {
    try {
      setDirectory(await apiRequest<GoalListResponse>("/api/goals"));
    } catch {
      // The directory only feeds pickers; the page still works without it.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(base, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Goal could not be loaded");
        setGoal(payload as GoalDetail);
        setUpdateStatus(
          (payload as GoalDetail).status === "PENDING"
            ? "ON_TRACK"
            : (payload as GoalDetail).status,
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(message(error, "Goal could not be loaded"));
      });
    apiRequest<GoalListResponse>("/api/goals", { signal: controller.signal })
      .then(setDirectory)
      .catch(() => undefined);
    return () => controller.abort();
  }, [base]);

  const patchGoal = async (body: Record<string, unknown>) => {
    setActionError(null);
    try {
      const updated = await apiRequest<GoalDetail>(base, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setGoal(updated);
      if ("parentId" in body || "name" in body) void loadDirectory();
      return true;
    } catch (error) {
      setActionError(message(error, "Goal could not be updated"));
      return false;
    }
  };

  const parentOptions = useMemo(() => {
    if (!directory) return [];
    const blocked = descendantGoalIds(
      goalId,
      directory.goals.map((candidate) => ({
        id: candidate.id,
        parentId: candidate.parent?.id ?? null,
      })),
    );
    return sortGoals(directory.goals.filter((candidate) => !blocked.has(candidate.id)));
  }, [directory, goalId]);

  const pickerCandidates: PickerIssue[] = useMemo(() => {
    const linked = new Set(goal?.issues.map((issue) => issue.id));
    return workspaceIssues
      .filter((issue) => !linked.has(issue.id))
      .map((issue) => ({ id: issue.id, title: issue.title, kind: issue.kind }));
  }, [workspaceIssues, goal]);

  if (notFound) {
    return (
      <div className="page gf-page">
        <div className="empty-state gf-empty">
          <h1>Goal not found</h1>
          <p>It may have been deleted, or it belongs to another workspace.</p>
          <Link className="secondary-button" href="/goals">
            Back to goals
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page gf-page">
        <p className="form-submit-error" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (!goal) return <WorkspaceLoading label="goal" />;

  const overdue = isGoalOverdue(goal);

  const saveName = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === goal.name) {
      setIsEditingName(false);
      return;
    }
    if (await patchGoal({ name: trimmed })) setIsEditingName(false);
  };

  const saveAbout = async () => {
    if (await patchGoal({ description: aboutDraft })) setIsEditingAbout(false);
  };

  const postUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!updateBody.trim()) {
      setUpdateError("Describe the progress since the last update.");
      return;
    }
    setIsPosting(true);
    setUpdateError(null);
    try {
      const updated = await apiRequest<GoalDetail>(`${base}/updates`, {
        method: "POST",
        body: JSON.stringify({ status: updateStatus, body: updateBody.trim() }),
      });
      setGoal(updated);
      setUpdateBody("");
    } catch (error) {
      setUpdateError(message(error, "Status update could not be posted"));
    } finally {
      setIsPosting(false);
    }
  };

  const linkIssue = async (issue: PickerIssue) => {
    setIsPickerOpen(false);
    setActionError(null);
    try {
      setGoal(
        await apiRequest<GoalDetail>(`${base}/issues`, {
          method: "POST",
          body: JSON.stringify({ issueIds: [issue.id] }),
        }),
      );
    } catch (error) {
      setActionError(message(error, "Work item could not be linked"));
    }
  };

  const unlinkIssue = async (issueId: string) => {
    setActionError(null);
    try {
      setGoal(
        await apiRequest<GoalDetail>(
          `${base}/issues?issueId=${encodeURIComponent(issueId)}`,
          { method: "DELETE" },
        ),
      );
    } catch (error) {
      setActionError(message(error, "Work item could not be unlinked"));
    }
  };

  const deleteGoal = async () => {
    try {
      await apiRequest(base, { method: "DELETE" });
      router.push("/goals");
    } catch (error) {
      setActionError(message(error, "Goal could not be deleted"));
      setIsDeleting(false);
    }
  };

  return (
    <div className="page gf-page gf-goal-page">
      <nav className="gf-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/goals">Goals</Link>
        {goal.parent && (
          <>
            <ChevronRight size={12} aria-hidden="true" />
            <Link href={`/goals/${goal.parent.id}`}>{goal.parent.name}</Link>
          </>
        )}
      </nav>

      <header className="gf-goal-header">
        <div className="gf-goal-title-row">
          <GoalIcon size={18} />
          {isEditingName ? (
            <form className="gf-inline-form" onSubmit={saveName}>
              <input
                className="gf-title-input"
                value={nameDraft}
                maxLength={255}
                aria-label="Goal name"
                autoFocus
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setIsEditingName(false);
                }}
              />
            </form>
          ) : (
            <h1
              className={isViewer ? "gf-goal-title" : "gf-goal-title gf-editable"}
              onClick={() => {
                if (isViewer) return;
                setNameDraft(goal.name);
                setIsEditingName(true);
              }}
              title={isViewer ? undefined : "Click to edit"}
            >
              {goal.name}
            </h1>
          )}
          {!isViewer && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" className="icon-button" aria-label="More goal actions">
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="shell-menu" align="end" sideOffset={6}>
                  <DropdownMenu.Item
                    className="shell-menu-item"
                    onSelect={() => void navigator.clipboard?.writeText(window.location.href)}
                  >
                    <Link2 size={15} aria-hidden="true" />
                    Copy link
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="shell-menu-item"
                    onSelect={() => setIsDeleting(true)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Delete goal
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
        <div className="gf-goal-meta">
          <GoalStatusLozenge status={goal.status} />
          <span className={overdue ? "gf-overdue" : "pa-muted"}>
            {overdue && <AlertTriangle size={12} aria-label="Overdue" />}
            {goal.targetDate ? `Due ${formatGoalDate(goal.targetDate)}` : "No target date"}
          </span>
          <GoalProgressBar progress={goal.progress} />
        </div>
      </header>

      {actionError && (
        <p className="form-submit-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="gf-goal-layout">
        <main className="gf-goal-main">
          <section className="panel gf-section" aria-labelledby="goal-about">
            <div className="gf-section-head">
              <h2 id="goal-about">About</h2>
              {!isViewer && !isEditingAbout && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setAboutDraft(goal.description);
                    setIsEditingAbout(true);
                  }}
                >
                  Edit
                </button>
              )}
            </div>
            {isEditingAbout ? (
              <div className="gf-about-editor">
                <div className="gf-editor">
                  <RichTextEditor
                    value={aboutDraft}
                    onChange={setAboutDraft}
                    members={members}
                    placeholder="What does success look like, and why does it matter?"
                    autoFocus
                  />
                </div>
                <div className="pa-dialog-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsEditingAbout(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className="primary-button" onClick={() => void saveAbout()}>
                    Save
                  </button>
                </div>
              </div>
            ) : goal.description ? (
              <DescriptionView value={goal.description} />
            ) : (
              <p className="pa-muted">
                {isViewer ? "No description." : "Add a description so everyone knows what this goal is about."}
              </p>
            )}
          </section>

          <section className="panel gf-section" aria-labelledby="goal-updates">
            <div className="gf-section-head">
              <h2 id="goal-updates">Status updates</h2>
            </div>
            {!isViewer && (
              <form className="gf-update-composer" onSubmit={postUpdate} noValidate>
                <div className="gf-status-picker" role="radiogroup" aria-label="Goal status">
                  {GOAL_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={updateStatus === status}
                      className={
                        updateStatus === status
                          ? `gf-status-choice selected gf-goal-status-${status.toLowerCase()}`
                          : "gf-status-choice"
                      }
                      onClick={() => setUpdateStatus(status)}
                    >
                      {GOAL_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
                <label className="form-field">
                  <span className="sr-only">Update</span>
                  <textarea
                    rows={3}
                    maxLength={5000}
                    value={updateBody}
                    placeholder="What's changed since the last update? What's next?"
                    onChange={(event) => setUpdateBody(event.target.value)}
                    aria-invalid={Boolean(updateError)}
                  />
                </label>
                {updateError && (
                  <p className="form-submit-error" role="alert">
                    {updateError}
                  </p>
                )}
                <div className="gf-composer-actions">
                  <button type="submit" className="primary-button" disabled={isPosting}>
                    {isPosting ? "Posting..." : "Post update"}
                  </button>
                </div>
              </form>
            )}
            {goal.updates.length === 0 ? (
              <p className="pa-muted">No updates yet. Post one to share how the goal is tracking.</p>
            ) : (
              <ol className="gf-update-feed">
                {goal.updates.map((update) => (
                  <li key={update.id} className="gf-update">
                    <div className="gf-update-head">
                      <PersonAvatar name={update.author?.name ?? "Former member"} />
                      <strong>{update.author?.name ?? "Former member"}</strong>
                      <GoalStatusLozenge status={update.status} />
                      <time className="pa-muted" dateTime={update.createdAt}>
                        {TIMESTAMP.format(new Date(update.createdAt))}
                      </time>
                    </div>
                    <p className="gf-update-body">{update.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel gf-section" aria-labelledby="goal-subgoals">
            <div className="gf-section-head">
              <h2 id="goal-subgoals">Sub-goals</h2>
              {!isViewer && (
                <button
                  type="button"
                  className="secondary-button gf-small-button"
                  onClick={() => setIsCreatingSubGoal(true)}
                  disabled={!directory}
                >
                  <Plus size={14} aria-hidden="true" />
                  Create sub-goal
                </button>
              )}
            </div>
            {goal.children.length === 0 ? (
              <p className="pa-muted">Break this goal into smaller, measurable sub-goals.</p>
            ) : (
              <ul className="gf-row-list">
                {goal.children.map((child) => (
                  <li key={child.id} className="gf-row">
                    <Link href={`/goals/${child.id}`} className="gf-row-title">
                      <GoalIcon />
                      <span>{child.name}</span>
                    </Link>
                    <span className="gf-row-meta">
                      <GoalProgressBar progress={child.progress} />
                      <GoalStatusLozenge status={child.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel gf-section" aria-labelledby="goal-work">
            <div className="gf-section-head">
              <h2 id="goal-work">Linked work items</h2>
              {!isViewer && (
                <Popover.Root open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                  <Popover.Trigger asChild>
                    <button type="button" className="secondary-button gf-small-button">
                      <Link2 size={14} aria-hidden="true" />
                      Link work item
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="issue-popover"
                      align="end"
                      sideOffset={6}
                      collisionPadding={12}
                    >
                      <IssuePickerList
                        candidates={pickerCandidates}
                        onSelect={(issue) => void linkIssue(issue)}
                        placeholder="Search epics and work items"
                      />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
            </div>
            {goal.issues.length === 0 ? (
              <p className="pa-muted">
                Link epics and work items that contribute to this goal. Progress is the share of
                linked items that are done.
              </p>
            ) : (
              <ul className="gf-row-list">
                {goal.issues.map((issue) => (
                  <li key={issue.id} className="gf-row">
                    <Link
                      href={selectedIssueHref(pathname, searchParams, issue.id)}
                      scroll={false}
                      className="gf-row-title"
                    >
                      <KindIcon kind={issue.kind as IssueKind} />
                      <span className="pa-key">{issue.id}</span>
                      <span className={issue.statusCategory === "DONE" ? "gf-done-title" : undefined}>
                        {issue.title}
                      </span>
                    </Link>
                    <span className="gf-row-meta">
                      {issue.assigneeName && (
                        <span title={issue.assigneeName}>
                          <PersonAvatar name={issue.assigneeName} />
                        </span>
                      )}
                      <span
                        className={`planning-status-lozenge ${
                          issue.statusCategory === "DONE"
                            ? "done"
                            : issue.statusCategory === "IN_PROGRESS"
                              ? "progress"
                              : "todo"
                        }`}
                      >
                        {issue.statusName}
                      </span>
                      {!isViewer && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Unlink ${issue.id}`}
                          title="Unlink"
                          onClick={() => void unlinkIssue(issue.id)}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="panel gf-goal-side" aria-label="Goal details">
          <h2>Details</h2>
          <dl className="gf-details">
            <dt>Status</dt>
            <dd>
              <GoalStatusLozenge status={goal.status} />
              <small className="pa-muted gf-hint">Set by the latest status update</small>
            </dd>
            <dt>Owner</dt>
            <dd>
              {isViewer ? (
                goal.owner ? (
                  <span className="pa-lead">
                    <PersonAvatar name={goal.owner.name} />
                    {goal.owner.name}
                  </span>
                ) : (
                  <span className="pa-muted">No owner</span>
                )
              ) : (
                <select
                  className="gf-side-input"
                  aria-label="Owner"
                  value={goal.owner?.userId ?? ""}
                  onChange={(event) => void patchGoal({ ownerId: event.target.value || null })}
                >
                  <option value="">No owner</option>
                  {(directory?.people ?? (goal.owner ? [goal.owner] : [])).map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.name}
                    </option>
                  ))}
                </select>
              )}
            </dd>
            <dt>Target date</dt>
            <dd>
              {isViewer ? (
                formatGoalDate(goal.targetDate) ?? <span className="pa-muted">None</span>
              ) : (
                <input
                  className="gf-side-input"
                  type="date"
                  aria-label="Target date"
                  value={goal.targetDate ?? ""}
                  onChange={(event) => void patchGoal({ targetDate: event.target.value || null })}
                />
              )}
            </dd>
            <dt>Parent goal</dt>
            <dd>
              {isViewer ? (
                goal.parent ? (
                  <Link className="pa-link" href={`/goals/${goal.parent.id}`}>
                    {goal.parent.name}
                  </Link>
                ) : (
                  <span className="pa-muted">None</span>
                )
              ) : (
                <select
                  className="gf-side-input"
                  aria-label="Parent goal"
                  value={goal.parent?.id ?? ""}
                  onChange={(event) => void patchGoal({ parentId: event.target.value || null })}
                >
                  <option value="">None</option>
                  {goal.parent && !parentOptions.some((option) => option.id === goal.parent?.id) && (
                    <option value={goal.parent.id}>{goal.parent.name}</option>
                  )}
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </dd>
            <dt>Progress</dt>
            <dd>
              <GoalProgressBar progress={goal.progress} />
              <small className="pa-muted gf-hint">
                {goal.progress.done} of {goal.progress.total} work items done
              </small>
            </dd>
            <dt>Created</dt>
            <dd className="pa-muted">{TIMESTAMP.format(new Date(goal.createdAt))}</dd>
          </dl>
        </aside>
      </div>

      {directory && (
        <CreateGoalDialog
          open={isCreatingSubGoal}
          onOpenChange={setIsCreatingSubGoal}
          people={directory.people}
          goals={sortGoals(directory.goals)}
          defaultParentId={goal.id}
          defaultOwnerId={goal.owner?.userId ?? null}
          onCreated={() => {
            void loadDirectory();
            void apiRequest<GoalDetail>(base).then(setGoal).catch(() => undefined);
          }}
        />
      )}

      <AdminDialog
        open={isDeleting}
        onOpenChange={setIsDeleting}
        title={`Delete ${goal.name}?`}
        description="Linked work items are kept but no longer roll up to this goal. Sub-goals become top-level goals."
      >
        <div className="pa-dialog-actions">
          <button type="button" className="secondary-button" onClick={() => setIsDeleting(false)}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={() => void deleteGoal()}>
            Delete
          </button>
        </div>
      </AdminDialog>
    </div>
  );
}
