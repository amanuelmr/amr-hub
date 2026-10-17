import Link from "next/link";
import { AdminHeader } from "./AdminShell";

type Endpoint = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  summary: string;
  write?: boolean;
  example: string;
  response?: string;
};

function endpoints(base: string): Endpoint[] {
  const auth = '-H "Authorization: Bearer $AMR_TOKEN"';
  const json = '-H "Content-Type: application/json"';
  return [
    {
      method: "GET",
      path: "/api/v1/myself",
      summary: "The user and workspace the token acts for, including your role.",
      example: `curl ${auth} \\\n  ${base}/api/v1/myself`,
      response: `{ "accountId": "…", "displayName": "Ada Lovelace", "emailAddress": "ada@example.com",\n  "role": "member", "organization": { "key": "ACME", … } }`,
    },
    {
      method: "GET",
      path: "/api/v1/projects",
      summary: "Projects in the workspace with their workflow statuses and issue types.",
      example: `curl ${auth} \\\n  ${base}/api/v1/projects`,
    },
    {
      method: "GET",
      path: "/api/v1/issues?jql=…&startAt=0&maxResults=50",
      summary:
        "Search with JQL (same syntax as the issue navigator). maxResults is capped at 100; page with startAt.",
      example: `curl -G ${auth} \\\n  --data-urlencode 'jql=project = WEB AND status != Done ORDER BY priority DESC' \\\n  --data-urlencode 'maxResults=20' \\\n  ${base}/api/v1/issues`,
      response: `{ "startAt": 0, "maxResults": 20, "total": 42, "isLast": false,\n  "issues": [ { "key": "WEB-12", "fields": { "summary": "…", "status": { "name": "In progress" }, … } } ] }`,
    },
    {
      method: "GET",
      path: "/api/v1/issues/{key}",
      summary: "One issue with all fields and its comments.",
      example: `curl ${auth} \\\n  ${base}/api/v1/issues/WEB-12`,
    },
    {
      method: "POST",
      path: "/api/v1/issues",
      summary:
        "Create an issue. project, summary and issuetype are the essentials; assignee accepts an email, name or accountId.",
      write: true,
      example: `curl -X POST ${auth} ${json} \\\n  -d '{"fields": {"project": {"key": "WEB"}, "summary": "Checkout fails on Safari",\n       "issuetype": {"name": "Bug"}, "priority": {"name": "High"},\n       "description": "Steps to reproduce: open checkout in Safari 17.",\n       "assignee": {"emailAddress": "ada@example.com"}, "labels": ["Frontend"],\n       "storyPoints": 3, "duedate": "2026-11-01", "parent": {"key": "WEB-1"}}}' \\\n  ${base}/api/v1/issues`,
      response: `201 { "id": "WEB-13", "key": "WEB-13", "self": "${base}/api/v1/issues/WEB-13" }`,
    },
    {
      method: "PUT",
      path: "/api/v1/issues/{key}",
      summary: "Update fields. Send only the fields to change; null clears assignee, parent or due date.",
      write: true,
      example: `curl -X PUT ${auth} ${json} \\\n  -d '{"fields": {"summary": "Checkout fails on Safari 17", "assignee": null}}' \\\n  ${base}/api/v1/issues/WEB-13`,
      response: "204 No Content",
    },
    {
      method: "DELETE",
      path: "/api/v1/issues/{key}",
      summary: "Delete an issue. Only its reporter or a workspace owner can delete.",
      write: true,
      example: `curl -X DELETE ${auth} \\\n  ${base}/api/v1/issues/WEB-13`,
      response: "204 No Content",
    },
    {
      method: "POST",
      path: "/api/v1/issues/{key}/comments",
      summary: "Add a comment.",
      write: true,
      example: `curl -X POST ${auth} ${json} \\\n  -d '{"body": "Deployed the fix to staging."}' \\\n  ${base}/api/v1/issues/WEB-13/comments`,
      response: `201 { "id": "…", "body": "Deployed the fix to staging.", "author": { … }, "created": "…" }`,
    },
    {
      method: "GET",
      path: "/api/v1/issues/{key}/transitions",
      summary: "Statuses the issue can move to.",
      example: `curl ${auth} \\\n  ${base}/api/v1/issues/WEB-13/transitions`,
    },
    {
      method: "POST",
      path: "/api/v1/issues/{key}/transitions",
      summary:
        'Move the issue to another status by name or key. Jira\'s { "transition": { "id": … } } shape also works.',
      write: true,
      example: `curl -X POST ${auth} ${json} \\\n  -d '{"status": "In review"}' \\\n  ${base}/api/v1/issues/WEB-13/transitions`,
      response: "204 No Content",
    },
  ];
}

export function ApiDocsView({ baseUrl }: { baseUrl: string }) {
  return (
    <>
      <AdminHeader
        title="REST API"
        description="A Jira-style REST API for scripts and integrations. Authenticate with a personal API token."
        actions={
          <Link className="primary-button" href="/admin/api-tokens">
            Create a token
          </Link>
        }
      />
      <div className="admin-stack admin-docs">
        <section className="admin-card">
          <h2>Authentication</h2>
          <p>
            Send your token in the <code className="admin-mono">Authorization</code> header. Requests
            run as the token’s owner in the token’s workspace, with that person’s role: tokens
            belonging to viewers can read but not change anything (403).
          </p>
          <pre className="admin-code">{`export AMR_TOKEN=amr_…\ncurl -H "Authorization: Bearer $AMR_TOKEN" ${baseUrl}/api/v1/myself`}</pre>
          <h2>Errors</h2>
          <p>
            Errors use Jira’s shape: <code className="admin-mono">{`{ "errorMessages": ["…"], "errors": { "summary": ["…"] } }`}</code>{" "}
            with 400 (invalid input or JQL), 401 (missing, invalid, expired or revoked token), 403
            (not allowed), 404 (not found) or 500.
          </p>
        </section>

        {endpoints(baseUrl).map((endpoint) => (
          <section key={`${endpoint.method} ${endpoint.path}`} className="admin-card admin-endpoint">
            <h2>
              <span className="admin-method" data-method={endpoint.method}>
                {endpoint.method}
              </span>
              <code className="admin-mono admin-break">{endpoint.path}</code>
              {endpoint.write && <span className="admin-pill">Write</span>}
            </h2>
            <p>{endpoint.summary}</p>
            <pre className="admin-code">{endpoint.example}</pre>
            {endpoint.response && (
              <>
                <p className="admin-muted">Response</p>
                <pre className="admin-code">{endpoint.response}</pre>
              </>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
