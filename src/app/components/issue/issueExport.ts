import { PRIORITY_LABELS, RESOLUTION_LABELS, type Issue } from "../../data/issues";

/** Names the export needs that the issue itself only holds as keys. */
export type IssueExportContext = {
  url: string;
  status: string;
  type: string;
  /** Makes stored rich text safe to embed as HTML. */
  sanitize: (html: string) => string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const escapeXml = (value: string) => escapeHtml(value).replace(/'/g, "&apos;");

/** CDATA cannot contain "]]>", so it is split across two sections. */
const cdata = (value: string) => `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

const day = (value: string | null) => (value ? value.slice(0, 10) : "");

/** Label/value rows shown in the Word and print versions. */
export function issueFieldRows(issue: Issue, ctx: IssueExportContext): [string, string][] {
  const rows: [string, string | null | undefined][] = [
    ["Type", ctx.type],
    ["Status", ctx.status],
    ["Priority", PRIORITY_LABELS[issue.priority]],
    ["Resolution", issue.resolution ? RESOLUTION_LABELS[issue.resolution] : "Unresolved"],
    ["Assignee", issue.assignee?.name ?? "Unassigned"],
    ["Reporter", issue.creator?.name],
    ["Parent", issue.parent ? `${issue.parent.id} ${issue.parent.title}` : null],
    ["Labels", issue.labels.map((label) => label.name).join(", ")],
    ["Fix version", issue.fixVersion?.name],
    ["Story points", issue.estimate === null ? null : String(issue.estimate)],
    ["Due date", day(issue.dueDate)],
    ["Created", day(issue.createdAt)],
    ["Updated", day(issue.updatedAt)],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

/** A self-contained HTML document; Word opens it as a .doc file and it prints cleanly. */
export function issueToHtml(issue: Issue, ctx: IssueExportContext) {
  const fields = issueFieldRows(issue, ctx)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const links = (issue.links ?? [])
    .map((link) => `<li>${escapeHtml(link.type.replace(/_/g, " ").toLowerCase())} ${escapeHtml(link.issue.id)} ${escapeHtml(link.issue.title)}</li>`)
    .concat(
      (issue.webLinks ?? []).map(
        (link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`,
      ),
    )
    .join("");
  const comments = (issue.comments ?? [])
    .map(
      (comment) =>
        `<div class="comment"><p class="meta">${escapeHtml(comment.author)} · ${day(comment.createdAt)}</p>${ctx.sanitize(comment.body)}</div>`,
    )
    .join("");
  const title = `[${issue.id}] ${issue.title}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;color:#111;margin:24px}
h1{font-size:18pt;margin:0 0 4px}
.key{color:#555;font-size:10pt;margin:0 0 16px}
table{border-collapse:collapse;margin-bottom:16px}
th{text-align:left;padding:3px 16px 3px 0;color:#555;font-weight:normal;vertical-align:top}
td{padding:3px 0}
h2{font-size:13pt;border-bottom:1px solid #ccc;padding-bottom:2px;margin:18px 0 8px}
.comment{margin-bottom:10px}.meta{color:#555;font-size:10pt;margin:0}
</style></head><body>
<p class="key"><a href="${escapeHtml(ctx.url)}">${escapeHtml(issue.id)}</a></p>
<h1>${escapeHtml(issue.title)}</h1>
<table>${fields}</table>
<h2>Description</h2>
${issue.description ? ctx.sanitize(issue.description) : "<p>None</p>"}
${links ? `<h2>Links</h2><ul>${links}</ul>` : ""}
${comments ? `<h2>Comments</h2>${comments}` : ""}
</body></html>`;
}

/** An RSS-style XML item, the usual shape for one exported work item. */
export function issueToXml(issue: Issue, ctx: IssueExportContext) {
  const tag = (name: string, value: string | null | undefined, attrs = "") =>
    value ? `    <${name}${attrs}>${escapeXml(value)}</${name}>\n` : "";
  const labels = issue.labels.map((label) => `      <label>${escapeXml(label.name)}</label>\n`).join("");
  const webLinks = (issue.webLinks ?? [])
    .map((link) => `      <weblink url="${escapeXml(link.url)}">${escapeXml(link.title)}</weblink>\n`)
    .join("");
  const links = (issue.links ?? [])
    .map((link) => `      <issuelink type="${escapeXml(link.type)}" key="${escapeXml(link.issue.id)}"/>\n`)
    .join("");
  const comments = (issue.comments ?? [])
    .map(
      (comment) =>
        `      <comment author="${escapeXml(comment.author)}" created="${escapeXml(comment.createdAt)}">${cdata(comment.body)}</comment>\n`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="0.92">
  <channel>
  <item>
${tag("title", `[${issue.id}] ${issue.title}`)}${tag("link", ctx.url)}${tag("key", issue.id)}${tag("summary", issue.title)}${tag("type", ctx.type)}${tag("status", ctx.status)}${tag("priority", PRIORITY_LABELS[issue.priority])}${tag("resolution", issue.resolution ? RESOLUTION_LABELS[issue.resolution] : "Unresolved")}${tag("assignee", issue.assignee?.name)}${tag("reporter", issue.creator?.name)}${tag("parent", issue.parent?.id)}${tag("fixVersion", issue.fixVersion?.name)}${tag("storyPoints", issue.estimate === null ? null : String(issue.estimate))}${tag("due", issue.dueDate)}${tag("created", issue.createdAt)}${tag("updated", issue.updatedAt)}    <description>${cdata(issue.description ?? "")}</description>
    <labels>
${labels}    </labels>
    <issuelinks>
${links}${webLinks}    </issuelinks>
    <comments>
${comments}    </comments>
  </item>
  </channel>
</rss>
`;
}
