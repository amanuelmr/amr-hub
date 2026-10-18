"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ClipboardList, Link2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import {
  AdminDialog,
  errorMessage,
  useProjectResource,
  useProjectPermissions, useWorkspaceRole,
} from "../settings/adminUi";
import type { IntakeForm } from "../../../components/forms/formModel";

export default function ProjectFormsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { isViewer: isWorkspaceViewer } = useWorkspaceRole();
  const projectPermissions = useProjectPermissions(projectId);
  const isViewer = isWorkspaceViewer || !projectPermissions.canAdmin;
  const { items: forms, setItems, isLoading, error } = useProjectResource<IntakeForm>(
    projectId,
    "forms",
  );
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<IntakeForm | null>(null);

  const base = `/api/projects/${encodeURIComponent(projectId)}/forms`;
  const visible = forms.filter((form) =>
    form.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!copiedId) return;
    const timeout = window.setTimeout(() => setCopiedId(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedId]);

  const createForm = async () => {
    setIsCreating(true);
    setActionError(null);
    try {
      const form = await apiRequest<IntakeForm>(base, {
        method: "POST",
        body: JSON.stringify({ name: "Untitled form" }),
      });
      router.push(`/projects/${projectId}/forms/${form.id}/edit`);
    } catch (createError) {
      setActionError(errorMessage(createError, "Form could not be created"));
      setIsCreating(false);
    }
  };

  const toggleActive = async (form: IntakeForm) => {
    setActionError(null);
    setItems((current) =>
      current.map((entry) => (entry.id === form.id ? { ...entry, isActive: !form.isActive } : entry)),
    );
    try {
      const saved = await apiRequest<IntakeForm>(`${base}/${form.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !form.isActive }),
      });
      setItems((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
    } catch (toggleError) {
      setItems((current) => current.map((entry) => (entry.id === form.id ? form : entry)));
      setActionError(errorMessage(toggleError, "Form could not be updated"));
    }
  };

  const copyShareLink = async (form: IntakeForm) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/forms/${form.id}`);
      setCopiedId(form.id);
    } catch {
      setActionError("Couldn't copy the link. Open the form and copy it from the address bar.");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiRequest(`${base}/${deleting.id}`, { method: "DELETE" });
      setItems((current) => current.filter((entry) => entry.id !== deleting.id));
      setDeleting(null);
    } catch (deleteError) {
      setActionError(errorMessage(deleteError, "Form could not be deleted"));
      setDeleting(null);
    }
  };

  return (
    <div className="page gf-page">
      <h1 className="sr-only">Forms</h1>
      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search forms</span>
          <input
            type="search"
            placeholder="Search forms"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="jira-toolbar-spacer" />
        {!isViewer && (
          <button
            className="primary-button pa-toolbar-primary"
            type="button"
            onClick={() => void createForm()}
            disabled={isCreating}
          >
            <Plus size={16} aria-hidden="true" />
            {isCreating ? "Creating..." : "Create form"}
          </button>
        )}
      </div>

      {(error || actionError) && (
        <p className="form-submit-error" role="alert">
          {error ?? actionError}
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {copiedId ? "Form link copied" : ""}
      </p>

      {isLoading ? (
        <WorkspaceLoading label="forms" />
      ) : visible.length === 0 ? (
        <div className="empty-state gf-empty">
          <ClipboardList size={24} aria-hidden="true" />
          <h2>{forms.length === 0 ? "Collect requests with forms" : "No matches"}</h2>
          <p>
            Forms let anyone in your workspace submit requests that become work items in this
            project — no need to know your fields or workflow.
          </p>
          {forms.length === 0 && !isViewer && (
            <button type="button" className="primary-button" onClick={() => void createForm()}>
              Create form
            </button>
          )}
        </div>
      ) : (
        <div className="jira-table-wrap">
          <table className="jira-table gf-table">
            <thead>
              <tr>
                <th scope="col">Form</th>
                <th scope="col">Work type</th>
                <th scope="col">Submissions</th>
                <th scope="col">Active</th>
                <th scope="col">Share</th>
                {!isViewer && <th scope="col" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((form) => (
                <tr key={form.id}>
                  <td>
                    <Link
                      className="jira-table-name"
                      href={
                        isViewer
                          ? `/forms/${form.id}`
                          : `/projects/${projectId}/forms/${form.id}/edit`
                      }
                    >
                      <ClipboardList size={14} aria-hidden="true" />
                      {form.name}
                    </Link>
                    {form.description && <small className="gf-goal-parent">{form.description}</small>}
                  </td>
                  <td className="jira-table-meta">{form.issueTypeName}</td>
                  <td className="jira-table-meta">{form.submissions}</td>
                  <td>
                    <label className="gf-switch">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={form.isActive}
                        disabled={isViewer}
                        aria-label={`${form.name} is accepting responses`}
                        onChange={() => void toggleActive(form)}
                      />
                      <span className="gf-switch-track" aria-hidden="true" />
                      <span className="gf-switch-text">{form.isActive ? "On" : "Off"}</span>
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button gf-small-button"
                      onClick={() => void copyShareLink(form)}
                    >
                      {copiedId === form.id ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Link2 size={14} aria-hidden="true" />
                      )}
                      {copiedId === form.id ? "Copied" : "Copy link"}
                    </button>
                  </td>
                  {!isViewer && (
                    <td className="pa-actions-cell">
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`More actions for ${form.name}`}
                          >
                            <MoreHorizontal size={15} aria-hidden="true" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="shell-menu" align="end" sideOffset={6}>
                            <DropdownMenu.Item
                              className="shell-menu-item"
                              onSelect={() =>
                                router.push(`/projects/${projectId}/forms/${form.id}/edit`)
                              }
                            >
                              <Pencil size={15} aria-hidden="true" />
                              Edit
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="shell-menu-item"
                              onSelect={() => router.push(`/forms/${form.id}`)}
                            >
                              <ClipboardList size={15} aria-hidden="true" />
                              Open form
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="shell-menu-item"
                              onSelect={() => setDeleting(form)}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                              Delete
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : ""}
        description="People can no longer submit this form. Work items it already created are kept."
      >
        <div className="pa-dialog-actions">
          <button type="button" className="secondary-button" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button type="button" className="danger-button" onClick={() => void confirmDelete()}>
            Delete
          </button>
        </div>
      </AdminDialog>
    </div>
  );
}
