"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  Columns3,
  ClipboardList,
  GanttChart,
  LayoutGrid,
  Link2,
  List,
  Lock,
  MoreHorizontal,
  Package,
  Puzzle,
  Rows3,
  Settings,
  Share2,
  Star,
  Zap,
} from "lucide-react";
import { useProjects } from "../../ProjectProvider";
import { apiRequest } from "../../IssueProvider";
import { ProjectAvatar } from "../../components/shell/ProjectAvatar";
import { PROJECT_ACCESS_LABELS } from "../../data/projects";

type ProjectTab = {
  label: string;
  segment: string;
  icon: typeof List;
  /** Kanban projects have no backlog/sprints, matching Jira's team-managed kanban. */
  scrumOnly?: boolean;
};

const PROJECT_TABS: ProjectTab[] = [
  { label: "Summary", segment: "", icon: LayoutGrid },
  { label: "Timeline", segment: "timeline", icon: GanttChart },
  { label: "Backlog", segment: "backlog", icon: Rows3, scrumOnly: true },
  { label: "Board", segment: "board", icon: Columns3 },
  { label: "Calendar", segment: "calendar", icon: CalendarDays },
  { label: "List", segment: "list", icon: List },
  { label: "Reports", segment: "reports", icon: BarChart3 },
  { label: "Releases", segment: "releases", icon: Package },
  { label: "Components", segment: "components", icon: Puzzle },
  { label: "Forms", segment: "forms", icon: ClipboardList },
];

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const pathname = usePathname();
  const router = useRouter();
  const { allProjects: projects, setActiveProjectId, refreshProjects } = useProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const [starOverride, setStarOverride] = useState<{ id: string; starred: boolean } | null>(
    null,
  );
  const [copiedAt, setCopiedAt] = useState<string | null>(null);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  useEffect(() => {
    if (!copiedAt) return;
    const timeout = window.setTimeout(() => setCopiedAt(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedAt]);

  const canAdmin = project?.permissions?.canAdmin ?? false;
  const isArchived = Boolean(project?.archivedAt);
  const base = `/projects/${projectId}`;
  const activeSegment = pathname.slice(base.length).split("/")[1] ?? "";
  const isSettingsRoute = activeSegment === "settings";
  const tabs = PROJECT_TABS.filter(
    (tab) => !(tab.scrumOnly && project?.boardType === "KANBAN"),
  );

  const isStarred =
    starOverride?.id === projectId ? starOverride.starred : Boolean(project?.starred);

  const toggleStar = async () => {
    const next = !isStarred;
    setStarOverride({ id: projectId, starred: next });
    try {
      await apiRequest(`/api/projects/${projectId}/star`, {
        method: next ? "POST" : "DELETE",
      });
      await refreshProjects();
    } catch {
      setStarOverride({ id: projectId, starred: !next });
    }
  };

  const copyLink = async (source: string) => {
    const url = `${window.location.origin}${pathname}`;
    if (await copyToClipboard(url)) setCopiedAt(source);
  };

  return (
    <div className="project-shell">
      {project && (
        <div
          className={
            isSettingsRoute ? "project-shell-header settings-route" : "project-shell-header"
          }
        >
          <div className="project-head">
            <div className="project-head-title">
              <ProjectAvatar project={project} size="lg" />
              <h1 className="project-head-name" title={project.name}>
                {project.name}
              </h1>
              <button
                type="button"
                className={isStarred ? "project-head-icon starred" : "project-head-icon"}
                onClick={() => void toggleStar()}
                aria-pressed={isStarred}
                aria-label={isStarred ? "Remove from starred" : "Add to starred"}
                title={isStarred ? "Remove from starred" : "Add to starred"}
              >
                <Star size={16} aria-hidden="true" />
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="project-head-icon"
                    aria-label="More project actions"
                    title="More actions"
                  >
                    <MoreHorizontal size={17} aria-hidden="true" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="shell-menu" align="start" sideOffset={6}>
                    {canAdmin && (
                      <DropdownMenu.Item
                        className="shell-menu-item"
                        onSelect={() => router.push(`${base}/settings`)}
                      >
                        <Settings size={15} aria-hidden="true" />
                        Project settings
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      className="shell-menu-item"
                      onSelect={() => void copyLink("menu")}
                    >
                      <Link2 size={15} aria-hidden="true" />
                      Copy link
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <span className="project-head-type">
                {project.boardType === "KANBAN" ? "Kanban" : "Scrum"}
              </span>
              {project.accessLevel && project.accessLevel !== "OPEN" && (
                <span
                  className="project-head-type pa-access-chip"
                  title={PROJECT_ACCESS_LABELS[project.accessLevel].description}
                >
                  <Lock size={11} aria-hidden="true" />
                  {PROJECT_ACCESS_LABELS[project.accessLevel].label}
                </span>
              )}
              {isArchived && (
                <span className="project-head-type pa-access-chip">
                  <Archive size={11} aria-hidden="true" />
                  Archived
                </span>
              )}
            </div>
            <div className="project-head-actions">
              <span className="project-head-status" role="status" aria-live="polite">
                {copiedAt ? "Link copied" : ""}
              </span>
              <button
                type="button"
                className="project-head-button"
                onClick={() => void copyLink("share")}
                title="Copy link to this view"
              >
                {copiedAt === "share" ? (
                  <Check size={15} aria-hidden="true" />
                ) : (
                  <Share2 size={15} aria-hidden="true" />
                )}
                <span className="project-head-button-label">Share</span>
              </button>
              {canAdmin && (
                <Link
                  href={`${base}/settings?tab=automation`}
                  className="project-head-button"
                  aria-label="Automation"
                  title="Automation"
                >
                  <Zap size={15} aria-hidden="true" />
                  <span className="project-head-button-label">Automation</span>
                </Link>
              )}
            </div>
          </div>
          {!isSettingsRoute && (
            <nav className="project-tabs" aria-label="Project views">
              {tabs.map(({ label, segment, icon: Icon }) => {
                const isActive =
                  activeSegment === segment ||
                  (segment === "backlog" && activeSegment === "cycles");
                return (
                  <Link
                    key={label}
                    href={segment ? `${base}/${segment}` : base}
                    className={isActive ? "project-tab active" : "project-tab"}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}
      {project && isArchived && !isSettingsRoute && (
        <p className="pa-archived-banner pa-archived-project" role="status">
          This project is archived, so it&apos;s read-only.
          {canAdmin ? " Restore it from Project settings → Danger zone." : ""}
        </p>
      )}
      {children}
    </div>
  );
}
