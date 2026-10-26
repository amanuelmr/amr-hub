"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import { ChipMultiSelect } from "./issue/ChipMultiSelect";
import { useIssues } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { IssueLabelChip } from "./IssueLabelChip";
import { RichTextEditor } from "./RichTextEditor";
import {
  ISSUE_ESTIMATES,
  PRIORITY_LABELS,
  parseDuration,
  type Issue,
  type IssueComponentRef,
  type IssueEstimate,
  type IssueKind,
  type IssuePriority,
  type IssueStatus,
  type IssueVersionRef,
} from "../data/issues";
import { findPlanningCycle, formatCycleDateRange } from "../data/cycles";
import { stripHtml } from "../data/richText";
import { eligibleParents } from "./issue/issueDetailLogic";
import { fetchOptionalList } from "./issue/useIssueDetail";
import {
  isDoneStatus,
  isEpicLevel,
  isSubtaskLevel,
  mapTypeByLevel,
} from "../data/workflow";
import { useWorkflow } from "../WorkflowProvider";
import {
  applicableFields,
  isEmptyFieldValue,
  type CustomFieldValue,
} from "../data/customFields";
import { CustomFieldInput } from "./fields/CustomFieldInput";
import { useCustomFields } from "./fields/customFieldStore";
import type { CreateDraft, CreateField } from "./createFields";

type FormErrors = {
  title?: string;
  description?: string;
  projectId?: string;
  parentId?: string;
  originalEstimate?: string;
  customFields?: Record<string, string>;
};

export type CreateIssueDefaults = {
  parentId?: string | null;
  kind?: IssueKind;
  cycleId?: string | null;
};

