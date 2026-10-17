"use client";

import { Check, Copy, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { WEBHOOK_EVENT_LABELS, type WebhookEvent } from "./webhookEvents";
import { AdminHeader, AdminNotice, OwnerOnly } from "./AdminShell";
import { adminRequest, copyText, relativeTime } from "./adminClient";

type Webhook = {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus: number | null;
  lastDeliveredAt: string | null;
  createdAt: string;
};

type Draft = { id: string | null; name: string; url: string; events: WebhookEvent[]; enabled: boolean };

const EMPTY_DRAFT: Draft = { id: null, name: "", url: "", events: ["issue_created"], enabled: true };

export function WebhooksView() {
  return (
    <>
      <AdminHeader
        title="Webhooks"
        description="Send an HTTP POST to another system when issues, comments, sprints or versions change. Each request is signed with your webhook secret."
      />
      <OwnerOnly what="manage webhooks">
        <WebhookManager />
      </OwnerOnly>
    </>
  );
}

function statusTone(status: number | null) {
  if (status === null) return undefined;
  return status >= 200 && status < 300 ? "success" : "danger";
}

function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminRequest<{ webhooks: Webhook[] }>("/api/admin/webhooks");
      setWebhooks(data.webhooks);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFieldErrors({});
    setError(null);
    const body = JSON.stringify({
      name: draft.name.trim(),
      url: draft.url.trim(),
      events: draft.events,
      enabled: draft.enabled,
    });
    try {
      if (draft.id) {
        await adminRequest(`/api/admin/webhooks/${draft.id}`, { method: "PATCH", body });
      } else {
        const created = await adminRequest<{ webhook: Webhook; secret: string }>(
          "/api/admin/webhooks",
          { method: "POST", body },
        );
        setSecret({ name: created.webhook.name, value: created.secret });
        setCopied(false);
      }
      setDraft(null);
      await load();
    } catch (reason) {
      const failure = reason as Error & { fields?: Record<string, string[] | undefined> };
      setFieldErrors(failure.fields ?? {});
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await adminRequest(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      setConfirmingId(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const toggle = async (webhook: Webhook) => {
    try {
      await adminRequest(`/api/admin/webhooks/${webhook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !webhook.enabled }),
      });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const sendTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await adminRequest<{ ok: boolean; status: number; error?: string }>(
        `/api/admin/webhooks/${id}/test`,
        { method: "POST" },
      );
      setTestResults((current) => ({
        ...current,
        [id]: result.ok
          ? `Delivered (HTTP ${result.status})`
          : result.error ?? `Endpoint responded with HTTP ${result.status}`,
      }));
      await load();
    } catch (reason) {
      setTestResults((current) => ({ ...current, [id]: (reason as Error).message }));
    } finally {
      setTesting(null);
    }
  };

  const toggleEvent = (event: WebhookEvent) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            events: current.events.includes(event)
              ? current.events.filter((value) => value !== event)
              : [...current.events, event],
          }
        : current,
    );
  };

  return (
    <div className="admin-stack">
      {!draft && (
        <div>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setFieldErrors({});
            }}
          >
            <Plus size={15} aria-hidden="true" /> Create webhook
          </button>
        </div>
      )}
      {error && <AdminNotice tone="error">{error}</AdminNotice>}

      {secret && (
        <section className="admin-card admin-secret">
          <h2>Signing secret for “{secret.name}”</h2>
          <p className="admin-muted">
            Copy it now; it will not be shown again. Each delivery carries an{" "}
            <code className="admin-mono">X-AMR-Signature: sha256=…</code> header: the HMAC-SHA256 of
            the raw request body keyed with this secret.
          </p>
          <div className="admin-secret-row">
            <code className="admin-secret-value">{secret.value}</code>
            <button
              type="button"
              className="secondary-button"
              onClick={async () => setCopied(await copyText(secret.value))}
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div>
            <button type="button" className="text-button" onClick={() => setSecret(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      {draft && (
        <form className="admin-card admin-form" onSubmit={save} noValidate>
          <h2>{draft.id ? "Edit webhook" : "Create webhook"}</h2>
          <div className="admin-form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                maxLength={80}
                required
                autoFocus
              />
              {fieldErrors.name && <small className="admin-field-error">{fieldErrors.name[0]}</small>}
            </label>
            <label className="form-field">
              <span>URL</span>
              <input
                type="url"
                inputMode="url"
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                placeholder="https://example.com/hooks/amr"
                required
              />
              {fieldErrors.url && <small className="admin-field-error">{fieldErrors.url[0]}</small>}
            </label>
          </div>
          <fieldset className="admin-fieldset">
            <legend>Events</legend>
            <div className="admin-checkbox-grid">
              {(Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEvent[]).map((event) => (
                <label key={event} className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.events.includes(event)}
                    onChange={() => toggleEvent(event)}
                  />
                  <span>
                    {WEBHOOK_EVENT_LABELS[event]}
                    <code className="admin-mono admin-muted">{event}</code>
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.events && <small className="admin-field-error">{fieldErrors.events[0]}</small>}
          </fieldset>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            />
            <span>Active</span>
          </label>
          <div className="admin-form-actions">
            <button type="button" className="secondary-button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !draft.name.trim() || !draft.url.trim() || draft.events.length === 0}
            >
              {saving ? "Saving…" : draft.id ? "Save" : "Create"}
            </button>
          </div>
        </form>
      )}

      {!webhooks && !error && <p className="admin-muted">Loading webhooks…</p>}
      {webhooks && webhooks.length === 0 && !draft && (
        <div className="admin-empty">
          <h2>No webhooks yet</h2>
          <p>Create a webhook to notify chat, CI or your own services when work changes.</p>
        </div>
      )}
      {webhooks && webhooks.length > 0 && (
        <ul className="admin-card-list">
          {webhooks.map((webhook) => (
            <li key={webhook.id} className="admin-card admin-webhook">
              <div className="admin-webhook-main">
                <div className="admin-webhook-title">
                  <strong>{webhook.name}</strong>
                  <span className="admin-pill" data-tone={webhook.enabled ? "success" : undefined}>
                    {webhook.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <code className="admin-mono admin-break">{webhook.url}</code>
                <div className="admin-tags">
                  {webhook.events.map((event) => (
                    <span key={event} className="admin-tag">
                      {WEBHOOK_EVENT_LABELS[event] ?? event}
                    </span>
                  ))}
                </div>
                <p className="admin-muted">
                  Last delivery: {relativeTime(webhook.lastDeliveredAt)}
                  {webhook.lastStatus !== null && (
                    <>
                      {" · "}
                      <span className="admin-pill" data-tone={statusTone(webhook.lastStatus)}>
                        {webhook.lastStatus === 0 ? "Failed" : `HTTP ${webhook.lastStatus}`}
                      </span>
                    </>
                  )}
                </p>
                {testResults[webhook.id] && (
                  <p className="admin-muted" role="status">
                    Test: {testResults[webhook.id]}
                  </p>
                )}
              </div>
              <div className="admin-webhook-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => sendTest(webhook.id)}
                  disabled={testing === webhook.id}
                >
                  <Send size={14} aria-hidden="true" />
                  {testing === webhook.id ? "Sending…" : "Send test"}
                </button>
                <button type="button" className="secondary-button" onClick={() => toggle(webhook)}>
                  {webhook.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="admin-icon-button"
                  aria-label={`Edit ${webhook.name}`}
                  title="Edit"
                  onClick={() => {
                    setFieldErrors({});
                    setDraft({
                      id: webhook.id,
                      name: webhook.name,
                      url: webhook.url,
                      events: webhook.events,
                      enabled: webhook.enabled,
                    });
                  }}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                {confirmingId === webhook.id ? (
                  <span className="admin-confirm">
                    <button type="button" className="danger-button" onClick={() => remove(webhook.id)}>
                      Delete
                    </button>
                    <button type="button" className="text-button" onClick={() => setConfirmingId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="admin-icon-button"
                    aria-label={`Delete ${webhook.name}`}
                    title="Delete"
                    onClick={() => setConfirmingId(webhook.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
