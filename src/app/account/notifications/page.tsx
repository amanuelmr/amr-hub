"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Filter, Mail, Trash2 } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import {
  describeSchedule,
  NOTIFICATION_EVENTS,
  type EmailDigest,
  type FilterSubscription,
  type NotificationChannel,
  type NotificationSettings,
  type NotificationType,
} from "../../data/notifications";
import { WorkspaceLoading } from "../../components/WorkspaceLoading";

type PreferencesResponse = {
  settings: NotificationSettings;
  subscriptions: FilterSubscription[];
};

type SettingsUpdate = {
  events?: Partial<Record<NotificationType, Partial<Record<NotificationChannel, boolean>>>>;
  notifyOwnChanges?: boolean;
  emailDigest?: EmailDigest;
};

function applyLocal(settings: NotificationSettings, update: SettingsUpdate) {
  const next: NotificationSettings = {
    ...settings,
    events: { ...settings.events },
  };
  for (const [type, channels] of Object.entries(update.events ?? {})) {
    const key = type as NotificationType;
    next.events[key] = { ...next.events[key], ...channels };
  }
  if (update.notifyOwnChanges !== undefined) next.notifyOwnChanges = update.notifyOwnChanges;
  if (update.emailDigest !== undefined) next.emailDigest = update.emailDigest;
  return next;
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [subscriptions, setSubscriptions] = useState<FilterSubscription[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [offset] = useState(() => new Date().getTimezoneOffset());

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<PreferencesResponse>("/api/notification-preferences", {
      signal: controller.signal,
    })
      .then((response) => {
        setSettings(response.settings);
        setSubscriptions(response.subscriptions);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Notification settings could not be loaded",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const save = async (update: SettingsUpdate) => {
    if (!settings) return;
    const previous = settings;
    setSettings(applyLocal(settings, update));
    setStatus("saving");
    setSaveError(null);
    try {
      const response = await apiRequest<{ settings: NotificationSettings }>(
        "/api/notification-preferences",
        { method: "PUT", body: JSON.stringify(update) },
      );
      setSettings(response.settings);
      setStatus("saved");
    } catch (error) {
      setSettings(previous);
      setStatus("error");
      setSaveError(error instanceof Error ? error.message : "Settings could not be saved");
    }
  };

  const unsubscribe = async (subscription: FilterSubscription) => {
    setRemoving(subscription.id);
    try {
      await apiRequest(
        `/api/filters/${encodeURIComponent(subscription.savedViewId)}/subscriptions?subscriptionId=${encodeURIComponent(subscription.id)}`,
        { method: "DELETE" },
      );
      setSubscriptions((current) => current.filter((item) => item.id !== subscription.id));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Subscription could not be removed");
    } finally {
      setRemoving(null);
    }
  };

  if (!settings && !loadError) return <WorkspaceLoading label="notification settings" />;

  return (
    <div className="page notification-settings-page">
      <header className="jira-page-header">
        <div>
          <nav className="notification-settings-crumbs" aria-label="Breadcrumb">
            <Link href="/account">Account settings</Link>
            <span aria-hidden="true">/</span>
          </nav>
          <h1 className="jira-page-title">Notifications</h1>
        </div>
        <p className="notification-settings-status" role="status" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "All changes saved" : ""}
        </p>
      </header>

      {loadError && (
        <p className="form-submit-error" role="alert">
          {loadError}
        </p>
      )}
      {saveError && (
        <p className="form-submit-error" role="alert">
          {saveError}
        </p>
      )}

      {settings && (
        <>
          <section className="notification-settings-card" aria-labelledby="notify-events-title">
            <header>
              <span aria-hidden="true">
                <BellRing size={16} />
              </span>
              <div>
                <h2 id="notify-events-title">Work item updates</h2>
                <p>Choose what you hear about and where. Changes save automatically.</p>
              </div>
            </header>

            <div className="notification-matrix" role="table" aria-label="Notification channels">
              <div className="notification-matrix-row notification-matrix-head" role="row">
                <span role="columnheader">Event</span>
                <span role="columnheader">In app</span>
                <span role="columnheader">Email</span>
              </div>
              {NOTIFICATION_EVENTS.map((event) => (
                <div className="notification-matrix-row" role="row" key={event.type}>
                  <span role="cell" className="notification-matrix-event">
                    <strong>{event.label}</strong>
                    <small>{event.description}</small>
                  </span>
                  {(["inApp", "email"] as const).map((channel) => (
                    <span role="cell" key={channel} className="notification-matrix-toggle">
                      <input
                        type="checkbox"
                        role="switch"
                        className="notification-switch"
                        checked={settings.events[event.type][channel]}
                        aria-label={`${event.label}: ${channel === "inApp" ? "in app" : "email"}`}
                        onChange={(change) =>
                          void save({
                            events: { [event.type]: { [channel]: change.target.checked } },
                          })
                        }
                      />
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <label className="notification-own-changes">
              <input
                type="checkbox"
                role="switch"
                className="notification-switch"
                checked={settings.notifyOwnChanges}
                onChange={(change) => void save({ notifyOwnChanges: change.target.checked })}
              />
              <span>
                <strong>Notify me about my own changes</strong>
                <small>Get notifications for updates you make yourself.</small>
              </span>
            </label>
          </section>

          <section className="notification-settings-card" aria-labelledby="notify-email-title">
            <header>
              <span aria-hidden="true">
                <Mail size={16} />
              </span>
              <div>
                <h2 id="notify-email-title">Email frequency</h2>
                <p>How email notifications for the events above reach you.</p>
              </div>
            </header>
            <div className="notification-digest-options" role="radiogroup" aria-label="Email frequency">
              {(
                [
                  ["IMMEDIATE", "Immediately", "Send an email as soon as something happens."],
                  ["DAILY", "Once a day", "Bundle the day's updates into one digest email."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="notification-digest-option">
                  <input
                    type="radio"
                    name="email-digest"
                    value={value}
                    checked={settings.emailDigest === value}
                    onChange={() => void save({ emailDigest: value })}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="notification-settings-card" aria-labelledby="notify-subs-title">
            <header>
              <span aria-hidden="true">
                <Filter size={16} />
              </span>
              <div>
                <h2 id="notify-subs-title">My filter subscriptions</h2>
                <p>
                  Scheduled emails with a filter&apos;s results. Subscribe from{" "}
                  <Link href="/filters">Filters</Link>.
                </p>
              </div>
            </header>
            {subscriptions.length === 0 ? (
              <p className="notification-settings-empty">
                You aren&apos;t subscribed to any filters.
              </p>
            ) : (
              <ul className="notification-subscription-list">
                {subscriptions.map((subscription) => (
                  <li key={subscription.id}>
                    <span>
                      <Link href={`/issues?filter=${encodeURIComponent(subscription.savedViewId)}`}>
                        {subscription.filterName}
                      </Link>
                      <small>
                        {describeSchedule(subscription, offset)}
                        {subscription.lastSentAt
                          ? ` · last sent ${new Date(subscription.lastSentAt).toLocaleString()}`
                          : " · not sent yet"}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={removing === subscription.id}
                      onClick={() => void unsubscribe(subscription)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      {removing === subscription.id ? "Removing…" : "Unsubscribe"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
