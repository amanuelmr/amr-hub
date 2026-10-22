"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, Keyboard, Search, Sparkles, X } from "lucide-react";

/** Short, product-accurate help topics shown in the Help panel. */
const TOPICS: { title: string; points: string[] }[] = [
  {
    title: "Get started",
    points: [
      "Create a project from the Scrum or Kanban template in Projects → Create.",
      "Invite teammates from Workspace settings → Members.",
      "Press C anywhere to create a work item.",
    ],
  },
  {
    title: "Boards",
    points: [
      "Drag cards between columns to change status. Columns follow your workflow.",
      "Use Filter, Custom filters and Group to focus the board; the badge shows active filters.",
      "Each column's \"…\" menu renames it, sets a limit, moves, collapses or deletes it.",
      "View settings choose card fields, compact cards and full screen.",
    ],
  },
  {
    title: "Backlog and sprints",
    points: [
      "Rank work by dragging rows. Create a sprint, drag work into it, then Start sprint.",
      "Complete sprint moves unfinished work to the backlog or another sprint.",
    ],
  },
  {
    title: "Search with JQL",
    points: [
      "Fields: project, status, assignee, reporter, priority, type, labels, sprint, created, updated, due.",
      "Operators: = != > >= < <= ~ IN NOT IN IS EMPTY IS NOT EMPTY.",
      "Functions: currentUser(), openSprints(), startOfWeek(), endOfMonth(), issueHistory().",
      "Example: assignee = currentUser() AND status != Done ORDER BY priority DESC",
    ],
  },
  {
    title: "Filters and dashboards",
    points: [
      "Save a search as a filter, then share it with the workspace, a project, a team or a person.",
      "Dashboards are built from gadgets; owners and editors can change them.",
      "Subscribe to a filter to get its results by email.",
    ],
  },
  {
    title: "Automation",
    points: [
      "Rules run when something happens (trigger), check conditions, then run actions.",
      "Every run is recorded in the rule's audit log.",
    ],
  },
  {
    title: "Notifications",
    points: [
      "Direct notifications are about you; Watching covers items you follow.",
      "Choose in-app and email notifications in your notification settings.",
    ],
  },
];

/** What changed recently, newest first. */
const WHATS_NEW = [
  "Board: Filter panel, custom filters, column menus and days in column",
  "Board: stand-up mode and work items that need attention",
  "Sidebar: customize which items show and their order",
  "Filters and dashboards: share with viewers and editors",
];

export function HelpPanel({
  onClose,
  onOpenShortcuts,
}: {
  onClose: () => void;
  onOpenShortcuts: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const topics = useMemo(
    () =>
      needle
        ? TOPICS.filter(
            (topic) =>
              topic.title.toLowerCase().includes(needle) ||
              topic.points.some((point) => point.toLowerCase().includes(needle)),
          )
        : TOPICS,
    [needle],
  );

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Content className="help-panel" aria-describedby={undefined}>
          <header className="help-panel-header">
            <Dialog.Title asChild>
              <h2>Help</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close help">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <label className="help-panel-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              placeholder="Search help"
              aria-label="Search help"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {!needle && (
            <section className="help-panel-section">
              <h3>
                <Sparkles size={14} aria-hidden="true" /> What&apos;s new
              </h3>
              <ul className="help-panel-news">
                {WHATS_NEW.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="help-panel-section">
            <h3>
              <BookOpen size={14} aria-hidden="true" /> Help topics
            </h3>
            {topics.length === 0 && <p className="help-panel-empty">No help topics match.</p>}
            {topics.map((topic) => (
              <details key={topic.title} className="help-panel-topic" open={Boolean(needle)}>
                <summary>{topic.title}</summary>
                <ul>
                  {topic.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </details>
            ))}
          </section>

          <footer className="help-panel-links">
            <button
              type="button"
              className="help-panel-link"
              onClick={() => {
                onClose();
                onOpenShortcuts();
              }}
            >
              <Keyboard size={14} aria-hidden="true" /> Keyboard shortcuts
              <kbd>?</kbd>
            </button>
            <Link className="help-panel-link" href="/admin/api-docs" onClick={onClose}>
              <BookOpen size={14} aria-hidden="true" /> REST API documentation
            </Link>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
