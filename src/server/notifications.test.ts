import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const {
  defaultNotificationSettings,
  normalizeNotificationSettings,
  shiftScheduleTimezone,
  describeSchedule,
  inAppTypes,
} = await import("../app/data/notifications");
const { planRecipients, isDigestDue } = await import("./notifications");
const { applySettingsUpdate, notificationSettingsUpdateSchema } = await import(
  "./notificationPreferences"
);
const { isSubscriptionDue, latestScheduledSlot, createSubscriptionSchema } =
  await import("./filterSubscriptions");
const { shouldLogNotificationEmails } = await import("./email");
const { renderIssueNotificationEmail, renderFilterSubscriptionEmail, escapeHtml } =
  await import("./emailTemplates");

describe("notification settings", () => {
  it("defaults to in-app for everything and email for direct events", () => {
    const settings = defaultNotificationSettings();
    expect(Object.values(settings.events).every((channels) => channels.inApp)).toBe(true);
    expect(settings.events.ISSUE_ASSIGNED.email).toBe(true);
    expect(settings.events.ISSUE_MENTIONED.email).toBe(true);
    expect(settings.events.ISSUE_SHARED.email).toBe(true);
    expect(settings.events.ISSUE_COMMENTED.email).toBe(false);
    expect(settings.notifyOwnChanges).toBe(false);
    expect(settings.emailDigest).toBe("IMMEDIATE");
  });

  it("merges partial or corrupt stored settings over defaults", () => {
    const settings = normalizeNotificationSettings({
      events: { ISSUE_COMMENTED: { email: true }, BOGUS: { inApp: false }, ISSUE_ASSIGNED: "x" },
      emailDigest: "HOURLY",
      notifyOwnChanges: true,
    });
    expect(settings.events.ISSUE_COMMENTED).toEqual({ inApp: true, email: true });
    expect(settings.events.ISSUE_ASSIGNED).toEqual({ inApp: true, email: true });
    expect(settings.emailDigest).toBe("IMMEDIATE");
    expect(settings.notifyOwnChanges).toBe(true);
    expect(normalizeNotificationSettings(null)).toEqual(defaultNotificationSettings());
  });

  it("applies updates and validates event keys", () => {
    const next = applySettingsUpdate(defaultNotificationSettings(), {
      events: { ISSUE_MENTIONED: { inApp: false } },
      emailDigest: "DAILY",
    });
    expect(next.events.ISSUE_MENTIONED).toEqual({ inApp: false, email: true });
    expect(next.emailDigest).toBe("DAILY");
    expect(inAppTypes(next)).not.toContain("ISSUE_MENTIONED");
    expect(
      notificationSettingsUpdateSchema.safeParse({ events: { NOPE: { email: true } } }).success,
    ).toBe(false);
    expect(notificationSettingsUpdateSchema.safeParse({ emailDigest: "WEEKLY" }).success).toBe(
      false,
    );
  });
});

describe("planRecipients", () => {
  const defaults = defaultNotificationSettings();

  it("dedupes, drops empty ids and the actor by default", () => {
    const plans = planRecipients(["a", "a", null, undefined, "actor"], "ISSUE_ASSIGNED", "actor", () => defaults);
    expect(plans).toEqual([{ userId: "a", inApp: true, email: true }]);
  });

  it("keeps the actor when they opted into their own changes", () => {
    const own = { ...defaults, notifyOwnChanges: true };
    const plans = planRecipients(["actor"], "ISSUE_COMMENTED", "actor", () => own);
    expect(plans).toEqual([{ userId: "actor", inApp: true, email: false }]);
  });

  it("respects channels and the daily digest", () => {
    const off = normalizeNotificationSettings({
      events: { ISSUE_ASSIGNED: { inApp: false, email: false } },
    });
    const digest = { ...defaults, emailDigest: "DAILY" as const };
    expect(planRecipients(["a"], "ISSUE_ASSIGNED", null, () => off)).toEqual([]);
    expect(planRecipients(["a"], "ISSUE_ASSIGNED", null, () => digest)).toEqual([
      { userId: "a", inApp: true, email: false },
    ]);
  });
});