export function CreateIssueForm({
  defaultProjectId,
  defaults,
  allowCreateAnother = false,
  initialDraft,
  onDraftChange,
  hiddenFields = [],
  onCreated,
  onCancel,
}: {
  defaultProjectId?: string | null;
  defaults?: CreateIssueDefaults;
  allowCreateAnother?: boolean;
  /** Restores what was typed before the dialog was minimized. */
  initialDraft?: CreateDraft | null;
  onDraftChange?: (draft: CreateDraft) => void;
  /** Optional fields this person chose to hide. */
  hiddenFields?: CreateField[];
  onCreated: (issue: Issue, options: { createAnother: boolean }) => void;
  onCancel: () => void;
}) {
  const show = (field: CreateField) => !hiddenFields.includes(field);
  const { data: session } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const [statusChoice, setStatus] = useState<IssueStatus>(initialDraft?.status ?? "OPEN");
  const { createIssue, issues, labels, cycles, members } = useIssues();
  const { projects: allVisible, activeProjectId: storedActiveId } = useProjects();
  // Only projects the user can create work in (Jira's "Create issues" permission).
  const projects = useMemo(
    () => allVisible.filter((project) => project.permissions?.canEdit !== false),
    [allVisible],
  );
  const activeProjectId = projects.some((project) => project.id === storedActiveId)
    ? storedActiveId
    : null;
  const defaultParent = defaults?.parentId
    ? issues.find((issue) => issue.id === defaults.parentId)
    : null;

  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [priority, setPriority] = useState<IssuePriority>(initialDraft?.priority ?? "MEDIUM");
  const [kindChoice, setKind] = useState<IssueKind>(
    initialDraft?.kind ??
    defaults?.kind ??
      (defaultParent
        ? isEpicLevel(defaultParent.kind)
          ? "STORY"
          : "SUBTASK"
        : "TASK"),
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialDraft ? initialDraft.projectId : (defaultParent?.projectId ?? defaultProjectId ?? null),
  );
  const [parentId, setParentId] = useState(initialDraft?.parentId ?? defaults?.parentId ?? "");
  const [assigneeId, setAssigneeId] = useState(initialDraft?.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ?? "");
  const [startDate, setStartDate] = useState(initialDraft?.startDate ?? "");
  const [cycleId, setCycleId] = useState<string | null>(
    initialDraft ? initialDraft.cycleId : (defaults?.cycleId ?? null),
  );
  const [estimate, setEstimate] = useState<IssueEstimate | null>(initialDraft?.estimate ?? null);
  const [originalEstimate, setOriginalEstimate] = useState(initialDraft?.originalEstimate ?? "");
  const [environment, setEnvironment] = useState(initialDraft?.environment ?? "");
  const [labelIds, setLabelIds] = useState<string[]>(initialDraft?.labelIds ?? []);
  const [fixVersionId, setFixVersionId] = useState(initialDraft?.fixVersionId ?? "");
  const [componentIds, setComponentIds] = useState<string[]>(initialDraft?.componentIds ?? []);
  const [versions, setVersions] = useState<IssueVersionRef[] | null>(null);
  const [components, setComponents] = useState<IssueComponentRef[] | null>(
    null,
  );
  const [customValues, setCustomValues] = useState<
    Record<string, CustomFieldValue | null>
  >(initialDraft?.customValues ?? {});
  const { fields: customFieldDefs } = useCustomFields();
  const [createAnother, setCreateAnother] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedProjectId =
    projectId ?? activeProjectId ?? projects[0]?.id ?? "";
  const workflow = useWorkflow(selectedProjectId);
  // Jira creates in a not-done status of the project's workflow.
  const statusOptions = workflow.statuses.filter(
    (option) => !isDoneStatus(option.key),
  );
  const status: IssueStatus = statusOptions.some(
    (option) => option.key === statusChoice,
  )
    ? statusChoice
    : ((
        statusOptions.find((option) => option.key === "OPEN") ??
        statusOptions.find((option) => option.category === "TODO") ??
        statusOptions[0]
      )?.key ?? "OPEN");
  const kind: IssueKind = mapTypeByLevel(kindChoice, workflow.types);
  const projectCycles = cycles.filter(
    (cycle) =>
      cycle.projectId === selectedProjectId && cycle.state !== "CLOSED",
  );
  const selectedCycleId =
    cycleId ?? findPlanningCycle(projectCycles)?.id ?? "";
  const customFields = applicableFields(customFieldDefs, selectedProjectId, kind);
  // Required custom fields show even when custom fields are hidden.
  const shownCustomFields = customFields.filter(
    (field) => field.required || show("custom"),
  );
  const parentOptions =
    isEpicLevel(kind)
      ? []
      : eligibleParents(
          { id: "", kind, projectId: selectedProjectId },
          issues,
        );

  // Report every change so a minimized dialog can be restored as it was.
  useEffect(() => {
    onDraftChange?.({
      title,
      description,
      status: statusChoice,
      priority,
      kind: kindChoice,
      // The resolved project, so a restored draft doesn't follow whichever
      // project is open by then.
      projectId: selectedProjectId || null,
      parentId,
      assigneeId,
      dueDate,
      startDate,
      cycleId,
      estimate,
      originalEstimate,
      environment,
      labelIds,
      fixVersionId,
      componentIds,
      customValues,
    });
  }, [
    onDraftChange,
    title,
    description,
    statusChoice,
    priority,
    kindChoice,
    selectedProjectId,
    parentId,
    assigneeId,
    dueDate,
    startDate,
    cycleId,
    estimate,
    originalEstimate,
    environment,
    labelIds,
    fixVersionId,
    componentIds,
    customValues,
  ]);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    const base = `/api/projects/${encodeURIComponent(selectedProjectId)}`;
    void fetchOptionalList<IssueVersionRef>(`${base}/versions`).then(
      (loaded) => !cancelled && setVersions(loaded),
    );
    void fetchOptionalList<IssueComponentRef>(`${base}/components`).then(
      (loaded) => !cancelled && setComponents(loaded),
    );
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const nextErrors: FormErrors = {};
    if (title.trim().length < 4) {
      nextErrors.title = "Use at least 4 characters for a clear summary.";
    }
    const descriptionLength = stripHtml(description).length;
    if (descriptionLength > 0 && descriptionLength < 12) {
      nextErrors.description =
        "Add enough detail for someone else to understand the issue, or leave it empty.";
    }
    if (!selectedProjectId) {
      nextErrors.projectId = "Choose which project this belongs to.";
    }
    const validParentId = parentOptions.some((issue) => issue.id === parentId)
      ? parentId
      : "";
    if (isSubtaskLevel(kind) && !validParentId) {
      nextErrors.parentId = "Subtasks need a parent story, task, or bug.";
    }
    const originalMinutes = originalEstimate.trim()
      ? parseDuration(originalEstimate)
      : null;
    if (originalEstimate.trim() && originalMinutes === null) {
      nextErrors.originalEstimate = 'Use a duration like "2d 4h".';
    }
    const customErrors: Record<string, string> = {};
    for (const field of customFields) {
      if (field.required && isEmptyFieldValue(customValues[field.id])) {
        customErrors[field.id] = `${field.name} is required.`;
      }
    }
    if (Object.keys(customErrors).length > 0) nextErrors.customFields = customErrors;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const issue = await createIssue({
        title: title.trim(),
        description: descriptionLength === 0 ? "" : description,
        status,
        priority,
        kind,
        projectId: selectedProjectId,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
        cycleId: selectedCycleId || null,
        estimate,
        labelIds,
        parentId: validParentId || null,
        fixVersionId: versions && fixVersionId ? fixVersionId : null,
        componentIds: components ? componentIds : [],
        startDate: startDate || null,
        originalEstimateMinutes: originalMinutes,
        environment: kind === "BUG" && environment.trim() ? environment.trim() : null,
        customFields: Object.fromEntries(
          customFields
            .filter((field) => !isEmptyFieldValue(customValues[field.id]))
            .map((field) => [field.id, customValues[field.id] ?? null]),
        ),
      });
      const keepOpen = allowCreateAnother && createAnother;
      if (keepOpen) {
        setTitle("");
        setDescription("");
        setIsSubmitting(false);
      }
      onCreated(issue, { createAnother: keepOpen });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Issue could not be created",
      );
      setIsSubmitting(false);
    }
  };

  const required = (
    <span className="create-issue-required" aria-hidden="true">
      *
    </span>
  );
  const error = (message: string | undefined, id?: string) =>
    message ? (
      <small className="field-error" id={id}>
        <CircleAlert size={14} aria-hidden="true" />
        {message}
      </small>
    ) : null;

  return (
    <form className="create-issue-form" onSubmit={handleSubmit} noValidate>
      <div className="create-issue-body">
        <p className="create-issue-hint">
          Required fields are marked with an asterisk {required}
        </p>

        <label className="form-field">
          <span>Project {required}</span>
          <select
            value={selectedProjectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setCycleId(null);
              setParentId("");
              setFixVersionId("");
              setComponentIds([]);
              setErrors((current) => ({ ...current, projectId: undefined }));
            }}
            aria-invalid={Boolean(errors.projectId)}
            required
          >
            <option value="">Choose a project</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {error(errors.projectId)}
        </label>

        <label className="form-field">
          <span>Issue type {required}</span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as IssueKind);
              setErrors((current) => ({ ...current, parentId: undefined }));
            }}
            required
          >
            {workflow.types.map((type) => (
              <option value={type.key} key={type.key}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <hr className="create-issue-divider" />

        {show("status") && (
          <label className="form-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as IssueStatus)}
            >
              {statusOptions.map((option) => (
                <option value={option.key} key={option.key}>
                  {option.name}
                </option>
              ))}
            </select>
            <small className="field-meta">
              This is the initial status upon creation
            </small>
          </label>
        )}

        <label className="form-field">
          <span>Summary {required}</span>
          <input
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            maxLength={255}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "title-error" : undefined}
            required
            autoFocus
          />
          {error(errors.title, "title-error")}
        </label>

        {show("description") && (
          <div className="form-field">
            <span>Description</span>
            <RichTextEditor
              value={description}
              onChange={(html) => {
                setDescription(html);
                setErrors((current) => ({ ...current, description: undefined }));
              }}
              members={members}
              placeholder="Type @ to mention someone."
            />
            {error(errors.description, "description-error")}
          </div>
        )}

        {show("assignee") && (
          <>
            <label className="form-field">
              <span>Assignee</span>
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option value={member.id} key={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            {activeMember?.id && assigneeId !== activeMember.id && (
              <button
                className="text-button create-issue-assign-me"
                type="button"
                onClick={() => setAssigneeId(activeMember.id)}
              >
                Assign to me
              </button>
            )}
          </>
        )}

        {show("labels") && (
          <div className="form-field">
            <span>Labels</span>
            <ChipMultiSelect
              label="Labels"
              options={labels}
              selectedIds={labelIds}
              emptyText="Select labels"
              renderChip={(label) => <IssueLabelChip label={label} compact />}
              onChange={setLabelIds}
            />
          </div>
        )}

        {!isEpicLevel(kind) && (show("parent") || isSubtaskLevel(kind)) && (
          <label className="form-field">
            <span>Parent {isSubtaskLevel(kind) && required}</span>
            <select
              value={parentId}
              onChange={(event) => {
                setParentId(event.target.value);
                setErrors((current) => ({ ...current, parentId: undefined }));
              }}
              aria-invalid={Boolean(errors.parentId)}
            >
              <option value="">
                {isSubtaskLevel(kind) ? "Choose a parent" : "None"}
              </option>
              {parentOptions.map((issue) => (
                <option value={issue.id} key={issue.id}>
                  {issue.id} {issue.title}
                </option>
              ))}
            </select>
            {error(errors.parentId)}
          </label>
        )}

        {show("sprint") && (
          <label className="form-field">
            <span>Sprint</span>
            <select
              value={selectedCycleId}
              onChange={(event) => setCycleId(event.target.value)}
              disabled={!selectedProjectId}
            >
              <option value="">None</option>
              {projectCycles.map((cycle) => (
                <option value={cycle.id} key={cycle.id}>
                  {cycle.name} - {formatCycleDateRange(cycle)}
                </option>
              ))}
            </select>
          </label>
        )}

        {show("estimate") && (
          <label className="form-field">
            <span>Story point estimate</span>
            <select
              value={estimate ?? ""}
              onChange={(event) =>
                setEstimate(
                  event.target.value === ""
                    ? null
                    : (Number(event.target.value) as IssueEstimate),
                )
              }
            >
              <option value="">None</option>
              {ISSUE_ESTIMATES.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}

        {shownCustomFields.map((field) => {
          const fieldError = errors.customFields?.[field.id];
          return (
            <div className="form-field cf-form-field" key={field.id}>
              <span>
                {field.name} {field.required && required}
              </span>
              <CustomFieldInput
                field={field}
                value={customValues[field.id]}
                members={members}
                invalid={Boolean(fieldError)}
                onChange={(value) => {
                  setCustomValues((current) => ({ ...current, [field.id]: value }));
                  setErrors((current) =>
                    current.customFields?.[field.id]
                      ? {
                          ...current,
                          customFields: { ...current.customFields, [field.id]: "" },
                        }
                      : current,
                  );
                }}
              />
              {field.description && (
                <small className="field-meta">{field.description}</small>
              )}
              {error(fieldError || undefined)}
            </div>
          );
        })}

        {show("priority") && (
          <label className="form-field">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as IssuePriority)}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        {versions && show("fixVersion") && (
          <label className="form-field">
            <span>Fix versions</span>
            <select
              value={fixVersionId}
              onChange={(event) => setFixVersionId(event.target.value)}
            >
              <option value="">None</option>
              {versions
                .filter((version) => version.status !== "ARCHIVED")
                .map((version) => (
                  <option value={version.id} key={version.id}>
                    {version.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {components && show("components") && (
          <div className="form-field">
            <span>Components</span>
            <ChipMultiSelect
              label="Components"
              options={components}
              selectedIds={componentIds}
              emptyText="Select components"
              onChange={setComponentIds}
            />
          </div>
        )}

        {show("dates") && (
          <div className="create-issue-row">
            <label className="form-field">
              <span>Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
          </div>
        )}

        {show("originalEstimate") && (
          <label className="form-field">
            <span>Original estimate</span>
            <input
              value={originalEstimate}
              onChange={(event) => {
                setOriginalEstimate(event.target.value);
                setErrors((current) => ({
                  ...current,
                  originalEstimate: undefined,
                }));
              }}
              placeholder="e.g. 2w 4d 6h 45m"
              aria-invalid={Boolean(errors.originalEstimate)}
            />
            {error(errors.originalEstimate)}
          </label>
        )}

        {show("reporter") && (
          <div className="form-field">
            <span>Reporter</span>
            <p className="create-issue-reporter">
              <span className="avatar avatar-small">
                {initialsOf(session?.user.name ?? "?")}
              </span>
              {session?.user.name ?? "You"}
            </p>
          </div>
        )}

        {kind === "BUG" && show("environment") && (
          <label className="form-field">
            <span>Environment</span>
            <textarea
              value={environment}
              maxLength={2000}
              rows={2}
              onChange={(event) => setEnvironment(event.target.value)}
              placeholder="Browser, OS, build..."
            />
          </label>
        )}
      </div>

      <div className="create-issue-footer">
        {submitError && (
          <p className="form-submit-error" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            {submitError}
          </p>
        )}
        <div className="create-issue-footer-row">
          {allowCreateAnother ? (
            <label className="issue-checkbox">
              <input
                type="checkbox"
                checked={createAnother}
                onChange={(event) => setCreateAnother(event.target.checked)}
              />
              Create another
            </label>
          ) : (
            <span />
          )}
          <div className="create-issue-footer-actions">
            <button className="text-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
