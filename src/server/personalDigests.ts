import prisma from "../../prisma/client";
import { deliverNotificationEmail, withEmailFormat } from "./email";
import { renderSectionedDigestEmail, type IssueEmailItem } from "./emailTemplates";
import { listPersonalDigestSubscribers, markDigestSent } from "./notificationPreferences";
import { appOrigin, issueUrl, preferencesUrl } from "./notifications";
import { doneStatusWhere, notDoneStatusWhere } from "./workflows";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Due reminders go out once a day; a little slack keeps cron drift harmless. */
const REMINDER_INTERVAL_MS = 20 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 2;
const MAX_ITEMS = 50;

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isDueReminderDue(lastSentAt: Date | null, now: Date) {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= REMINDER_INTERVAL_MS;
}

/** The weekly summary goes out on Mondays (UTC), once. */
export function isWeeklySummaryDue(lastSentAt: Date | null, now: Date) {
  if (now.getUTCDay() !== 1) return false;
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= 6 * DAY_MS;
}

/** Splits due work into overdue (before today) and due soon. */
export function splitByDue<T extends { dueDate: Date | null }>(items: T[], now: Date) {
  const today = startOfUtcDay(now);
  const overdue: T[] = [];
  const dueSoon: T[] = [];
  for (const item of items) {
    if (!item.dueDate) continue;
    (item.dueDate.getTime() < today ? overdue : dueSoon).push(item);
  }
  return { overdue, dueSoon };
}

function formatDue(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

type DigestIssue = { id: string; title: string; dueDate: Date | null };

function emailItem(issue: DigestIssue, summary: string): IssueEmailItem {
  return { issueKey: issue.id, issueTitle: issue.title, summary, url: issueUrl(issue.id) };
}

const digestIssueSelect = { id: true, title: true, dueDate: true } as const;

async function memberIdsFor(userId: string) {
  const members = await prisma.member.findMany({ where: { userId }, select: { id: true } });
  return members.map((member) => member.id);
}

async function deliver(
  userId: string,
  format: "HTML" | "TEXT",
  message: ReturnType<typeof renderSectionedDigestEmail>,
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return false;
  return deliverNotificationEmail(withEmailFormat({ to: user.email, ...message }, format));
}

/** Daily email of the person's open work that is overdue or due within two days. */
export async function sendDueReminders(now = new Date()) {
  const subscribers = await listPersonalDigestSubscribers("dueReminders", "lastDueReminderAt");
  let sent = 0;
  for (const subscriber of subscribers) {
    if (!isDueReminderDue(subscriber.lastSentAt, now)) continue;
    try {
      const memberIds = await memberIdsFor(subscriber.userId);
      const issues = memberIds.length
        ? await prisma.issue.findMany({
            where: {
              assigneeId: { in: memberIds },
              deletedAt: null,
              archivedAt: null,
              dueDate: { not: null, lt: new Date(startOfUtcDay(now) + (DUE_SOON_DAYS + 1) * DAY_MS) },
              AND: [notDoneStatusWhere()],
            },
            select: digestIssueSelect,
            orderBy: { dueDate: "asc" },
            take: MAX_ITEMS,
          })
        : [];
      if (issues.length > 0) {
        const { overdue, dueSoon } = splitByDue(issues, now);
        const message = renderSectionedDigestEmail({
          subject: `${issues.length} of your work items ${issues.length === 1 ? "is" : "are"} due`,
          heading: "Work due soon or overdue",
          sections: [
            { title: "Overdue", items: overdue.map((issue) => emailItem(issue, `Was due ${formatDue(issue.dueDate!)}`)) },
            { title: "Due soon", items: dueSoon.map((issue) => emailItem(issue, `Due ${formatDue(issue.dueDate!)}`)) },
          ],
          ctaLabel: "Open your work",
          ctaUrl: `${appOrigin()}/your-work`,
          preferencesUrl: preferencesUrl(),
        });
        if (await deliver(subscriber.userId, subscriber.settings.emailFormat, message)) sent += 1;
      }
      await markDigestSent(subscriber.userId, now, "lastDueReminderAt");
    } catch (error) {
      console.error("Failed to send due reminder", subscriber.userId, error);
    }
  }
  return sent;
}

/** Monday email: what the person finished last week and what is due this week. */
export async function sendWeeklySummaries(now = new Date()) {
  const subscribers = await listPersonalDigestSubscribers("weeklySummary", "lastWeeklySummaryAt");
  let sent = 0;
  for (const subscriber of subscribers) {
    if (!isWeeklySummaryDue(subscriber.lastSentAt, now)) continue;
    try {
      const memberIds = await memberIdsFor(subscriber.userId);
      const base = { assigneeId: { in: memberIds }, deletedAt: null, archivedAt: null };
      const [finished, upcoming] = memberIds.length
        ? await Promise.all([
            prisma.issue.findMany({
              where: { ...base, resolvedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, AND: [doneStatusWhere()] },
              select: digestIssueSelect,
              orderBy: { resolvedAt: "desc" },
              take: MAX_ITEMS,
            }),
            prisma.issue.findMany({
              where: {
                ...base,
                dueDate: { not: null, lt: new Date(startOfUtcDay(now) + 7 * DAY_MS) },
                AND: [notDoneStatusWhere()],
              },
              select: digestIssueSelect,
              orderBy: { dueDate: "asc" },
              take: MAX_ITEMS,
            }),
          ])
        : [[], []];
      if (finished.length + upcoming.length > 0) {
        const { overdue, dueSoon } = splitByDue(upcoming, now);
        const message = renderSectionedDigestEmail({
          subject: `Your week: ${finished.length} done, ${upcoming.length} due`,
          heading: "Your weekly summary",
          sections: [
            { title: "Finished last week", items: finished.map((issue) => emailItem(issue, "Done")) },
            { title: "Overdue", items: overdue.map((issue) => emailItem(issue, `Was due ${formatDue(issue.dueDate!)}`)) },
            { title: "Due this week", items: dueSoon.map((issue) => emailItem(issue, `Due ${formatDue(issue.dueDate!)}`)) },
          ],
          ctaLabel: "Open your work",
          ctaUrl: `${appOrigin()}/your-work`,
          preferencesUrl: preferencesUrl(),
        });
        if (await deliver(subscriber.userId, subscriber.settings.emailFormat, message)) sent += 1;
      }
      await markDigestSent(subscriber.userId, now, "lastWeeklySummaryAt");
    } catch (error) {
      console.error("Failed to send weekly summary", subscriber.userId, error);
    }
  }
  return sent;
}
