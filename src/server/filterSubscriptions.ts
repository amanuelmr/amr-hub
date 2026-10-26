import { z } from "zod";
import prisma from "../../prisma/client";
import type {
  FilterSubscription,
  SubscriptionFrequency,
} from "../app/data/notifications";
import { basicFiltersToJql } from "../app/data/jql";
import { statusName, type ProjectWorkflow } from "../app/data/workflow";
import { deliverNotificationEmail, withEmailFormat } from "./email";
import { getNotificationSettings } from "./notificationPreferences";
import {
  renderFilterSubscriptionEmail,
  type FilterEmailIssue,
} from "./emailTemplates";
import { JqlQueryError, searchOrganizationIssues } from "./jql";
import { appOrigin, issueUrl, preferencesUrl } from "./notifications";
import { listOrganizationWorkflows } from "./workflows";

export const MAX_SUBSCRIPTIONS_PER_USER = 25;
export const SUBSCRIPTION_EMAIL_LIMIT = 50;

export const createSubscriptionSchema = z
  .object({
    frequency: z.enum(["DAILY", "WEEKLY"]),
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.frequency !== "WEEKLY" || typeof value.weekday === "number",
    { message: "Choose a day of the week", path: ["weekday"] },
  );

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export class FilterNotFoundError extends Error {
  constructor() {
    super("Filter not found");
    this.name = "FilterNotFoundError";
  }
}

export class SubscriptionLimitError extends Error {
  constructor() {
    super(`You can have at most ${MAX_SUBSCRIPTIONS_PER_USER} filter subscriptions`);
    this.name = "SubscriptionLimitError";
  }
}

type StoredSubscription = {
  id: string;
  savedViewId: string;
  frequency: string;
  hour: number;
  weekday: number | null;
  lastSentAt: Date | null;
  createdAt: Date;
  savedView: { name: string };
};

function serializeSubscription(row: StoredSubscription): FilterSubscription {
  return {
    id: row.id,
    savedViewId: row.savedViewId,
    filterName: row.savedView.name,
    frequency: row.frequency as SubscriptionFrequency,
    hour: row.hour,
    weekday: row.weekday,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const subscriptionInclude = { savedView: { select: { name: true } } } as const;

/** The caller's subscriptions in this workspace, optionally for one filter. */
export async function listFilterSubscriptions(
  userId: string,
  organizationId: string,
  savedViewId?: string,
) {
  const rows = await prisma.filterSubscription.findMany({
    where: {
      userId,
      savedView: { organizationId },
      ...(savedViewId ? { savedViewId } : {}),
    },
    include: subscriptionInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeSubscription);
}

export async function createFilterSubscription(
  userId: string,
  organizationId: string,
  savedViewId: string,
  input: CreateSubscriptionInput,
) {
  const view = await prisma.savedView.findFirst({
    where: { id: savedViewId, organizationId },
    select: { id: true },
  });
  if (!view) throw new FilterNotFoundError();

  const count = await prisma.filterSubscription.count({ where: { userId } });
  if (count >= MAX_SUBSCRIPTIONS_PER_USER) throw new SubscriptionLimitError();

  const row = await prisma.filterSubscription.create({
    data: {
      userId,
      savedViewId,
      frequency: input.frequency,
      hour: input.hour,
      weekday: input.frequency === "WEEKLY" ? (input.weekday ?? 1) : null,
    },
    include: subscriptionInclude,
  });
  return serializeSubscription(row);
}

/**
 * Removes one subscription (by id) or all of the caller's subscriptions to the
 * filter. Returns how many were removed.
 */
export async function deleteFilterSubscriptions(
  userId: string,
  organizationId: string,
  savedViewId: string,
  subscriptionId?: string | null,
) {
  const result = await prisma.filterSubscription.deleteMany({
    where: {
      userId,
      savedViewId,
      savedView: { organizationId },
      ...(subscriptionId ? { id: subscriptionId } : {}),
    },
  });
  return result.count;
}

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

/** The most recent scheduled send time (UTC) at or before `now`. */
export function latestScheduledSlot(
  schedule: { frequency: string; hour: number; weekday: number | null },
  now: Date,
) {
  const slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), schedule.hour),
  );
  if (schedule.frequency === "WEEKLY" && schedule.weekday !== null) {
    const back = (slot.getUTCDay() - schedule.weekday + 7) % 7;
    slot.setUTCDate(slot.getUTCDate() - back);
    if (slot > now) slot.setUTCDate(slot.getUTCDate() - 7);
  } else if (slot > now) {
    slot.setUTCDate(slot.getUTCDate() - 1);
  }
  return slot;
}

/**
 * Due when the latest slot passed after the last send (or after creation, so
 * a new subscription waits for its first slot). Late cron runs catch up once.
 */
export function isSubscriptionDue(
  subscription: {
    frequency: string;
    hour: number;
    weekday: number | null;
    lastSentAt: Date | null;
    createdAt: Date;
  },
  now: Date,
) {
  const slot = latestScheduledSlot(subscription, now);
  const reference = subscription.lastSentAt ?? subscription.createdAt;
  return reference < slot;
}

async function jqlForView(view: {
  jql: string | null;
  query: string;
  status: string;
  priority: string;
  assignee: string;
  sort: string;
  labelId: string | null;
  organizationId: string;
}) {
  if (view.jql !== null) return view.jql;
  const [label, member] = await Promise.all([
    view.labelId
      ? prisma.label.findUnique({ where: { id: view.labelId }, select: { name: true } })
      : null,
    view.assignee !== "ALL" && view.assignee !== "UNASSIGNED"
      ? prisma.member.findFirst({
          where: { id: view.assignee, organizationId: view.organizationId },
          select: { user: { select: { email: true } } },
        })
      : null,
  ]);
  return basicFiltersToJql({
    text: view.query,
    status: view.status,
    priority: view.priority,
    labelName: label?.name ?? null,
    assignee:
      view.assignee === "ALL"
        ? null
        : view.assignee === "UNASSIGNED"
          ? "UNASSIGNED"
          : (member?.user.email ?? view.assignee),
    sort: view.sort === "OLDEST" ? "OLDEST" : "NEWEST",
  });
}

/**
 * Sends every due filter subscription: runs the saved filter's JQL as the
 * subscriber and emails up to 50 results. Returns counts for the cron log.
 */
export async function sendDueFilterSubscriptions(now = new Date()) {
  const rows = await prisma.filterSubscription.findMany({
    include: {
      savedView: true,
      user: { select: { id: true, email: true } },
    },
  });
  const workflowsByOrg = new Map<string, Record<string, ProjectWorkflow>>();
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if (!isSubscriptionDue(row, now)) continue;
    const view = row.savedView;
    try {
      const membership = await prisma.member.findFirst({
        where: { organizationId: view.organizationId, userId: row.userId },
        select: { id: true, role: true },
      });
      // Former members keep the row but get nothing.
      if (!membership || !row.user.email) continue;

      const jql = await jqlForView(view);
      const result = await searchOrganizationIssues(
        view.organizationId,
        { id: row.userId, role: membership.role },
        {
        jql,
        limit: SUBSCRIPTION_EMAIL_LIMIT,
      });

      let workflows = workflowsByOrg.get(view.organizationId);
      if (!workflows) {
        workflows = await listOrganizationWorkflows(view.organizationId);
        workflowsByOrg.set(view.organizationId, workflows);
      }

      const issues: FilterEmailIssue[] = result.issues.map((issue) => ({
        issueKey: issue.id,
        issueTitle: issue.title,
        status: statusName(issue.status, workflows?.[issue.projectId]?.statuses),
        assignee: issue.assignee?.name ?? null,
        url: issueUrl(issue.id),
      }));
      const params = new URLSearchParams({ filter: view.id });
      if (view.jql !== null) params.set("jql", view.jql);

      const { emailFormat } = await getNotificationSettings(row.user.id);
      const delivered = await deliverNotificationEmail(
        withEmailFormat(
          {
            to: row.user.email,
            ...renderFilterSubscriptionEmail({
              filterName: view.name,
              filterUrl: `${appOrigin()}/issues?${params}`,
              issues,
              total: result.total,
              preferencesUrl: preferencesUrl(),
            }),
          },
          emailFormat,
        ),
      );
      if (delivered) {
        await prisma.filterSubscription.update({
          where: { id: row.id },
          data: { lastSentAt: now },
        });
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      if (error instanceof JqlQueryError) {
        console.warn(`Filter subscription ${row.id}: invalid JQL — ${error.message}`);
        // Don't retry a broken filter every run; wait for the next slot.
        await prisma.filterSubscription.update({
          where: { id: row.id },
          data: { lastSentAt: now },
        });
      } else {
        console.error("Failed to send filter subscription", row.id, error);
      }
    }
  }

  return { sent, failed };
}
