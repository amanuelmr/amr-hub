"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader, AdminNotice } from "./AdminShell";
import { adminRequest, formatDate } from "./adminClient";

type Overview = {
  id: string;
  name: string;
  key: string;
  slug: string;
  role: string;
  createdAt: string | null;
  counts: { members: number; projects: number; issues: number };
  owners: Array<{ name: string; email: string }>;
};

const ROLE_NAMES: Record<string, string> = {
  owner: "Owner (administrator)",
  member: "Member",
  viewer: "Viewer (read-only)",
};

export function GeneralView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminRequest<Overview>("/api/admin/overview")
      .then(setOverview)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <>
      <AdminHeader
        title="General"
        description="Details about this workspace. Members, roles and invitations are managed from Account and access."
        actions={
          <Link className="secondary-button" href="/account">
            Manage members
          </Link>
        }
      />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {!overview && !error && <p className="admin-muted">Loading workspace details…</p>}
      {overview && (
        <div className="admin-stack">
          <section className="admin-card">
            <h2>Workspace</h2>
            <dl className="admin-details">
              <div>
                <dt>Name</dt>
                <dd>{overview.name}</dd>
              </div>
              <div>
                <dt>Key</dt>
                <dd className="admin-mono">{overview.key}</dd>
              </div>
              <div>
                <dt>URL slug</dt>
                <dd className="admin-mono">{overview.slug}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(overview.createdAt)}</dd>
              </div>
              <div>
                <dt>Your role</dt>
                <dd>{ROLE_NAMES[overview.role] ?? overview.role}</dd>
              </div>
              <div>
                <dt>Owners</dt>
                <dd>
                  {overview.owners.map((owner) => (
                    <span key={owner.email} className="admin-owner">
                      {owner.name} <span className="admin-muted">{owner.email}</span>
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </section>
          <section className="admin-stats" aria-label="Usage">
            <div className="admin-stat">
              <strong>{overview.counts.members}</strong>
              <span>Members</span>
            </div>
            <div className="admin-stat">
              <strong>{overview.counts.projects}</strong>
              <span>Projects</span>
            </div>
            <div className="admin-stat">
              <strong>{overview.counts.issues}</strong>
              <span>Issues</span>
            </div>
          </section>
          <section className="admin-card">
            <h2>Administration</h2>
            <ul className="admin-link-list">
              <li>
                <Link href="/account">Members and invitations</Link>
                <span className="admin-muted">Invite people, change access, remove members.</span>
              </li>
              {overview.role === "owner" && (
                <li>
                  <Link href="/admin/audit-log">Audit log</Link>
                  <span className="admin-muted">Who changed what in workspace administration.</span>
                </li>
              )}
              <li>
                <Link href="/admin/api-tokens">API tokens</Link>
                <span className="admin-muted">Personal tokens for scripts and integrations.</span>
              </li>
              {overview.role === "owner" && (
                <li>
                  <Link href="/admin/webhooks">Webhooks</Link>
                  <span className="admin-muted">Notify other systems when work changes.</span>
                </li>
              )}
              <li>
                <Link href="/admin/import">Import issues from CSV</Link>
                <span className="admin-muted">Bring work in from Jira or a spreadsheet.</span>
              </li>
              <li>
                <Link href="/admin/export">Export</Link>
                <span className="admin-muted">Download projects as CSV or JSON.</span>
              </li>
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
