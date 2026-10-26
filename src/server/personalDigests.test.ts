import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

const { isDueReminderDue, isWeeklySummaryDue, splitByDue } = await import("./personalDigests");
const { normalizeNotificationSettings, homepagePath } = await import("../app/data/notifications");
const { applySettingsUpdate, notificationSettingsUpdateSchema } = await import(
  "./notificationPreferences"
);
const { withEmailFormat } = await import("./email");

describe("personal digest schedule", () => {
  it("sends due reminders about once a day", () => {
    const now = new Date("2026-10-26T08:00:00Z");
    expect(isDueReminderDue(null, now)).toBe(true);
    expect(isDueReminderDue(new Date("2026-10-25T08:01:00Z"), now)).toBe(true);
    expect(isDueReminderDue(new Date("2026-10-26T02:00:00Z"), now)).toBe(false);
  });

  it("sends the weekly summary on Mondays only, once", () => {
    const monday = new Date("2026-10-26T08:00:00Z");
    expect(isWeeklySummaryDue(null, monday)).toBe(true);
    expect(isWeeklySummaryDue(new Date("2026-10-19T08:00:00Z"), monday)).toBe(true);
    expect(isWeeklySummaryDue(new Date("2026-10-26T07:00:00Z"), monday)).toBe(false);
    expect(isWeeklySummaryDue(null, new Date("2026-10-27T08:00:00Z"))).toBe(false);
  });

  it("splits overdue work from work due soon", () => {
    const now = new Date("2026-10-26T08:00:00Z");
    const items = [
      { id: "A", dueDate: new Date("2026-10-25T12:00:00Z") },
      { id: "B", dueDate: new Date("2026-10-26T12:00:00Z") },
      { id: "C", dueDate: null },
    ];
    const { overdue, dueSoon } = splitByDue(items, now);
    expect(overdue.map((item) => item.id)).toEqual(["A"]);
    expect(dueSoon.map((item) => item.id)).toEqual(["B"]);
  });
});

describe("personal settings", () => {
  it("defaults and keeps valid values only", () => {
    const defaults = normalizeNotificationSettings({});
    expect(defaults).toMatchObject({
      autoWatch: true,
      emailFormat: "HTML",
      dueReminders: false,
      weeklySummary: false,
      homepage: "your-work",
    });
    expect(
      normalizeNotificationSettings({ homepage: "nowhere", emailFormat: "PDF", autoWatch: "no" }),
    ).toMatchObject({ homepage: "your-work", emailFormat: "HTML", autoWatch: true });
  });

  it("applies updates and rejects unknown homepages", () => {
    const next = applySettingsUpdate(normalizeNotificationSettings({}), {
      homepage: "projects",
      autoWatch: false,
      emailFormat: "TEXT",
      dueReminders: true,
    });
    expect(next).toMatchObject({
      homepage: "projects",
      autoWatch: false,
      emailFormat: "TEXT",
      dueReminders: true,
    });
    expect(homepagePath(next.homepage)).toBe("/projects");
    expect(notificationSettingsUpdateSchema.safeParse({ homepage: "admin" }).success).toBe(false);
  });

  it("drops the HTML part for plain text emails", () => {
    const message = { to: "a@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };
    expect(withEmailFormat(message, "HTML")).toEqual(message);
    expect(withEmailFormat(message, "TEXT")).toEqual({ to: "a@example.com", subject: "Hi", text: "Hi" });
  });
});
