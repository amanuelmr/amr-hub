"use client";

import { type FormEvent, useState } from "react";
import { Trash2, X } from "lucide-react";
import { apiRequest } from "../IssueProvider";
import {
  describeSchedule,
  shiftScheduleTimezone,
  WEEKDAY_NAMES,
  type FilterSubscription,
  type SubscriptionFrequency,
} from "../data/notifications";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Jira's "Subscribe" dialog for a saved filter: pick daily/weekly, the day
 * and the hour in local time; the schedule is stored in UTC.
 */
export function FilterSubscribeDialog({
  filter,
  subscriptions,
  onClose,
  onChange,
}: {
  filter: { id: string; name: string };
  subscriptions: FilterSubscription[];
  onClose: () => void;
  onChange: (subscriptions: FilterSubscription[]) => void;
}) {
  const [offset] = useState(() => new Date().getTimezoneOffset());
  const [frequency, setFrequency] = useState<SubscriptionFrequency>("DAILY");
  const [weekday, setWeekday] = useState(1);
  const [hour, setHour] = useState(9);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "local time";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const utc = shiftScheduleTimezone(
      { hour, weekday: frequency === "WEEKLY" ? weekday : null },
      offset,
      "toUtc",
    );
    try {
      const created = await apiRequest<FilterSubscription>(
        `/api/filters/${encodeURIComponent(filter.id)}/subscriptions`,
        {
          method: "POST",
          body: JSON.stringify({ frequency, hour: utc.hour, weekday: utc.weekday }),
        },
      );
      onChange([...subscriptions, created]);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subscription could not be created");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (subscription: FilterSubscription) => {
    setError(null);
    try {
      await apiRequest(
        `/api/filters/${encodeURIComponent(filter.id)}/subscriptions?subscriptionId=${encodeURIComponent(subscription.id)}`,
        { method: "DELETE" },
      );
      onChange(subscriptions.filter((item) => item.id !== subscription.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subscription could not be removed");
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="save-view-dialog filter-subscribe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-filter-title"
      >
        <header>
          <div>
            <h2 id="subscribe-filter-title">Subscribe to “{filter.name}”</h2>
            <p>Get the filter&apos;s results by email on a schedule (up to 50 work items).</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {subscriptions.length > 0 && (
          <ul className="filter-subscribe-existing" aria-label="Your subscriptions to this filter">
            {subscriptions.map((subscription) => (
              <li key={subscription.id}>
                <span>{describeSchedule(subscription, offset)}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Unsubscribe: ${describeSchedule(subscription, offset)}`}
                  title="Unsubscribe"
                  onClick={() => void remove(subscription)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit}>
          <fieldset className="filter-subscribe-frequency">
            <legend>Frequency</legend>
            {(
              [
                ["DAILY", "Daily"],
                ["WEEKLY", "Weekly"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="subscription-frequency"
                  value={value}
                  checked={frequency === value}
                  onChange={() => setFrequency(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="filter-subscribe-when">
            {frequency === "WEEKLY" && (
              <label className="form-field">
                <span>Day</span>
                <select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                  {WEEKDAY_NAMES.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              <span>Time</span>
              <select value={hour} onChange={(event) => setHour(Number(event.target.value))}>
                {HOURS.map((value) => (
                  <option key={value} value={value}>
                    {String(value).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="field-meta">Times are in your time zone ({timeZone}).</p>
          {error && (
            <p className="form-submit-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? "Subscribing..." : "Subscribe"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
