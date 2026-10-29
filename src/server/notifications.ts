import { after } from "next/server";
import prisma from "../../prisma/client";
import {
  inAppTypes,
  type Notification,
  type NotificationSettings,
  type NotificationType,
} from "../app/data/notifications";
import { deliverNotificationEmail, withEmailFormat, type EmailMessage } from "./email";
import {
  renderIssueNotificationEmail,
  renderNotificationDigestEmail,
  type IssueEmailItem,
} from "./emailTemplates";
import { loadServerEnvironment } from "./env";
import {
  projectAudienceUserIds,
  securityViewerFor,
  visibleProjectWhere,
} from "./projectAccess";
import { canSeeSecuredIssue } from "../app/data/issueSecurity";
import {
  getNotificationSettings,
  getNotificationSettingsFor,
  listDigestSubscribers,
  markDigestSent,
} from "./notificationPreferences";

function serializeNotification(notification: {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: Date | null;
  issueId: string | null;
  projectId: string | null;
  createdAt: Date;
}): Notification {
  return {
    id: notification.id,
    type: notification.type as NotificationType,
    title: notification.title,
    body: notification.body,
    isRead: notification.readAt !== null,
    issueId: notification.issueId,
    projectId: notification.projectId,
    createdAt: notification.createdAt.toISOString(),
  };
}

export function appOrigin() {
  try {
    return (
      loadServerEnvironment().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

export function issueUrl(issueKey: string) {
  return `${appOrigin()}/issues/${encodeURIComponent(issueKey)}`;
}

export function preferencesUrl() {
  return `${appOrigin()}/account/notifications`;
}

/**
 * Runs work after the response is sent when inside a request (so serverless
 * functions stay alive for it), or detached otherwise. Never throws.
 */
export function runInBackground(task: () => Promise<unknown>) {
  const guarded = () =>
    task().catch((error) => console.error("Background task failed", error));
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

/**
 * One-line summary for emails. Most bodies already read "Ada assigned WEB-1
 * to you"; share notifications put the sentence in the title and the issue
 * title / note in the body.
 */
export function emailSummary(type: string, title: string, body: string) {
  return type === "ISSUE_SHARED" ? `${title}: ${body}` : body;
}

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body: string;
  organizationId: string;
  projectId?: string | null;
  issueId?: string | null;
  actorId?: string | null;
};

/** Identical notifications inside this window are treated as duplicates. */
const DEDUPE_WINDOW_MS = 15_000;

export type RecipientPlan = { userId: string; inApp: boolean; email: boolean };

/**
 * Pure routing decision: who gets the event and on which channel.
 * The actor is dropped unless they opted into their own changes; email is
 * only immediate for users who are not on the daily digest.
 */
export function planRecipients(
  recipientUserIds: (string | null | undefined)[],
  type: NotificationType,
  actorId: string | null | undefined,
  settingsFor: (userId: string) => NotificationSettings,
): RecipientPlan[] {
  const unique = [...new Set(recipientUserIds.filter(Boolean) as string[])];
  const plans: RecipientPlan[] = [];
  for (const userId of unique) {
    const settings = settingsFor(userId);
    if (actorId && userId === actorId && !settings.notifyOwnChanges) continue;
    const channels = settings.events[type];
    if (!channels.inApp && !channels.email) continue;
    plans.push({
      userId,
      inApp: channels.inApp,
      email: channels.email && settings.emailDigest === "IMMEDIATE",
    });
  }
  return plans;
}

/**
 * Records a notification for each recipient and emails the ones who want this
 * event by email right away. Never throws into the calling mutation.
 *
 * A row is stored whenever either channel is on: the inbox hides types with
 * in-app off, and the daily digest reads email-enabled types from the rows.
 */
async function filterBySecurityLevel(
  userIds: string[],
  issueId: string,
  organizationId: string,
) {
  const issue = await prisma.issue.findFirst({
    where: { id: issueId, organizationId },
    select: {
      projectId: true,
      securityLevel: true,
      creatorId: true,
      assignee: { select: { userId: true } },
    },
  });
  if (!issue?.securityLevel) return userIds;
  const roles = await prisma.member.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true, role: true },
  });
  const workspaceRole = new Map(roles.map((member) => [member.userId, member.role]));
  const visible: string[] = [];
  for (const userId of userIds) {
    const viewer = await securityViewerFor(issue.projectId, {
      id: userId,
      role: workspaceRole.get(userId) ?? "member",
    });
    const item = { ...issue, assigneeUserId: issue.assignee?.userId ?? null };
    if (canSeeSecuredIssue(item, viewer)) visible.push(userId);
  }
  return visible;
}