describe("schedules", () => {
  it("converts local hours/weekdays to UTC and back", () => {
    // UTC+2 (offset -120): Monday 01:00 local is Sunday 23:00 UTC.
    expect(shiftScheduleTimezone({ hour: 1, weekday: 1 }, -120, "toUtc")).toEqual({
      hour: 23,
      weekday: 0,
    });
    expect(shiftScheduleTimezone({ hour: 23, weekday: 0 }, -120, "fromUtc")).toEqual({
      hour: 1,
      weekday: 1,
    });
    // UTC-5 (offset 300): 21:00 local is 02:00 UTC the next day.
    expect(shiftScheduleTimezone({ hour: 21, weekday: 5 }, 300, "toUtc")).toEqual({
      hour: 2,
      weekday: 6,
    });
    expect(describeSchedule({ frequency: "DAILY", hour: 9, weekday: null }, 0)).toBe(
      "Every day at 09:00",
    );
  });

  it("finds the latest daily and weekly slot", () => {
    const now = new Date("2026-10-14T08:30:00Z"); // Wednesday
    expect(latestScheduledSlot({ frequency: "DAILY", hour: 8, weekday: null }, now).toISOString()).toBe(
      "2026-10-14T08:00:00.000Z",
    );
    expect(latestScheduledSlot({ frequency: "DAILY", hour: 9, weekday: null }, now).toISOString()).toBe(
      "2026-10-13T09:00:00.000Z",
    );
    expect(latestScheduledSlot({ frequency: "WEEKLY", hour: 9, weekday: 1 }, now).toISOString()).toBe(
      "2026-10-12T09:00:00.000Z",
    );
    expect(latestScheduledSlot({ frequency: "WEEKLY", hour: 9, weekday: 3 }, now).toISOString()).toBe(
      "2026-10-07T09:00:00.000Z",
    );
  });

  it("is due once per slot and waits for the first slot after creation", () => {
    const now = new Date("2026-10-14T08:30:00Z");
    const base = { frequency: "DAILY", hour: 8, weekday: null };
    expect(isSubscriptionDue({ ...base, lastSentAt: null, createdAt: new Date("2026-10-13T12:00:00Z") }, now)).toBe(true);
    expect(isSubscriptionDue({ ...base, lastSentAt: null, createdAt: new Date("2026-10-14T08:10:00Z") }, now)).toBe(false);
    expect(
      isSubscriptionDue(
        { ...base, lastSentAt: new Date("2026-10-14T08:05:00Z"), createdAt: new Date("2026-10-01T00:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("validates subscription input", () => {
    expect(createSubscriptionSchema.safeParse({ frequency: "WEEKLY", hour: 9 }).success).toBe(false);
    expect(createSubscriptionSchema.safeParse({ frequency: "DAILY", hour: 24 }).success).toBe(false);
    expect(createSubscriptionSchema.safeParse({ frequency: "WEEKLY", hour: 9, weekday: 2 }).success).toBe(true);
  });

  it("sends a digest roughly once a day", () => {
    const now = new Date("2026-10-14T08:00:00Z");
    expect(isDigestDue(null, now)).toBe(true);
    expect(isDigestDue(new Date("2026-10-13T08:05:00Z"), now)).toBe(true);
    expect(isDigestDue(new Date("2026-10-14T01:00:00Z"), now)).toBe(false);
  });
});

describe("email delivery", () => {
  it("logs instead of sending for placeholder keys and local development", () => {
    expect(shouldLogNotificationEmails({ RESEND_API_KEY: "re_your_api_key", NODE_ENV: "production" })).toBe(true);
    expect(shouldLogNotificationEmails({ RESEND_API_KEY: "re_ci_key", NODE_ENV: "production" })).toBe(true);
    expect(shouldLogNotificationEmails({ RESEND_API_KEY: "re_placeholder", NODE_ENV: "production" })).toBe(true);
    expect(shouldLogNotificationEmails({ RESEND_API_KEY: "re_real", NODE_ENV: "production" })).toBe(false);
    expect(shouldLogNotificationEmails({ RESEND_API_KEY: "re_real", NODE_ENV: "development" })).toBe(true);
    expect(
      shouldLogNotificationEmails({
        RESEND_API_KEY: "re_real",
        NODE_ENV: "development",
        NOTIFICATION_EMAIL_DELIVERY: "send",
      }),
    ).toBe(false);
  });

  it("escapes user content in templates", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    const email = renderIssueNotificationEmail({
      summary: "Ada assigned WEB-1 to you",
      issueKey: "WEB-1",
      issueTitle: "<script>alert(1)</script>",
      url: "https://app.test/issues/WEB-1",
      preferencesUrl: "https://app.test/account/notifications",
    });
    expect(email.subject).toBe("[WEB-1] <script>alert(1)</script>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("https://app.test/issues/WEB-1");
    expect(email.text).toContain("Ada assigned WEB-1 to you");

    const filter = renderFilterSubscriptionEmail({
      filterName: "My open",
      filterUrl: "https://app.test/issues?filter=1",
      issues: [
        { issueKey: "WEB-2", issueTitle: "Bug", status: "To Do", assignee: null, url: "https://app.test/issues/WEB-2" },
      ],
      total: 70,
      preferencesUrl: "https://app.test/account/notifications",
    });
    expect(filter.text).toContain("Showing 1 of 70 work items.");
    expect(filter.html).toContain("Unassigned");
  });
});
