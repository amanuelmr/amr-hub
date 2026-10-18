"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CircleDot,
  Clock3,
  Flag,
  Link2,
  ListRestart,
  Paperclip,
  Zap,
  MessageSquare,
  PencilLine,
  Plus,
  Tag,
  UserRound,
} from "lucide-react";
import {
  buildWorkspaceActivity,
  formatActivityTime,
} from "../data/activity";
import type { Issue, IssueActivityType } from "../data/issues";
import { selectedIssueHref } from "./issue/selectedIssue";

const activityVisuals: Record<
  IssueActivityType,
  { icon: typeof CircleDot; tone: string }
> = {
  CREATED: { icon: Plus, tone: "green" },
  STATUS_CHANGED: { icon: ListRestart, tone: "blue" },
  PRIORITY_CHANGED: { icon: CircleDot, tone: "red" },
  ASSIGNEE_CHANGED: { icon: UserRound, tone: "blue" },
  TYPE_CHANGED: { icon: CircleDot, tone: "amber" },
  CONTENT_UPDATED: { icon: PencilLine, tone: "gray" },
  COMMENT_ADDED: { icon: MessageSquare, tone: "green" },
  DUE_DATE_CHANGED: { icon: CalendarClock, tone: "amber" },
  LABELS_CHANGED: { icon: Tag, tone: "blue" },
  CYCLE_CHANGED: { icon: ListRestart, tone: "blue" },
  ESTIMATE_CHANGED: { icon: CircleDot, tone: "amber" },
  PARENT_CHANGED: { icon: Link2, tone: "blue" },
  VERSION_CHANGED: { icon: Tag, tone: "green" },
  COMPONENTS_CHANGED: { icon: Tag, tone: "blue" },
  FLAG_CHANGED: { icon: Flag, tone: "red" },
  START_DATE_CHANGED: { icon: CalendarClock, tone: "amber" },
  TIME_TRACKING_CHANGED: { icon: Clock3, tone: "amber" },
  WORK_LOGGED: { icon: Clock3, tone: "green" },
  LINK_ADDED: { icon: Link2, tone: "blue" },
  LINK_REMOVED: { icon: Link2, tone: "gray" },
  ATTACHMENT_ADDED: { icon: Paperclip, tone: "blue" },
  ATTACHMENT_REMOVED: { icon: Paperclip, tone: "gray" },
  RESOLUTION_CHANGED: { icon: ListRestart, tone: "green" },
  PROJECT_MOVED: { icon: ListRestart, tone: "amber" },
  AUTOMATION: { icon: Zap, tone: "amber" },
  TEAM_CHANGED: { icon: UserRound, tone: "blue" },
  GOAL_CHANGED: { icon: CircleDot, tone: "green" },
  CUSTOM_FIELD_CHANGED: { icon: PencilLine, tone: "blue" },
  ARCHIVE_CHANGED: { icon: PencilLine, tone: "neutral" },
};

export function WorkspaceActivity({
  issues,
  limit = 6,
}: {
  issues: Issue[];
  limit?: number;
}) {
  const pathname = usePathname();
  const activity = buildWorkspaceActivity(issues, limit);

  if (activity.length === 0) {
    return <p className="activity-empty">Activity will appear as work changes.</p>;
  }

  return (
    <div className="activity-list" role="list">
      {activity.map((event) => {
        const { icon: Icon, tone } = activityVisuals[event.type];

        return (
          <Link
            className="activity-row"
            href={selectedIssueHref(pathname, "", event.issueId)}
            scroll={false}
            key={event.id}
            role="listitem"
          >
            <span className={`activity-event-icon activity-tone-${tone}`}>
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className="activity-event-copy">
              <strong>{event.issueTitle}</strong>
              <span>
                {event.actor && <b>{event.actor} </b>}
                {event.description}
              </span>
            </span>
            <span className="activity-event-meta">
              <span>{event.issueId}</span>
              <time
                dateTime={event.createdAt}
                title={new Date(event.createdAt).toLocaleString()}
              >
                {formatActivityTime(event.createdAt)}
              </time>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
