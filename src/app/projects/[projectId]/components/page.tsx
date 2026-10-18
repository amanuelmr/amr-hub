"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pencil, Plus, Puzzle, Search, Trash2 } from "lucide-react";
import { apiRequest, useIssues } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import {
  AdminDialog,
  errorMessage,
  PersonAvatar,
  useProjectPeople,
  useProjectResource,
  useProjectPermissions, useWorkspaceRole,
  type ProjectPerson,
} from "../settings/adminUi";

type ProjectComponent = {
  id: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  issueCount: number;
};

type DialogState =
  | { type: "create" }
  | { type: "edit"; component: ProjectComponent }
  | { type: "delete"; component: ProjectComponent }
  | null;

function ComponentForm({
  component,
  people,
  onSubmit,
  onCancel,
}: {
  component?: ProjectComponent;
  people: ProjectPerson[];
  onSubmit: (values: {
    name: string;
    description: string | null;
    leadUserId: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(component?.name ?? "");
  const [description, setDescription] = useState(component?.description ?? "");
  const [leadUserId, setLeadUserId] = useState(component?.leadUserId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the component a name.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        leadUserId: leadUserId || null,
      });
    } catch (submitError) {
      setError(errorMessage(submitError, "Component could not be saved"));
      setIsSaving(false);
    }
  };

  return (
    <form className="pa-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="e.g. Payments API"
          autoFocus
        />
      </label>
      <label className="form-field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={500}
        />
      </label>
      <label className="form-field">
        <span>Component lead</span>
        <select
          value={leadUserId}
          onChange={(event) => setLeadUserId(event.target.value)}
        >
          <option value="">No lead</option>
          {people.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <div className="pa-dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : component ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}

function DeleteComponentBody({
  component,
  components,
  onConfirm,
  onCancel,
}: {
  component: ProjectComponent;
  components: ProjectComponent[];
  onConfirm: (moveTo: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const targets = components.filter(
    (candidate) => candidate.id !== component.id,
  );
  const [moveTo, setMoveTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const confirm = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onConfirm(moveTo || null);
    } catch (confirmError) {
      setError(errorMessage(confirmError, "Component could not be deleted"));
      setIsSaving(false);
    }
  };

  return (
    <div className="pa-form">
      {component.issueCount > 0 ? (
        <label className="form-field">
          <span>
            {component.issueCount} issue{component.issueCount === 1 ? "" : "s"}{" "}
            use this component
          </span>
          <select
            value={moveTo}
            onChange={(event) => setMoveTo(event.target.value)}
          >
            <option value="">Remove the component from these issues</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                Move them to {target.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="pa-muted">No issues use this component.</p>
      )}
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      <div className="pa-dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="danger-button"
          type="button"
          disabled={isSaving}
          onClick={confirm}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function ProjectComponentsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { isViewer: isWorkspaceViewer } = useWorkspaceRole();
  const projectPermissions = useProjectPermissions(projectId);
  const isViewer = isWorkspaceViewer || !projectPermissions.canAdmin;
  const { refreshIssues } = useIssues();
  const { allProjects: projects } = useProjects();
  const projectKey = projects.find((project) => project.id === projectId)?.key;
  const people = useProjectPeople(projectId);
  const {
    items: components,
    setItems,
    isLoading,
    error,
    reload,
  } = useProjectResource<ProjectComponent>(projectId, "components");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");

  const base = `/api/projects/${encodeURIComponent(projectId)}/components`;
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.userId, person])),
    [people],
  );
  const visible = components.filter((component) =>
    component.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const closeDialog = () => setDialog(null);

  return (
    <div className="page components-page">
      <h1 className="sr-only">Components</h1>
      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search components</span>
          <input
            type="search"
            placeholder="Search components"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="jira-toolbar-spacer" />
        {!isViewer && (
          <button
            className="primary-button pa-toolbar-primary"
            type="button"
            onClick={() => setDialog({ type: "create" })}
          >
            <Plus size={16} aria-hidden="true" />
            Create component
          </button>
        )}
      </div>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <WorkspaceLoading label="components" />
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <Puzzle size={24} aria-hidden="true" />
          <h2>
            {components.length === 0 ? "No components yet" : "No matches"}
          </h2>
          <p>Components group issues by area, like “API” or “Mobile app”.</p>
        </div>
      ) : (
        <div className="pa-table-wrap panel">
          <table className="pa-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Description</th>
                <th>Lead</th>
                <th>Issues</th>
                {!isViewer && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((component) => {
                const lead = component.leadUserId
                  ? peopleById.get(component.leadUserId)
                  : null;
                return (
                  <tr key={component.id}>
                    <td className="pa-strong">{component.name}</td>
                    <td className="pa-description-cell">
                      {component.description ?? ""}
                    </td>
                    <td>
                      {lead ? (
                        <span className="pa-lead">
                          <PersonAvatar name={lead.name} />
                          {lead.name}
                        </span>
                      ) : (
                        <span className="pa-muted">Unassigned</span>
                      )}
                    </td>
                    <td>
                      {projectKey && component.issueCount > 0 ? (
                        <Link
                          className="pa-link"
                          href={`/issues?jql=${encodeURIComponent(
                            `project = ${projectKey} AND component = "${component.name.replace(/"/g, '\\"')}"`,
                          )}`}
                        >
                          {component.issueCount}
                        </Link>
                      ) : (
                        component.issueCount
                      )}
                    </td>
                    {!isViewer && (
                      <td className="pa-actions-cell">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Edit ${component.name}`}
                          onClick={() => setDialog({ type: "edit", component })}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Delete ${component.name}`}
                          onClick={() =>
                            setDialog({ type: "delete", component })
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminDialog
        open={dialog?.type === "create" || dialog?.type === "edit"}
        onOpenChange={(open) => !open && closeDialog()}
        title={dialog?.type === "edit" ? "Edit component" : "Create component"}
      >
        {(dialog?.type === "create" || dialog?.type === "edit") && (
          <ComponentForm
            key={dialog.type === "edit" ? dialog.component.id : "new"}
            component={dialog.type === "edit" ? dialog.component : undefined}
            people={people}
            onCancel={closeDialog}
            onSubmit={async (values) => {
              const saved = await apiRequest<ProjectComponent>(
                dialog.type === "edit"
                  ? `${base}/${dialog.component.id}`
                  : base,
                {
                  method: dialog.type === "edit" ? "PATCH" : "POST",
                  body: JSON.stringify(values),
                },
              );
              setItems((current) =>
                current.some((existing) => existing.id === saved.id)
                  ? current.map((existing) =>
                      existing.id === saved.id ? saved : existing,
                    )
                  : [...current, saved].sort((left, right) =>
                      left.name.localeCompare(right.name),
                    ),
              );
              closeDialog();
            }}
          />
        )}
      </AdminDialog>

      <AdminDialog
        open={dialog?.type === "delete"}
        onOpenChange={(open) => !open && closeDialog()}
        title={
          dialog?.type === "delete" ? `Delete ${dialog.component.name}` : ""
        }
      >
        {dialog?.type === "delete" && (
          <DeleteComponentBody
            component={dialog.component}
            components={components}
            onCancel={closeDialog}
            onConfirm={async (moveTo) => {
              await apiRequest(
                `${base}/${dialog.component.id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ""}`,
                { method: "DELETE" },
              );
              closeDialog();
              await Promise.all([reload(), refreshIssues()]);
            }}
          />
        )}
      </AdminDialog>
    </div>
  );
}
