"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Circle, CircleDot, Settings } from "lucide-react";
import { useNotifications } from "../NotificationProvider";
import {
  notificationGroup,
  type Notification,
  type NotificationGroup,
} from "../data/notifications";
import { selectedIssueHref } from "./issue/selectedIssue";
import { useOnClickOutside } from "./useOnClickOutside";

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

const TABS: { value: NotificationGroup; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "watching", label: "Watching" },
];

export function NotificationInbox({
  openUpward = false,
  align = "start",
}: {
  openUpward?: boolean;
  /** "end" anchors the dropdown to the bell's right edge (top-bar placement). */
  align?: "start" | "end";
}) {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, setReadState, markAllAsRead } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<NotificationGroup>("direct");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setIsOpen(false));

  const unreadByTab = useMemo(() => {
    const counts: Record<NotificationGroup, number> = { direct: 0, watching: 0 };
    for (const notification of notifications) {
      if (!notification.isRead) counts[notificationGroup(notification.type)] += 1;
    }
    return counts;
  }, [notifications]);

  const sections = useMemo(() => {
    const visible = notifications.filter(
      (notification) =>
        notificationGroup(notification.type) === tab &&
        (!unreadOnly || !notification.isRead),
    );
    const today = visible.filter((notification) => isToday(notification.createdAt));
    const earlier = visible.filter((notification) => !isToday(notification.createdAt));
    return [
      { label: "Today", items: today },
      { label: "Earlier", items: earlier },
    ].filter((section) => section.items.length > 0);
  }, [notifications, tab, unreadOnly]);

  const openNotification = (notification: Notification) => {
    if (!notification.isRead) void markAsRead(notification.id);
    if (!notification.issueId) return;
    setIsOpen(false);
    // Opens the issue modal over the current page (Jira's ?selectedIssue).
    router.push(
      selectedIssueHref(
        window.location.pathname,
        window.location.search,
        notification.issueId,
      ),
      { scroll: false },
    );
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="notification-bell"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={isOpen}
      >
        <Bell size={16} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`notification-dropdown notification-inbox ${openUpward ? "opens-upward" : ""} ${
            align === "end" ? "align-end" : ""
          }`}
          role="dialog"
          aria-label="Notifications"
        >
          <header className="notification-dropdown-header notification-inbox-header">
            <h2>Notifications</h2>
            <label className="notification-unread-toggle">
              <span>Only show unread</span>
              <input
                type="checkbox"
                role="switch"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
            </label>
            <Link
              href="/account/notifications"
              className="notification-settings-link"
              aria-label="Notification settings"
              title="Notification settings"
              onClick={() => setIsOpen(false)}
            >
              <Settings size={14} aria-hidden="true" />
            </Link>
          </header>

          <div className="notification-inbox-tabs">
            <div role="tablist" aria-label="Notification type">
              {TABS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={tab === value ? "active" : ""}
                  onClick={() => setTab(value)}
                >
                  {label}
                  {unreadByTab[value] > 0 && (
                    <span className="notification-tab-count">
                      {unreadByTab[value]}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="notification-mark-all"
              disabled={unreadCount === 0}
              onClick={() => void markAllAsRead()}
            >
              Mark all as read
            </button>
          </div>

          {sections.length === 0 ? (
            <p className="notification-empty">
              {unreadOnly
                ? "You have no unread notifications."
                : tab === "direct"
                  ? "You're all caught up. When someone assigns, mentions or shares work with you, it shows up here."
                  : "Nothing new on the work items you watch."}
            </p>
          ) : (
            <div className="notification-list" role="tabpanel">
              {sections.map((section) => (
                <section key={section.label} className="notification-section">
                  <h3 className="notification-section-label">{section.label}</h3>
                  {section.items.map((notification) => (
                    <div
                      key={notification.id}
                      className={`notification-item notification-row ${
                        notification.isRead ? "" : "unread"
                      }`.trim()}
                    >
                      <button
                        type="button"
                        className="notification-row-main"
                        onClick={() => openNotification(notification)}
                      >
                        <span className="notification-item-title">
                          {notification.title}
                        </span>
                        <span className="notification-item-body">
                          {notification.body}
                        </span>
                        <span className="notification-item-time">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="notification-read-toggle"
                        aria-label={
                          notification.isRead ? "Mark as unread" : "Mark as read"
                        }
                        title={notification.isRead ? "Mark as unread" : "Mark as read"}
                        onClick={() =>
                          void setReadState(notification.id, !notification.isRead)
                        }
                      >
                        {notification.isRead ? (
                          <Circle size={12} aria-hidden="true" />
                        ) : (
                          <CircleDot size={12} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
