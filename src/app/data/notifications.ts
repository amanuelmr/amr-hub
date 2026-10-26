export type NotificationType =
  | "ISSUE_ASSIGNED"
  | "ISSUE_STATUS_CHANGED"
  | "ISSUE_COMMENTED"
  | "ISSUE_MENTIONED"
  | "ISSUE_SHARED"
  | "ISSUE_ATTACHMENT_ADDED"
  | "AUTOMATION";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  issueId: string | null;
  projectId: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  notifications: Notification[];
  unreadCount: number;
  nextCursor: string | null;
};

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export type NotificationChannel = "inApp" | "email";

/** "Direct" events are about you; "Watching" events are about issues you follow. */
export type NotificationGroup = "direct" | "watching";

export type NotificationEventDefinition = {
  type: NotificationType;
  label: string;
  description: string;
  group: NotificationGroup;
};

export const NOTIFICATION_EVENTS: readonly NotificationEventDefinition[] = [
  {
    type: "ISSUE_ASSIGNED",
    label: "Assigned to me",
    description: "Someone makes you the assignee of a work item.",
    group: "direct",
  },
  {
    type: "ISSUE_MENTIONED",
    label: "Mentioned",
    description: "Someone @mentions you in a description or comment.",
    group: "direct",
  },
  {
    type: "ISSUE_SHARED",
    label: "Issue shared with me",
    description: "Someone shares a work item with you.",
    group: "direct",
  },
  {
    type: "ISSUE_COMMENTED",
    label: "Comment on watched issue",
    description: "Someone comments on a work item you watch.",
    group: "watching",
  },
  {
    type: "ISSUE_STATUS_CHANGED",
    label: "Status change on watched issue",
    description: "A work item you watch moves to another status.",
    group: "watching",
  },
  {
    type: "ISSUE_ATTACHMENT_ADDED",
    label: "Attachment added",
    description: "Someone attaches a file to a work item you're involved in.",
    group: "watching",
  },
  {
    type: "AUTOMATION",
    label: "Automation rules",
    description: "A project automation rule sends you a notification.",
    group: "direct",
  },
];

export const NOTIFICATION_TYPES = NOTIFICATION_EVENTS.map((event) => event.type);

export function notificationGroup(type: NotificationType): NotificationGroup {
  return NOTIFICATION_EVENTS.find((event) => event.type === type)?.group ?? "watching";
}

export type EmailDigest = "IMMEDIATE" | "DAILY";

export type EmailFormat = "HTML" | "TEXT";

/** Where "home" (sign-in, the logo) takes each person. */
export const HOMEPAGES = [
  { key: "your-work", label: "Your work", path: "/your-work" },
  { key: "overview", label: "Overview", path: "/dashboard" },
  { key: "projects", label: "Projects", path: "/projects" },
  { key: "dashboards", label: "Dashboards", path: "/dashboards" },
  { key: "issues", label: "Search work items", path: "/issues" },
  { key: "filters", label: "Filters", path: "/filters" },
] as const;

export type Homepage = (typeof HOMEPAGES)[number]["key"];

export function homepagePath(homepage: Homepage) {
  return HOMEPAGES.find((option) => option.key === homepage)?.path ?? "/your-work";
}

export type ChannelSettings = { inApp: boolean; email: boolean };

export type NotificationSettings = {
  events: Record<NotificationType, ChannelSettings>;
  /** Jira's "Notify me about my own changes" — off by default. */
  notifyOwnChanges: boolean;
  emailDigest: EmailDigest;
  /** Plain text emails for people who prefer them. */
  emailFormat: EmailFormat;
  /** Watch work items you create or comment on. */
  autoWatch: boolean;
  /** A daily email of your work that is due soon or overdue. */
  dueReminders: boolean;
  /** A Monday email of what you finished and what is next. */
  weeklySummary: boolean;
  homepage: Homepage;
};

const EMAIL_ON_BY_DEFAULT = new Set<NotificationType>([
  "ISSUE_ASSIGNED",
  "ISSUE_MENTIONED",
  "ISSUE_SHARED",
]);

