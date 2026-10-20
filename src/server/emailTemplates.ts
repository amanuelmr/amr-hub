/** Branded HTML + text email templates (auth, invitations, notifications). */
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace";
const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const COLOR = {
  ink: "#17182a",
  inkSecondary: "#3d3c4a",
  line: "#2b2d46",
  lime: "#c8f169",
  paper: "#fffdf4",
  cream: "#f4efdf",
  muted: "#8b8a94",
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBrandedEmail(input: {
  heading: string;
  intro: string;
  ctaLabel: string;
  url: string;
  note: string;
}) {
  const { heading, intro, ctaLabel, url, note } = input;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${COLOR.cream};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.cream};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${COLOR.paper};border:2px solid ${COLOR.ink};border-radius:4px;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:34px;height:34px;border:2px solid ${COLOR.ink};border-radius:2px;background:${COLOR.lime};color:${COLOR.ink};font-family:${FONT_MONO};font-weight:900;font-size:16px;text-align:center;vertical-align:middle;">A</td>
                    <td style="padding-left:10px;font-family:${FONT_MONO};font-weight:800;font-size:13px;letter-spacing:0.04em;color:${COLOR.ink};">AMR HUB</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 4px 32px;">
                <h1 style="margin:0 0 12px 0;font-family:${FONT_MONO};font-size:18px;font-weight:800;color:${COLOR.ink};">${heading}</h1>
                <p style="margin:0 0 22px 0;font-family:${FONT_SANS};font-size:14px;line-height:1.6;color:${COLOR.inkSecondary};">${intro}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:${COLOR.lime};border:2px solid ${COLOR.line};border-radius:3px;">
                      <a href="${url}" style="display:inline-block;padding:12px 22px;font-family:${FONT_MONO};font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.ink};text-decoration:none;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${COLOR.muted};">${note}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #e8e2cf;font-family:${FONT_SANS};font-size:11px;line-height:1.6;color:${COLOR.muted};">
                If the button above doesn't work, paste this link into your browser:<br>
                <span style="word-break:break-all;color:${COLOR.inkSecondary};">${url}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${heading}\n\n${intro}\n\n${ctaLabel}: ${url}\n\n${note}`;

  return { html, text };
}

/* ------------------------------------------------------------------ */
/* Notification emails                                                 */
/* ------------------------------------------------------------------ */

function emailFrame(content: string, footer: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${COLOR.cream};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.cream};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${COLOR.paper};border:2px solid ${COLOR.ink};border-radius:4px;">
            <tr>
              <td style="padding:22px 28px 0 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:28px;height:28px;border:2px solid ${COLOR.ink};border-radius:2px;background:${COLOR.lime};color:${COLOR.ink};font-family:${FONT_MONO};font-weight:900;font-size:13px;text-align:center;vertical-align:middle;">A</td>
                    <td style="padding-left:10px;font-family:${FONT_MONO};font-weight:800;font-size:12px;letter-spacing:0.04em;color:${COLOR.ink};">AMR HUB</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 8px 28px;">${content}</td>
            </tr>
            <tr>
              <td style="padding:14px 28px 20px 28px;border-top:1px solid #e8e2cf;font-family:${FONT_SANS};font-size:11px;line-height:1.6;color:${COLOR.muted};">${footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                  <tr>
                    <td style="background:${COLOR.lime};border:2px solid ${COLOR.line};border-radius:3px;">
                      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;font-family:${FONT_MONO};font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${COLOR.ink};text-decoration:none;">${escapeHtml(label)}</a>
                    </td>
                  </tr>
                </table>`;
}

function preferencesFooter(preferencesUrl: string) {
  return `You're receiving this because of your AMR Hub notification settings. <a href="${escapeHtml(
    preferencesUrl,
  )}" style="color:${COLOR.inkSecondary};">Manage notifications</a>`;
}

export type IssueEmailItem = {
  issueKey: string;
  issueTitle: string;
  /** e.g. "Ada Lovelace assigned WEB-12 to you" */
  summary: string;
  url: string;
};

function issueRow(item: IssueEmailItem) {
  return `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #e8e2cf;">
        <a href="${escapeHtml(item.url)}" style="font-family:${FONT_MONO};font-size:12px;font-weight:800;color:${COLOR.ink};text-decoration:none;">${escapeHtml(item.issueKey)}</a>
        <span style="font-family:${FONT_SANS};font-size:14px;color:${COLOR.ink};"> ${escapeHtml(item.issueTitle)}</span>
        <div style="margin-top:3px;font-family:${FONT_SANS};font-size:13px;color:${COLOR.inkSecondary};">${escapeHtml(item.summary)}</div>
      </td>
    </tr>`;
}

