import { z } from "zod";
import prisma from "../../prisma/client";
import {
  NOTIFICATION_TYPES,
  normalizeNotificationSettings,
  type NotificationSettings,
  type NotificationType,
} from "../app/data/notifications";

const channelSchema = z
  .object({ inApp: z.boolean().optional(), email: z.boolean().optional() })
  .strict();

/** PUT body: any subset of the settings; omitted keys keep their value. */
export const notificationSettingsUpdateSchema = z
  .object({
    events: z
      .record(z.string(), channelSchema)
      .refine(
        (events) =>
          Object.keys(events).every((key) =>
            (NOTIFICATION_TYPES as string[]).includes(key),
          ),
        { message: "Unknown notification event" },
      )
      .optional(),
    notifyOwnChanges: z.boolean().optional(),
    emailDigest: z.enum(["IMMEDIATE", "DAILY"]).optional(),
  })
  .strict();

export type NotificationSettingsUpdate = z.infer<
  typeof notificationSettingsUpdateSchema
>;

/** Internal bookkeeping kept next to the user's settings in the same JSON. */
type StoredSettings = NotificationSettings & { lastDigestAt?: string };

function parseStored(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function lastDigestAtOf(raw: Record<string, unknown>) {
  return typeof raw.lastDigestAt === "string" ? raw.lastDigestAt : undefined;
}

export function applySettingsUpdate(
  current: NotificationSettings,
  update: NotificationSettingsUpdate,
): NotificationSettings {
  const next = normalizeNotificationSettings(current);
  for (const [type, channels] of Object.entries(update.events ?? {})) {
    const key = type as NotificationType;
    if (channels.inApp !== undefined) next.events[key].inApp = channels.inApp;
    if (channels.email !== undefined) next.events[key].email = channels.email;
  }
  if (update.notifyOwnChanges !== undefined) {
    next.notifyOwnChanges = update.notifyOwnChanges;
  }
  if (update.emailDigest !== undefined) next.emailDigest = update.emailDigest;
  return next;
}

export async function getNotificationSettings(
  userId: string,
): Promise<NotificationSettings> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  return normalizeNotificationSettings(parseStored(row?.settings));
}

/** Settings for many users at once; users without a row get the defaults. */
export async function getNotificationSettingsFor(userIds: string[]) {
  const rows = userIds.length
    ? await prisma.notificationPreference.findMany({
        where: { userId: { in: userIds } },
      })
    : [];
  const byUser = new Map(rows.map((row) => [row.userId, row.settings]));
  return new Map(
    userIds.map((userId) => [
      userId,
      normalizeNotificationSettings(parseStored(byUser.get(userId))),
    ]),
  );
}

export async function updateNotificationSettings(
  userId: string,
  update: NotificationSettingsUpdate,
) {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  const raw = parseStored(row?.settings);
  const next = applySettingsUpdate(normalizeNotificationSettings(raw), update);
  const stored: StoredSettings = { ...next };
  const lastDigestAt = lastDigestAtOf(raw);
  if (lastDigestAt) stored.lastDigestAt = lastDigestAt;
  // Switching to the daily digest starts the window now, so the first digest
  // doesn't replay older events that were already emailed immediately.
  if (update.emailDigest === "DAILY" && raw.emailDigest !== "DAILY") {
    stored.lastDigestAt = new Date().toISOString();
  }

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, settings: JSON.stringify(stored) },
    update: { settings: JSON.stringify(stored) },
  });
  return next;
}

/** Users on the daily digest, with when their last digest went out. */
export async function listDigestSubscribers() {
  const rows = await prisma.notificationPreference.findMany({
    where: { settings: { contains: '"emailDigest":"DAILY"' } },
  });
  return rows.map((row) => {
    const raw = parseStored(row.settings);
    const lastDigestAt = lastDigestAtOf(raw);
    return {
      userId: row.userId,
      settings: normalizeNotificationSettings(raw),
      lastDigestAt: lastDigestAt ? new Date(lastDigestAt) : null,
    };
  });
}

export async function markDigestSent(userId: string, sentAt: Date) {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return;
  const raw = parseStored(row.settings);
  await prisma.notificationPreference.update({
    where: { userId },
    data: {
      settings: JSON.stringify({ ...raw, lastDigestAt: sentAt.toISOString() }),
    },
  });
}
