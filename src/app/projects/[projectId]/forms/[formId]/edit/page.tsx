"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { apiRequest, useIssues } from "../../../../../IssueProvider";
import { WorkspaceLoading } from "../../../../../components/WorkspaceLoading";
import { useWorkspaceRole } from "../../../settings/adminUi";
import { FormFieldList } from "../../../../../components/forms/FormFieldList";
import { FormRenderer } from "../../../../../components/forms/FormRenderer";
import {
  cleanFieldsForSave,
  validateFormFields,
  type FormAnswers,
  type FormBuilderResponse,
  type FormField,
  type FormWorkType,
  type IntakeForm,
} from "../../../../../components/forms/formModel";

type Draft = {
  name: string;
  description: string;
  issueType: string;
  isActive: boolean;
  fields: FormField[];
};

function toDraft(form: IntakeForm): Draft {
  return {
    name: form.name,
    description: form.description,
    issueType: form.issueType,
    isActive: form.isActive,
    fields: form.fields,
  };
}

function flattenFieldErrors(error: unknown) {
  return error instanceof Error ? error.message : "Form could not be saved";
}

export default function FormBuilderPage() {
  const params = useParams<{ projectId: string; formId: string }>();
  const { projectId, formId } = params;
  const { members } = useIssues();
  const { isViewer } = useWorkspaceRole();
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [workTypes, setWorkTypes] = useState<FormWorkType[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>("summary");
  const [previewAnswers, setPreviewAnswers] = useState<FormAnswers>({});

  const url = `/api/projects/${encodeURIComponent(projectId)}/forms/${encodeURIComponent(formId)}`;

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<FormBuilderResponse>(url, { signal: controller.signal })
      .then((payload) => {
        setForm(payload.form);
        setWorkTypes(payload.workTypes);
        setDraft(toDraft(payload.form));
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Form could not be loaded");
        }
      });
    return () => controller.abort();
  }, [url]);

  useEffect(() => {
    if (!savedAt) return;
    const timeout = window.setTimeout(() => setSavedAt(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [savedAt]);

  if (loadError) {
    return (
      <div className="page gf-page">
        <p className="form-submit-error" role="alert">
          {loadError}
        </p>
        <Link className="pa-link" href={`/projects/${projectId}/forms`}>
          Back to forms
        </Link>
      </div>
    );
  }
  if (!form || !draft) return <WorkspaceLoading label="form" />;

  const isDirty = JSON.stringify(toDraft(form)) !== JSON.stringify(draft);
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      setSaveError("Give the form a name.");
      return;
    }
    const fields = cleanFieldsForSave(draft.fields);
    const problem = validateFormFields(fields);
    if (problem) {
      setSaveError(problem);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await apiRequest<IntakeForm>(url, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description: draft.description.trim(),
          issueType: draft.issueType,
          isActive: draft.isActive,
          fields,
        }),
      });
      setForm(saved);
      setDraft(toDraft(saved));
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(flattenFieldErrors(error));
    } finally {
      setIsSaving(false);
    }
  };

  const previewFields = cleanFieldsForSave(draft.fields);

  return (
    <div className="page gf-page gf-builder-page">
      <header className="gf-builder-head">
        <Link className="gf-back-link" href={`/projects/${projectId}/forms`}>
          <ArrowLeft size={14} aria-hidden="true" />
          Forms
        </Link>
        <h1 className="jira-page-title">{isViewer ? form.name : "Edit form"}</h1>
        <div className="gf-builder-actions">
          <span className="pa-success" role="status" aria-live="polite">
            {savedAt ? "Saved" : ""}
          </span>
          <Link className="secondary-button gf-small-button" href={`/forms/${form.id}`} target="_blank">
            <ExternalLink size={14} aria-hidden="true" />
            Open form
          </Link>
          {!isViewer && (
            <>
              <button
                type="button"
                className="secondary-button gf-small-button"
                disabled={!isDirty || isSaving}
                onClick={() => {
                  setDraft(toDraft(form));
                  setSaveError(null);
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className="primary-button gf-small-button"
                disabled={!isDirty || isSaving}
                onClick={() => void save()}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </header>

      {saveError && (
        <p className="form-submit-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="gf-builder-layout">
        {!isViewer && (
          <section className="panel gf-builder-panel" aria-label="Form settings">
            <label className="form-field">
              <span>Form name</span>
              <input
                value={draft.name}
                maxLength={120}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={draft.description}
                placeholder="Tell people what this form is for"
                onChange={(event) => update({ description: event.target.value })}
              />
            </label>
            <div className="gf-form-grid">
              <label className="form-field">
                <span>Work type created</span>
                <select
                  value={draft.issueType}
                  onChange={(event) => update({ issueType: event.target.value })}
                >
                  {workTypes.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gf-toggle-row gf-toggle-inline">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => update({ isActive: event.target.checked })}
                />
                <span>Accepting responses</span>
              </label>
            </div>
            <h2 className="gf-subheading">Fields</h2>
            <p className="pa-muted">
              Summary becomes the work item title. Description and other answers are added to the
              work item description.
            </p>
            <FormFieldList
              fields={draft.fields}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={(fields) => update({ fields })}
            />
          </section>
        )}

        <section className="panel gf-preview" aria-label="Preview">
          <p className="gf-preview-tag">Preview</p>
          <h2 className="gf-preview-title">{draft.name.trim() || "Untitled form"}</h2>
          {draft.description.trim() && <p className="gf-preview-desc">{draft.description}</p>}
          <FormRenderer
            idPrefix="preview"
            fields={previewFields}
            answers={previewAnswers}
            members={members}
            onChange={(fieldId, value) =>
              setPreviewAnswers((current) => ({ ...current, [fieldId]: value }))
            }
          />
          <div className="gf-composer-actions">
            <button type="button" className="primary-button" disabled>
              Submit
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
