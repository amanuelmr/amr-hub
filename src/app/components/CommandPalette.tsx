"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  CornerDownLeft,
  Filter,
  GanttChart,
  FolderKanban,
  Gauge,
  House,
  Keyboard,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  Settings2,
  Target,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { useIssues } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { quoteJqlValue } from "../data/jql";
import { useCreateIssueModal } from "../CreateIssueModalProvider";
import { authClient } from "../../lib/auth-client";

type PaletteResult = {
  id: string;
  label: string;
  meta?: string;
  href: string;
  group: string;
  icon: typeof Search;
};

export const OPEN_COMMAND_PALETTE_EVENT = "amr:open-command-palette";
export const OPEN_SHORTCUTS_EVENT = "amr:open-shortcuts";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

const STATIC_COMMANDS: PaletteResult[] = [
  { id: "new-issue", label: "Create new issue", href: "/issues/new", group: "Actions", icon: Plus },
  { id: "new-project", label: "Create new project", href: "/projects/new", group: "Actions", icon: Plus },
  { id: "nav-your-work", label: "Go to Your work", href: "/your-work", group: "Navigate", icon: House },
  { id: "nav-overview", label: "Go to Overview", href: "/dashboard", group: "Navigate", icon: LayoutDashboard },
  { id: "nav-projects", label: "Go to Projects", href: "/projects", group: "Navigate", icon: FolderKanban },
  { id: "nav-issues", label: "Go to Issues", href: "/issues", group: "Navigate", icon: ListTodo },
  { id: "nav-filters", label: "Go to Filters", href: "/filters", group: "Navigate", icon: Filter },
  { id: "nav-dashboards", label: "Go to Dashboards", href: "/dashboards", group: "Navigate", icon: Gauge },
  { id: "nav-jql", label: "Advanced issue search (JQL)", href: "/issues?jql=", group: "Navigate", icon: Search },
  { id: "nav-roadmap", label: "Go to Roadmap", href: "/roadmap", group: "Navigate", icon: GanttChart },
  { id: "nav-goals", label: "Go to Goals", href: "/goals", group: "Navigate", icon: Target },
  { id: "nav-people", label: "Go to People", href: "/people", group: "Navigate", icon: UsersRound },
  { id: "nav-teams", label: "Go to Teams", href: "/teams", group: "Navigate", icon: Users },
  { id: "nav-admin", label: "Go to Workspace settings", href: "/admin", group: "Navigate", icon: Settings2 },
  { id: "nav-notifications", label: "Notification settings", href: "/account/notifications", group: "Navigate", icon: UserRound },
  { id: "nav-account", label: "Go to Account", href: "/account", group: "Navigate", icon: UserRound },
  { id: "shortcuts", label: "Show keyboard shortcuts", href: "#", group: "Help", icon: Keyboard },
];