export async function notifyRecipients(
  recipientUserIds: (string | null | undefined)[],
  input: NotifyInput,
) {
  try {
    const candidates = [
      ...new Set(recipientUserIds.filter(Boolean) as string[]),
    ];
    if (candidates.length === 0) return;

    // Only current members of the workspace can be notified.
    const members = await prisma.member.findMany({
      where: { organizationId: input.organizationId, userId: { in: candidates } },
      select: { userId: true },
    });
    let memberIds = members.map((member) => member.userId);
    // Private projects only notify people who can see them.
    if (input.projectId) {
      const audience = await projectAudienceUserIds(
        input.projectId,
        input.organizationId,
      );
      if (audience) memberIds = memberIds.filter((id) => audience.has(id));
    }
    // Items with a security level only notify people who can still see them.
    if (input.issueId) {
      memberIds = await filterBySecurityLevel(memberIds, input.issueId, input.organizationId);
    }
    if (memberIds.length === 0) return;

    const settings = await getNotificationSettingsFor(memberIds);
    let plans = planRecipients(
      memberIds,
      input.type,
      input.actorId,
      (userId) => settings.get(userId)!,
    );
    if (plans.length === 0) return;

    const recent = await prisma.notification.findMany({
      where: {
        userId: { in: plans.map((plan) => plan.userId) },
        type: input.type,
        issueId: input.issueId ?? null,
        body: input.body,
        createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: { userId: true },
    });
    const alreadyNotified = new Set(recent.map((row) => row.userId));
    plans = plans.filter((plan) => !alreadyNotified.has(plan.userId));
    if (plans.length === 0) return;

    await prisma.notification.createMany({
      data: plans.map((plan) => ({
        userId: plan.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        issueId: input.issueId ?? null,
        actorId: input.actorId ?? null,
      })),
    });

    const emailUserIds = plans.filter((plan) => plan.email).map((plan) => plan.userId);
    if (emailUserIds.length > 0 && input.issueId) {
      const issueId = input.issueId;
      runInBackground(() =>
        sendImmediateEmails(emailUserIds, issueId, input, (userId) =>
          settings.get(userId)?.emailFormat ?? "HTML",
        ),
      );
    }
  } catch (error) {
    console.error("Failed to deliver notifications", error);
  }
}

async function sendImmediateEmails(
  userIds: string[],
  issueId: string,
  input: NotifyInput,
  formatFor: (userId: string) => "HTML" | "TEXT",
) {
  const [users, issue] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    }),
    prisma.issue.findFirst({
      where: { id: issueId, organizationId: input.organizationId },
      select: { id: true, title: true },
    }),
  ]);
  if (!issue) return;

  const { subject, html, text } = renderIssueNotificationEmail({
    summary: emailSummary(input.type, input.title, input.body),
    issueKey: issue.id,
    issueTitle: issue.title,
    url: issueUrl(issue.id),
    preferencesUrl: preferencesUrl(),
  });
  await Promise.all(
    users
      .filter((user) => user.email)
      .map((user) =>
        deliverNotificationEmail(
          withEmailFormat({ to: user.email, subject, html, text }, formatFor(user.id)),
        ),
      ),
  );
}

export type NotificationListFilters = {
  cursor?: string;
  limit?: number;
  /** Workspace role, so notifications about hidden projects drop out. */
  role?: string;
};

