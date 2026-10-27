import { homepagePath, type NotificationSettings } from "../data/notifications";

/** The signed-in person's chosen homepage; Your work when it can't be read. */
export async function fetchHomepagePath() {
  try {
    const response = await fetch("/api/notification-preferences");
    if (!response.ok) return homepagePath("your-work");
    const { settings } = (await response.json()) as { settings: NotificationSettings };
    return homepagePath(settings.homepage);
  } catch {
    return homepagePath("your-work");
  }
}