export function defaultNotificationSettings(): NotificationSettings {
  return {
    events: Object.fromEntries(
      NOTIFICATION_TYPES.map((type) => [
        type,
        { inApp: true, email: EMAIL_ON_BY_DEFAULT.has(type) },
      ]),
    ) as Record<NotificationType, ChannelSettings>,
    notifyOwnChanges: false,
    emailDigest: "IMMEDIATE",
    emailFormat: "HTML",
    autoWatch: true,
    dueReminders: false,
    weeklySummary: false,
    homepage: "your-work",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges stored (possibly partial, older or corrupt) settings over the
 * defaults so a new event type or a bad row never breaks delivery.
 */
export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const settings = defaultNotificationSettings();
  if (!isRecord(raw)) return settings;

  if (isRecord(raw.events)) {
    for (const type of NOTIFICATION_TYPES) {
      const stored = raw.events[type];
      if (!isRecord(stored)) continue;
      if (typeof stored.inApp === "boolean") settings.events[type].inApp = stored.inApp;
      if (typeof stored.email === "boolean") settings.events[type].email = stored.email;
    }
  }
  if (typeof raw.notifyOwnChanges === "boolean") {
    settings.notifyOwnChanges = raw.notifyOwnChanges;
  }
  if (raw.emailDigest === "IMMEDIATE" || raw.emailDigest === "DAILY") {
    settings.emailDigest = raw.emailDigest;
  }
  if (raw.emailFormat === "HTML" || raw.emailFormat === "TEXT") {
    settings.emailFormat = raw.emailFormat;
  }
  for (const key of ["autoWatch", "dueReminders", "weeklySummary"] as const) {
    if (typeof raw[key] === "boolean") settings[key] = raw[key];
  }
  if (HOMEPAGES.some((option) => option.key === raw.homepage)) {
    settings.homepage = raw.homepage as Homepage;
  }
  return settings;
}

/** Notification types the inbox shows for these settings. */
export function inAppTypes(settings: NotificationSettings): NotificationType[] {
  return NOTIFICATION_TYPES.filter((type) => settings.events[type].inApp);
}

/* ------------------------------------------------------------------ */
/* Filter subscriptions                                                */
/* ------------------------------------------------------------------ */

export type SubscriptionFrequency = "DAILY" | "WEEKLY";

export type FilterSubscription = {
  id: string;
  savedViewId: string;
  filterName: string;
  frequency: SubscriptionFrequency;
  /** Hour of day, UTC (0-23). */
  hour: number;
  /** Day of week, UTC (0 = Sunday), weekly only. */
  weekday: number | null;
  lastSentAt: string | null;
  createdAt: string;
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Converts a local weekday/hour to UTC (or back with `direction: "fromUtc"`)
 * using the browser's offset on a reference date.
 */
export function shiftScheduleTimezone(
  schedule: { hour: number; weekday: number | null },
  offsetMinutes: number,
  direction: "toUtc" | "fromUtc",
) {
  // getTimezoneOffset() is UTC - local, in minutes.
  const sign = direction === "toUtc" ? 1 : -1;
  const totalMinutes = schedule.hour * 60 + sign * offsetMinutes;
  const dayShift = Math.floor(totalMinutes / 1440);
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minutesInDay / 60);
  const weekday =
    schedule.weekday === null ? null : (((schedule.weekday + dayShift) % 7) + 7) % 7;
  return { hour, weekday };
}

/** Human description of a UTC schedule in the viewer's local time. */
export function describeSchedule(
  subscription: Pick<FilterSubscription, "frequency" | "hour" | "weekday">,
  offsetMinutes: number,
) {
  const local = shiftScheduleTimezone(subscription, offsetMinutes, "fromUtc");
  const time = `${String(local.hour).padStart(2, "0")}:00`;
  if (subscription.frequency === "WEEKLY" && local.weekday !== null) {
    return `Every ${WEEKDAY_NAMES[local.weekday]} at ${time}`;
  }
  return `Every day at ${time}`;
}
