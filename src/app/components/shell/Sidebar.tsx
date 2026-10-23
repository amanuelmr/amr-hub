"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  FolderKanban,
  GanttChart,
  Gauge,
  House,
  LayoutDashboard,
  ListTodo,
  Plus,
  Settings2,
  SlidersHorizontal,
  Star,
  Target,
  Users,
  UsersRound,
} from "lucide-react";
import { authClient } from "../../../lib/auth-client";
import { useProjects } from "../../ProjectProvider";
import { ProjectAvatar } from "./ProjectAvatar";
import { RecentFlyout } from "./RecentFlyout";
import { StarredFlyout } from "./StarredFlyout";
import { useRecentProjectIds } from "./recentProjects";
import { CustomizeSidebarDialog } from "./CustomizeSidebarDialog";
import { useSidebarPrefs, type SidebarItemKey } from "./useSidebarPrefs";

const PROJECT_PATH = /^\/projects\/([^/]+)/;

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof House;
  isActive: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      className={isActive ? "shell-nav-item active" : "shell-nav-item"}
      aria-current={isActive ? "page" : undefined}
      title={label}
      onClick={onNavigate}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="shell-nav-label">{label}</span>
    </Link>
  );
}

export function Sidebar({
  isCollapsed,
  isDrawerOpen,
  onCloseDrawer,
}: {
  isCollapsed: boolean;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const pathname = usePathname();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const { projects, setActiveProjectId } = useProjects();
  const [isProjectsOpen, setIsProjectsOpen] = useState(true);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const { prefs, save } = useSidebarPrefs();

  const routeProjectId = pathname.match(PROJECT_PATH)?.[1] ?? null;
  const currentProjectId =
    routeProjectId && routeProjectId !== "new" ? routeProjectId : null;
  const recentProjectIds = useRecentProjectIds(currentProjectId);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (left, right) =>
          Number(Boolean(right.starred)) - Number(Boolean(left.starred)) ||
          left.name.localeCompare(right.name),
      ),
    [projects],
  );

  const recentProjects = useMemo(
    () =>
      recentProjectIds
        .map((id) => projects.find((project) => project.id === id))
        .filter((project): project is NonNullable<typeof project> =>
          Boolean(project),
        ),
    [projects, recentProjectIds],
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const isProjectsIndex =
    pathname === "/projects" || pathname === "/projects/new";

  // The mobile drawer always shows full labels, whatever the desktop preference.
  const showCollapsed = isCollapsed && !isDrawerOpen;
  const classes = ["shell-sidebar"];
  if (showCollapsed) classes.push("collapsed");
  if (isDrawerOpen) classes.push("drawer-open");

  const sidebarItems: Record<SidebarItemKey, ReactNode> = {
    recent: (
      <RecentFlyout
        recentProjects={recentProjects}
        onNavigate={onCloseDrawer}
      />
    ),
    starred: (
      <StarredFlyout projects={sortedProjects} onNavigate={onCloseDrawer} />
    ),
    projects: (
      <>
        {showCollapsed ? (
          <NavLink
            href="/projects"
            label="Projects"
            icon={FolderKanban}
            isActive={isActive("/projects")}
            onNavigate={onCloseDrawer}
          />
        ) : (
          <div
            className={
              isProjectsIndex ? "shell-nav-group active" : "shell-nav-group"
            }
          >
            <div className="shell-nav-item shell-nav-item-split">
              <button
                type="button"
                className="shell-nav-expander"
                onClick={() => setIsProjectsOpen((current) => !current)}
                aria-expanded={isProjectsOpen}
                aria-controls="shell-project-list"
                aria-label={
                  isProjectsOpen ? "Collapse projects" : "Expand projects"
                }
              >
                <FolderKanban
                  className="shell-nav-expander-icon"
                  size={16}
                  aria-hidden="true"
                />
                {isProjectsOpen ? (
                  <ChevronDown
                    className="shell-nav-expander-chevron"
                    size={14}
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRight
                    className="shell-nav-expander-chevron"
                    size={14}
                    aria-hidden="true"
                  />
                )}
              </button>
              <Link
                href="/projects"
                className="shell-nav-split-link"
                title="Projects"
                aria-current={pathname === "/projects" ? "page" : undefined}
                onClick={onCloseDrawer}
              >
                <span className="shell-nav-label">Projects</span>
              </Link>
              {!isViewer && (
                <Link
                  href="/projects/new"
                  className="shell-nav-action"
                  aria-label="Create project"
                  title="Create project"
                  onClick={onCloseDrawer}
                >
                  <Plus size={14} aria-hidden="true" />
                </Link>
              )}
            </div>

            {isProjectsOpen && (
              <ul id="shell-project-list" className="shell-project-list">
                {sortedProjects.length === 0 ? (
                  <li className="shell-project-empty">No projects yet</li>
                ) : (
                  sortedProjects.map((project) => {
                    const active = currentProjectId === project.id;
                    return (
                      <li key={project.id}>
                        <Link
                          href={`/projects/${project.id}`}
                          onClick={() => {
                            setActiveProjectId(project.id);
                            onCloseDrawer();
                          }}
                          className={
                            active
                              ? "shell-project-item active"
                              : "shell-project-item"
                          }
                          aria-current={active ? "page" : undefined}
                          title={project.name}
                        >
                          <ProjectAvatar project={project} />
                          <span className="shell-project-name">
                            {project.name}
                          </span>
                          {project.starred && (
                            <Star
                              className="shell-project-star"
                              size={12}
                              aria-label="Starred"
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })
                )}
                <li>
                  <Link
                    href="/projects"
                    className="shell-project-item shell-project-all"
                    onClick={onCloseDrawer}
                  >
                    View all projects
                  </Link>
                </li>
              </ul>
            )}
          </div>
        )}
      </>
    ),
    filters: (
      <NavLink
        href="/filters"
        label="Filters"
        icon={Filter}
        isActive={isActive("/filters")}
        onNavigate={onCloseDrawer}
      />
    ),
    dashboards: (
      <NavLink
        href="/dashboards"
        label="Dashboards"
        icon={Gauge}
        isActive={isActive("/dashboards")}
        onNavigate={onCloseDrawer}
      />
    ),
    roadmap: (
      <NavLink
        href="/roadmap"
        label="Roadmap"
        icon={GanttChart}
        isActive={isActive("/roadmap")}
        onNavigate={onCloseDrawer}
      />
    ),
    goals: (
      <NavLink
        href="/goals"
        label="Goals"
        icon={Target}
        isActive={isActive("/goals")}
        onNavigate={onCloseDrawer}
      />
    ),
    people: (
      <NavLink
        href="/people"
        label="People"
        icon={UsersRound}
        isActive={isActive("/people")}
        onNavigate={onCloseDrawer}
      />
    ),
    teams: (
      <NavLink
        href="/teams"
        label="Teams"
        icon={Users}
        isActive={isActive("/teams")}
        onNavigate={onCloseDrawer}
      />
    ),
    overview: (
      <NavLink
        href="/dashboard"
        label="Overview"
        icon={LayoutDashboard}
        isActive={isActive("/dashboard")}
        onNavigate={onCloseDrawer}
      />
    ),
    issues: (
      <NavLink
        href="/issues"
        label="Issues"
        icon={ListTodo}
        isActive={isActive("/issues")}
        onNavigate={onCloseDrawer}
      />
    ),
    settings: (
      <NavLink
        href="/admin"
        label="Workspace settings"
        icon={Settings2}
        isActive={isActive("/admin")}
        onNavigate={onCloseDrawer}
      />
    ),
  };

  return (
    <>
      {isCustomizing && (
        <CustomizeSidebarDialog
          prefs={prefs}
          onSave={save}
          onClose={() => setIsCustomizing(false)}
        />
      )}
      <div
        className={
          isDrawerOpen ? "shell-drawer-scrim visible" : "shell-drawer-scrim"
        }
        onClick={onCloseDrawer}
        aria-hidden="true"
      />
      <aside
        id="shell-sidebar"
        className={classes.join(" ")}
        aria-label="Sidebar"
      >
        <nav className="shell-nav" aria-label="Primary navigation">
          <NavLink
            href="/your-work"
            label="For you"
            icon={House}
            isActive={isActive("/your-work")}
            onNavigate={onCloseDrawer}
          />
          {prefs.order
            .filter((key) => !prefs.hidden.includes(key))
            .map((key) => (
              <Fragment key={key}>{sidebarItems[key]}</Fragment>
            ))}
          {!showCollapsed && (
            <button
              type="button"
              className="shell-nav-item shell-nav-customize"
              onClick={() => setIsCustomizing(true)}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span className="shell-nav-label">Customize sidebar</span>
            </button>
          )}
        </nav>

        <div
          className="shell-workspace"
          title={activeOrganization?.name ?? "Workspace"}
        >
          <span className="shell-workspace-mark" aria-hidden="true">
            {(activeOrganization?.name ?? "W").slice(0, 1).toUpperCase()}
          </span>
          <span className="shell-workspace-text">
            <strong>{activeOrganization?.name ?? "Product workspace"}</strong>
            <small>
              {activeMember?.role === "owner"
                ? "Owner"
                : isViewer
                  ? "Viewer"
                  : "Member"}{" "}
              · Workspace
            </small>
          </span>
        </div>
      </aside>
    </>
  );
}