export function CommandPalette() {
  const router = useRouter();
  const { issues, savedViews } = useIssues();
  const { projects } = useProjects();
  const { open: openCreateIssueModal } = useCreateIssueModal();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isPaletteShortcut) {
        event.preventDefault();
        setIsOpen((current) => !current);
        return;
      }

      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleOpen = () => setIsOpen(true);

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpen);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpen);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const resetForOpen = () => {
      setQuery("");
      setActiveIndex(0);
    };
    resetForOpen();

    const focusFrame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(focusFrame);
  }, [isOpen]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const availableCommands = isViewer
      ? STATIC_COMMANDS.filter((command) => command.id !== "new-issue")
      : STATIC_COMMANDS;

    const commandResults: PaletteResult[] = availableCommands.filter(
      (command) => !normalized || command.label.toLowerCase().includes(normalized),
    );

    const projectResults: PaletteResult[] = normalized
      ? projects
          .filter(
            (project) =>
              project.name.toLowerCase().includes(normalized) ||
              project.key.toLowerCase().includes(normalized),
          )
          .slice(0, 4)
          .flatMap((project) => [
            {
              id: `project-${project.id}`,
              label: project.name,
              meta: project.key,
              href: `/projects/${project.id}`,
              group: "Projects",
              icon: FolderKanban,
            },
            {
              id: `project-board-${project.id}`,
              label: `${project.name} board`,
              meta: project.key,
              href: `/projects/${project.id}/board`,
              group: "Projects",
              icon: FolderKanban,
            },
          ])
      : [];

    const filterResults: PaletteResult[] = normalized
      ? savedViews
          .filter((view) => view.name.toLowerCase().includes(normalized))
          .slice(0, 4)
          .map((view) => ({
            id: `filter-${view.id}`,
            label: `Run filter: ${view.name}`,
            href: `/issues?filter=${encodeURIComponent(view.id)}`,
            group: "Filters",
            icon: Bookmark,
          }))
      : [];

    const scoreIssue = (id: string, title: string) => {
      const key = id.toLowerCase();
      if (key === normalized) return 0;
      if (key.startsWith(normalized)) return 1;
      if (title.toLowerCase().startsWith(normalized)) return 2;
      if (title.toLowerCase().includes(normalized) || key.includes(normalized)) return 3;
      return -1;
    };

    const issueResults: PaletteResult[] = normalized
      ? issues
          .map((issue) => ({ issue, score: scoreIssue(issue.id, issue.title) }))
          .filter(({ score }) => score >= 0)
          .sort((left, right) => left.score - right.score)
          .slice(0, 8)
          .map(({ issue }) => ({
            id: issue.id,
            label: issue.title,
            meta: issue.id,
            href: `/issues/${issue.id}`,
            group: "Issues",
            icon: Search,
          }))
      : [];

    const searchAll: PaletteResult[] = normalized
      ? [
          {
            id: "search-all",
            label: `Search all issues for “${query.trim()}”`,
            href: `/issues?jql=${encodeURIComponent(`text ~ ${quoteJqlValue(query.trim())}`)}`,
            group: "Issues",
            icon: Search,
          },
        ]
      : [];

    return [
      ...issueResults,
      ...searchAll,
      ...commandResults,
      ...projectResults,
      ...filterResults,
    ];
  }, [issues, projects, savedViews, query, isViewer]);

  useEffect(() => {
    const resetActiveIndex = () => setActiveIndex(0);
    resetActiveIndex();
  }, [results.length]);

  const close = () => setIsOpen(false);

  const select = (index: number) => {
    const result = results[index];
    if (!result) return;
    close();

    if (result.id === "new-issue") {
      openCreateIssueModal();
      return;
    }

    if (result.id === "shortcuts") {
      window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
      return;
    }

    router.push(result.href);
  };

  if (!isOpen) {
    return null;
  }

  const groups = results.reduce<Record<string, PaletteResult[]>>((acc, result) => {
    (acc[result.group] ??= []).push(result);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div
      className="dialog-backdrop command-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="command-palette-input">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to an issue or run a command..."
            aria-label="Search issues and commands"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => Math.min(current + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                select(activeIndex);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="command-palette-results" role="listbox">
          {results.length === 0 && (
            <p className="command-palette-empty">No matches. Try a different search.</p>
          )}

          {Object.entries(groups).map(([group, groupResults]) => (
            <div className="command-palette-group" key={group}>
              <span className="command-palette-group-label">{group}</span>
              {groupResults.map((result) => {
                flatIndex += 1;
                const index = flatIndex;
                const Icon = result.icon;

                return (
                  <button
                    type="button"
                    key={result.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={
                      index === activeIndex
                        ? "command-palette-item active"
                        : "command-palette-item"
                    }
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(index)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span className="command-palette-item-label">{result.label}</span>
                    {result.meta && (
                      <span className="command-palette-item-meta">{result.meta}</span>
                    )}
                    {index === activeIndex && (
                      <CornerDownLeft size={13} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CommandPaletteHint() {
  return (
    <button
      className="palette-trigger"
      type="button"
      onClick={openCommandPalette}
      aria-label="Open command palette"
    >
      <Search size={15} aria-hidden="true" />
      <span>Search or jump to...</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
