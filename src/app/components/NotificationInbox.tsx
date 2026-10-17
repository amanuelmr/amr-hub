"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "../NotificationProvider";
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

export function NotificationInbox({
  openUpward = false,
  align = "start",
}: {
  openUpward?: boolean;
  /** "end" anchors the dropdown to the bell's right edge (top-bar placement). */
  align?: "start" | "end";
}) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setIsOpen(false));

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
          className={`notification-dropdown ${openUpward ? "opens-upward" : ""} ${
            align === "end" ? "align-end" : ""
          }`}
          role="dialog"
          aria-label="Notifications"
        >
          <header className="notification-dropdown-header">
            <h2>Notifications</h2>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllAsRead()}>
                Mark all read
              </button>
            )}
          </header>

          {notifications.length === 0 ? (
            <p className="notification-empty">
              You&apos;re all caught up. New activity on your issues will show
              up here.
            </p>
          ) : (
            <div className="notification-list">
              {notifications.map((notification) => {
                const content = (
                  <>
                    <span className="notification-item-title">
                      {notification.title}
                    </span>
                    <p className="notification-item-body">
                      {notification.body}
                    </p>
                    <span className="notification-item-time">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </>
                );

                const className = `notification-item ${
                  notification.isRead ? "" : "unread"
                }`.trim();

                if (notification.issueId) {
                  return (
                    <Link
                      href={`/issues/${notification.issueId}`}
                      className={className}
                      key={notification.id}
                      onClick={() => {
                        setIsOpen(false);
                        if (!notification.isRead) void markAsRead(notification.id);
                      }}
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <button
                    type="button"
                    className={className}
                    key={notification.id}
                    onClick={() => void markAsRead(notification.id)}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