export async function listNotifications(
  userId: string,
  organizationId: string,
  filters: NotificationListFilters = {},
) {
  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  const settings = await getNotificationSettings(userId);
  const where = {
    userId,
    organizationId,
    type: { in: inAppTypes(settings) },
    // Trashed work items and projects the user can no longer see drop out.
    AND: [
      { OR: [{ issueId: null }, { issue: { deletedAt: null } }] },
      {
        OR: [
          { projectId: null },
          {
            project: visibleProjectWhere(
              { id: userId, role: filters.role ?? "member" },
              organizationId,
              { includeArchived: true },
            ),
          },
        ],
      },
    ],
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  let nextCursor: string | null = null;
  let page = notifications;
  if (notifications.length > limit) {
    page = notifications.slice(0, limit);
    nextCursor = page[page.length - 1].id;
  }

  return {
    notifications: page.map(serializeNotification),
    unreadCount,
    nextCursor,
  };
}

export async function setNotificationRead(
  id: string,
  userId: string,
  isRead = true,
) {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
  });
  if (!notification) return null;

  const updated = await prisma.notification.update({
    where: { id },
    data: {
      readAt: isRead ? (notification.readAt ?? new Date()) : null,
    },
  });

  return serializeNotification(updated);
}

/** Kept for existing callers: marks one notification read. */
export function markNotificationRead(id: string, userId: string) {
  return setNotificationRead(id, userId, true);
}

export async function markAllNotificationsRead(
  userId: string,
  organizationId?: string,
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(organizationId ? { organizationId } : {}),
    },
    data: { readAt: new Date() },
  });
}

/* ------------------------------------------------------------------ */
/* Daily digest                                                        */
/* ------------------------------------------------------------------ */

const DIGEST_INTERVAL_MS = 20 * 60 * 60 * 1000;
const DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DIGEST_MAX_ITEMS = 50;

/** A digest is due once ~a day; 20h tolerates cron drift. */
export function isDigestDue(lastDigestAt: Date | null, now: Date) {
  return !lastDigestAt || now.getTime() - lastDigestAt.getTime() >= DIGEST_INTERVAL_MS;
}

/**
 * Emails each daily-digest user the email-enabled events since their last
 * digest. Returns how many digests were sent (or logged).
 */
export async function sendDailyDigests(now = new Date()) {
  const subscribers = await listDigestSubscribers();
  let sent = 0;

  for (const subscriber of subscribers) {
    if (!isDigestDue(subscriber.lastDigestAt, now)) continue;
    const since =
      subscriber.lastDigestAt ?? new Date(now.getTime() - DIGEST_LOOKBACK_MS);
    const emailTypes = (
      Object.entries(subscriber.settings.events) as [
        NotificationType,
        { email: boolean },
      ][]
    )
      .filter(([, channels]) => channels.email)
      .map(([type]) => type);

    try {
      const [user, rows] = await Promise.all([
        prisma.user.findUnique({
          where: { id: subscriber.userId },
          select: { email: true },
        }),
        emailTypes.length
          ? prisma.notification.findMany({
              where: {
                userId: subscriber.userId,
                type: { in: emailTypes },
                createdAt: { gt: since, lte: now },
              },
              orderBy: { createdAt: "desc" },
              take: DIGEST_MAX_ITEMS,
              include: { issue: { select: { id: true, title: true } } },
            })
          : Promise.resolve([]),
      ]);

      if (user?.email && rows.length > 0) {
        const items: IssueEmailItem[] = rows.map((row) => ({
          issueKey: row.issue?.id ?? row.issueId ?? "",
          issueTitle: row.issue?.title ?? row.title,
          summary: emailSummary(row.type, row.title, row.body),
          url: row.issueId ? issueUrl(row.issueId) : appOrigin(),
        }));
        const message: EmailMessage = {
          to: user.email,
          ...renderNotificationDigestEmail({
            items,
            preferencesUrl: preferencesUrl(),
          }),
        };
        if (await deliverNotificationEmail(withEmailFormat(message, subscriber.settings.emailFormat))) {
          sent += 1;
        }
      }
      await markDigestSent(subscriber.userId, now);
    } catch (error) {
      console.error("Failed to send daily digest", subscriber.userId, error);
    }
  }

  return sent;
}