/** A single issue event (assigned, mentioned, commented...) sent immediately. */
export function renderIssueNotificationEmail(input: {
  /** Full sentence, e.g. "Ada Lovelace assigned WEB-12 to you". */
  summary: string;
  issueKey: string;
  issueTitle: string;
  url: string;
  preferencesUrl: string;
}) {
  const heading = input.summary;
  const content = `<p style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:14px;line-height:1.5;color:${COLOR.inkSecondary};">${escapeHtml(heading)}</p>
                <h1 style="margin:0;font-family:${FONT_SANS};font-size:18px;line-height:1.35;font-weight:700;color:${COLOR.ink};">
                  <a href="${escapeHtml(input.url)}" style="font-family:${FONT_MONO};font-size:13px;color:${COLOR.inkSecondary};text-decoration:none;">${escapeHtml(input.issueKey)}</a><br>
                  ${escapeHtml(input.issueTitle)}
                </h1>
                ${button("View work item", input.url)}`;

  const html = emailFrame(content, preferencesFooter(input.preferencesUrl));
  const text = `${heading}\n\n${input.issueKey}: ${input.issueTitle}\n${input.url}\n\nManage notifications: ${input.preferencesUrl}`;
  return {
    subject: `[${input.issueKey}] ${input.issueTitle}`,
    html,
    text,
  };
}

/** Once-a-day batch of the email-enabled events since the last digest. */
export function renderNotificationDigestEmail(input: {
  items: IssueEmailItem[];
  preferencesUrl: string;
}) {
  const count = input.items.length;
  const heading = `${count} update${count === 1 ? "" : "s"} since your last digest`;
  const content = `<h1 style="margin:0 0 12px 0;font-family:${FONT_MONO};font-size:16px;font-weight:800;color:${COLOR.ink};">${escapeHtml(heading)}</h1>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${input.items
                  .map(issueRow)
                  .join("")}</table>`;
  const html = emailFrame(content, preferencesFooter(input.preferencesUrl));
  const text = `${heading}\n\n${input.items
    .map((item) => `${item.issueKey} ${item.issueTitle}\n  ${item.summary}\n  ${item.url}`)
    .join("\n\n")}\n\nManage notifications: ${input.preferencesUrl}`;
  return { subject: `Your AMR Hub daily digest: ${heading}`, html, text };
}

export type FilterEmailIssue = {
  issueKey: string;
  issueTitle: string;
  status: string;
  assignee: string | null;
  url: string;
};

/** Scheduled filter subscription: the filter's current results (capped). */
export function renderFilterSubscriptionEmail(input: {
  filterName: string;
  filterUrl: string;
  issues: FilterEmailIssue[];
  total: number;
  preferencesUrl: string;
}) {
  const shown = input.issues.length;
  const summary =
    input.total === 0
      ? "No work items match this filter right now."
      : input.total > shown
        ? `Showing ${shown} of ${input.total} work items.`
        : `${input.total} work item${input.total === 1 ? "" : "s"}.`;

  const rows = input.issues
    .map(
      (issue) => `<tr>
      <td style="padding:8px 8px 8px 0;border-bottom:1px solid #e8e2cf;font-family:${FONT_MONO};font-size:12px;font-weight:800;white-space:nowrap;"><a href="${escapeHtml(issue.url)}" style="color:${COLOR.ink};text-decoration:none;">${escapeHtml(issue.issueKey)}</a></td>
      <td style="padding:8px 8px 8px 0;border-bottom:1px solid #e8e2cf;font-family:${FONT_SANS};font-size:13px;color:${COLOR.ink};">${escapeHtml(issue.issueTitle)}</td>
      <td style="padding:8px 8px 8px 0;border-bottom:1px solid #e8e2cf;font-family:${FONT_SANS};font-size:12px;color:${COLOR.inkSecondary};white-space:nowrap;">${escapeHtml(issue.status)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e8e2cf;font-family:${FONT_SANS};font-size:12px;color:${COLOR.inkSecondary};">${escapeHtml(issue.assignee ?? "Unassigned")}</td>
    </tr>`,
    )
    .join("");

  const content = `<p style="margin:0 0 4px 0;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${COLOR.muted};">Filter subscription</p>
                <h1 style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:18px;font-weight:700;color:${COLOR.ink};">${escapeHtml(input.filterName)}</h1>
                <p style="margin:0 0 12px 0;font-family:${FONT_SANS};font-size:13px;color:${COLOR.inkSecondary};">${escapeHtml(summary)}</p>
                ${shown > 0 ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : ""}
                ${button("Open filter", input.filterUrl)}`;

  const html = emailFrame(content, preferencesFooter(input.preferencesUrl));
  const text = `Filter subscription: ${input.filterName}\n${summary}\n\n${input.issues
    .map(
      (issue) =>
        `${issue.issueKey} ${issue.issueTitle} [${issue.status}] ${issue.assignee ?? "Unassigned"}\n  ${issue.url}`,
    )
    .join("\n")}\n\nOpen filter: ${input.filterUrl}\nManage subscriptions: ${input.preferencesUrl}`;
  return { subject: `[AMR Hub] Filter: ${input.filterName}`, html, text };
}
