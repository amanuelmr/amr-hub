"use client";

import Link from "next/link";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminHeader, AdminNotice } from "./AdminShell";
import {
  adminRequest,
  copyText,
  formatDate,
  relativeTime,
  useAdminRole,
} from "./adminClient";

type Token = {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  expired: boolean;
  owner: { id: string; name: string; email: string };
};

type TokenList = { tokens: Token[]; canManageAll: boolean; userId: string };
type CreatedToken = { token: string; id: string; name: string; expiresAt: string | null };

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

export function ApiTokensView() {
  const { isViewer } = useAdminRole();
  const [data, setData] = useState<TokenList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await adminRequest<TokenList>("/api/admin/api-tokens");
      setData(next);
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    adminRequest<TokenList>("/api/admin/api-tokens")
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const token = await adminRequest<CreatedToken>("/api/admin/api-tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), expiry }),
      });
      setCreated(token);
      setCopied(false);
      setFormOpen(false);
      setName("");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await adminRequest(`/api/admin/api-tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConfirmingId(null);
      if (created?.id === id) setCreated(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  return (
    <>
      <AdminHeader
        title="API tokens"
        description="Personal tokens let scripts and integrations call the AMR Hub REST API as you. Tokens have your permissions in this workspace."
        actions={
          !formOpen && (
            <button type="button" className="primary-button" onClick={() => setFormOpen(true)}>
              <Plus size={15} aria-hidden="true" />
              Create API token
            </button>
          )
        }
      />
      <div className="admin-stack">
        {isViewer && (
          <AdminNotice tone="info">
            You are a viewer, so your tokens are read-only: they can search and read issues but
            cannot change anything.
          </AdminNotice>
        )}
        {error && <AdminNotice tone="error">{error}</AdminNotice>}

        {created && (
          <section className="admin-card admin-secret" aria-live="polite">
            <h2>
              <KeyRound size={16} aria-hidden="true" /> Copy your new token now
            </h2>
            <p className="admin-muted">
              “{created.name}” was created. For security, this is the only time the token is
              shown. Store it somewhere safe.
            </p>
            <div className="admin-secret-row">
              <code className="admin-secret-value">{created.token}</code>
              <button
                type="button"
                className="secondary-button"
                onClick={async () => setCopied(await copyText(created.token))}
              >
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="admin-muted">
              Try it: <code className="admin-mono">curl -H &quot;Authorization: Bearer {created.token.slice(0, 10)}…&quot; {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/myself</code>{" "}
              · <Link href="/admin/api-docs">REST API docs</Link>
            </p>
            <div>
              <button type="button" className="text-button" onClick={() => setCreated(null)}>
                I&apos;ve saved it, hide the token
              </button>
            </div>
          </section>
        )}

        {formOpen && (
          <form className="admin-card admin-form" onSubmit={create}>
            <h2>Create an API token</h2>
            <div className="admin-form-grid">
              <label className="form-field">
                <span>Label</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Release script"
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label className="form-field">
                <span>Expires after</span>
                <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-form-actions">
              <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}

        {!data && !error && <p className="admin-muted">Loading tokens…</p>}
        {data && data.tokens.length === 0 && (
          <div className="admin-empty">
            <h2>No API tokens yet</h2>
            <p>Create a token to use the REST API from scripts, CI or other tools.</p>
          </div>
        )}
        {data && data.tokens.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  {data.canManageAll && <th scope="col">Owner</th>}
                  <th scope="col">Created</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Last used</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.tokens.map((token) => (
                  <tr key={token.id}>
                    <td>
                      <strong>{token.name}</strong>
                      {token.expired && <span className="admin-pill" data-tone="danger">Expired</span>}
                    </td>
                    {data.canManageAll && (
                      <td>
                        {token.owner.name}
                        {token.owner.id === data.userId && <span className="admin-muted"> (you)</span>}
                      </td>
                    )}
                    <td className="admin-nowrap">{formatDate(token.createdAt)}</td>
                    <td className="admin-nowrap">{token.expiresAt ? formatDate(token.expiresAt) : "Never"}</td>
                    <td className="admin-nowrap">{relativeTime(token.lastUsedAt)}</td>
                    <td className="admin-actions-cell">
                      {confirmingId === token.id ? (
                        <span className="admin-confirm">
                          <button type="button" className="danger-button" onClick={() => revoke(token.id)}>
                            Revoke
                          </button>
                          <button type="button" className="text-button" onClick={() => setConfirmingId(null)}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="admin-icon-button"
                          onClick={() => setConfirmingId(token.id)}
                          aria-label={`Revoke ${token.name}`}
                          title="Revoke"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
