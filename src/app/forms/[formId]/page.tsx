"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { WorkspaceLoading } from "../../components/WorkspaceLoading";
import { FormRenderer } from "../../components/forms/FormRenderer";
import {
  isAnswerEmpty,
  type FormAnswers,
  type FormFillResponse,
  type FormSubmitResponse,
} from "../../components/forms/formModel";

export default function FillFormPage() {
  const params = useParams<{ formId: string }>();
  const formId = params.formId;
  const { members, refreshIssues } = useIssues();
  const [data, setData] = useState<FormFillResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<FormSubmitResponse["issue"] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<FormFillResponse>(`/api/forms/${encodeURIComponent(formId)}`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Form could not be loaded");
        }
      });
    return () => controller.abort();
  }, [formId]);

  if (loadError) {
    return (
      <div className="page gf-page gf-fill-page">
        <div className="empty-state gf-empty">
          <ClipboardList size={24} aria-hidden="true" />
          <h1>{loadError === "Form not found" ? "This form doesn't exist" : "Form unavailable"}</h1>
          <p>
            {loadError === "Form not found"
              ? "It may have been deleted, or it belongs to a different workspace."
              : loadError}
          </p>
        </div>
      </div>
    );
  }
  if (!data) return <WorkspaceLoading label="form" />;

  const { form, project } = data;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const localErrors: Record<string, string> = {};
    for (const field of form.fields) {
      if (field.required && isAnswerEmpty(answers[field.id])) {
        localErrors[field.id] = "This field is required";
      }
    }
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) {
      setSubmitError("Fill in the required fields.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch(`/api/forms/${encodeURIComponent(form.id)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.fields && typeof payload.fields === "object" && !Array.isArray(payload.fields)) {
          setErrors(payload.fields as Record<string, string>);
        }
        setSubmitError(payload.error ?? "Form could not be submitted");
        return;
      }
      setCreated((payload as FormSubmitResponse).issue);
      setAnswers({});
      setErrors({});
      void refreshIssues();
    } catch {
      setSubmitError("Form could not be submitted. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page gf-page gf-fill-page">
      <div className="panel gf-fill-card">
        <p className="gf-preview-tag">
          {project.name} · {form.issueTypeName}
        </p>
        <h1 className="gf-preview-title">{form.name}</h1>
        {form.description && <p className="gf-preview-desc">{form.description}</p>}

        {created ? (
          <div className="gf-confirmation" role="status">
            <CheckCircle2 size={28} aria-hidden="true" />
            <h2>Thanks — your request was submitted</h2>
            <p>
              We created{" "}
              <Link className="pa-link" href={`/issues/${encodeURIComponent(created.id)}`}>
                {created.id}
              </Link>{" "}
              · {created.title}
            </p>
            <div className="gf-composer-actions">
              <button type="button" className="secondary-button" onClick={() => setCreated(null)}>
                Submit another response
              </button>
              <Link className="primary-button" href={`/issues/${encodeURIComponent(created.id)}`}>
                View work item
              </Link>
            </div>
          </div>
        ) : !form.isActive ? (
          <div className="gf-confirmation gf-closed" role="status">
            <h2>This form isn&apos;t accepting responses</h2>
            <p>Ask a {project.name} project member to turn it back on.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <FormRenderer
              idPrefix="fill"
              fields={form.fields}
              answers={answers}
              errors={errors}
              members={members}
              disabled={isSubmitting}
              onChange={(fieldId, value) => {
                setAnswers((current) => ({ ...current, [fieldId]: value }));
                if (errors[fieldId]) {
                  setErrors((current) => {
                    const next = { ...current };
                    delete next[fieldId];
                    return next;
                  });
                }
              }}
            />
            {submitError && (
              <p className="form-submit-error" role="alert">
                {submitError}
              </p>
            )}
            <div className="gf-composer-actions">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
