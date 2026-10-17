/** Client-safe copy of the webhook event list (src/server/webhooks.ts imports Node modules). */
export const WEBHOOK_EVENT_LABELS = {
  issue_created: "Issue created",
  issue_updated: "Issue updated",
  issue_deleted: "Issue deleted",
  comment_created: "Comment created",
  sprint_started: "Sprint started",
  sprint_closed: "Sprint closed",
  version_released: "Version released",
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENT_LABELS;
