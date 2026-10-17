"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock3, Eye, FolderKanban, Star, UserRound } from "lucide-react";
import { apiRequest, useIssues } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { authClient } from "../../lib/auth-client";
import type { Issue } from "../data/issues";
import {
  isDoneStatus,
  statusCategory,
  type StatusCategory,
} from "../data/workflow";
import type { Project } from "../data/projects";
import { KindIcon, StatusBadge } from "../components/IssueVisuals";
import { WorkspaceLoading } from "../components/WorkspaceLoading";
import { selectedIssueHref } from "../components/issue/selectedIssue";

type YourWorkResponse = {
  recent: { issue: Issue; viewedAt: string }[];
  workedOn: { issue: Issue; lastActivityAt: string; reason: string }[];
  assigned: Issue[];
  starredProjectIds: string[];
};

type Tab = "worked" | "viewed" | "assigned" | "starred";

const TABS: { id: Tab; label: string; icon: typeof Clock3 }[] = [
  { id: "worked", label: "Worked on", icon: Clock3 },
  { id: "viewed", label: "Viewed", icon: Eye },
  { id: "assigned", label: "Assigned to me", icon: UserRound },
  { id: "starred", label: "Starred", icon: Star },
];

const CATEGORY_GROUPS: { id: StatusCategory; label: string }[] = [
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "TODO", label: "To do" },
  { id: "DONE", label: "Done" },
];

const DAY_MS = 86_400_000;

function relativeTime(value: string, now: number) {
  const diff = now - new Date(value).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function timeBucket(value: string, now: number) {
  const diff = now - new Date(value).getTime();
  if (diff < DAY_MS) return "Today";
  if (diff < 7 * DAY_MS) return "In the last week";
  return "In the last month";
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = key(item);
    groups.set(name, [...(groups.get(name) ?? []), item]);
  }
  return [...groups.entries()];
}

function IssueRow({
  issue,
  project,
  meta,
}: {
  issue: Issue;
  project: Project | undefined;
  meta?: string;
}) {
  const pathname = usePathname();
  return (
    <li className="your-work-row">
      <KindIcon kind={issue.kind} projectId={issue.projectId} />
      <div className="your-work-row-main">
        <Link href={selectedIssueHref(pathname, "", issue.id)} scroll={false}>
          {issue.title}
        </Link>
        <span>
          {issue.id}
          {project ? ` · ${project.name}` : ""}
        </span>
      </div>
      {meta && <span className="your-work-row-meta">{meta}</span>}
      <StatusBadge status={issue.status} projectId={issue.projectId} />
    </li>
  );
}

function ProjectLinks({ project }: { project: Project }) {
  const base = `/projects/${project.id}`;
  return (
    <nav className="your-work-project-links" aria-label={`${project.name} views`}>
      <Link
        href={`/issues?jql=${encodeURIComponent(
          `project = ${project.key} AND assignee = currentUser() AND statusCategory != Done`,
        )}`}
      >
        My open issues
      </Link>
      <Link href={`${base}/board`}>Board</Link>
      {project.boardType !== "KANBAN" && <Link href={`${base}/backlog`}>Backlog</Link>}
      <Link href={`${base}/list`}>List</Link>
    </nav>
  );
}

export default function YourWorkPage() {
  const { issues, isLoading } = useIssues();
  const { projects } = useProjects();
  const { data: activeMember } = authClient.useActiveMember();
  const [data, setData] = useState<YourWorkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("worked");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<YourWorkResponse>("/api/your-work", { signal: controller.signal })
      .then(setData)
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error ? requestError.message : "Your work could not be loaded",
          );
        }
      });
    return () => controller.abort();
  }, []);

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const liveById = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
  const live = (issue: Issue) => liveById.get(issue.id) ?? issue;

  const assigned = useMemo(
    () =>
      activeMember
        ? issues
            .filter((issue) => issue.assignee?.id === activeMember.id)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        : (data?.assigned ?? []),
    [issues, activeMember, data],
  );

  const starredIds = new Set([
    ...projects.filter((project) => project.starred).map((project) => project.id),
    ...(data?.starredProjectIds ?? []),
  ]);
  const starred = projects.filter((project) => starredIds.has(project.id));

  const recentProjects = useMemo(() => {
    const ids = [
      ...(data?.recent ?? []).map((entry) => entry.issue.projectId),
      ...(data?.workedOn ?? []).map((entry) => entry.issue.projectId),
    ];
    const ordered = [...new Set(ids)]
      .map((id) => projectsById.get(id))
      .filter((project): project is Project => !!project);
    for (const project of projects) {
      if (ordered.length >= 6) break;
      if (!ordered.includes(project)) ordered.push(project);
    }
    return ordered.slice(0, 6);
  }, [data, projects, projectsById]);

  if (isLoading || (!data && !error)) {
    return <WorkspaceLoading label="your work" />;
  }

  const counts: Record<Tab, number> = {
    worked: data?.workedOn.length ?? 0,
    viewed: data?.recent.length ?? 0,
    assigned: assigned.filter((issue) => !isDoneStatus(issue.status)).length,
    starred: starred.length,
  };

  return (
    <div className="page your-work-page">
      <header className="jira-page-header">
        <h1 className="jira-page-title">For you</h1>
        <div className="jira-page-actions">
          <Link href="/projects" className="text-button your-work-view-all">
            View all projects
          </Link>
        </div>
      </header>

      <section className="your-work-projects" aria-label="Recent projects">
        <h2 className="your-work-heading">Recent projects</h2>
        {recentProjects.length === 0 ? (
          <p className="search-muted">
            No projects yet. <Link href="/projects/new">Create one</Link>.
          </p>
        ) : (
          <div className="your-work-project-strip">
            {recentProjects.map((project) => (
              <article className="your-work-project-card" key={project.id}>
                <Link href={`/projects/${project.id}`} className="your-work-project-title">
                  <span
                    className="project-shell-avatar"
                    style={{ background: project.color ?? "var(--gray-300)" }}
                    aria-hidden="true"
                  >
                    {project.key.slice(0, 2)}
                  </span>
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      {project.boardType === "KANBAN" ? "Kanban" : "Scrum"} ·{" "}
                      {project.key} · {project.issueCount - project.doneIssueCount} open
                    </small>
                  </span>
                  {starredIds.has(project.id) && (
                    <Star className="your-work-star" size={14} aria-label="Starred" />
                  )}
                </Link>
                <ProjectLinks project={project} />
              </article>
            ))}
          </div>
        )}
      </section>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      <div className="filter-tabs your-work-tabs" role="tablist" aria-label="Your work">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            role="tab"
            key={id}
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
            <span>{counts[id]}</span>
          </button>
        ))}
      </div>

      <section className="panel your-work-panel" role="tabpanel">
        {tab === "worked" &&
          (data?.workedOn.length ? (
            groupBy(data.workedOn, (entry) => timeBucket(entry.lastActivityAt, now)).map(
              ([bucket, entries]) => (
                <div className="your-work-group" key={bucket}>
                  <h3>{bucket}</h3>
                  <ul>
                    {entries.map((entry) => (
                      <IssueRow
                        key={entry.issue.id}
                        issue={live(entry.issue)}
                        project={projectsById.get(entry.issue.projectId)}
                        meta={`You ${entry.reason} · ${relativeTime(entry.lastActivityAt, now)}`}
                      />
                    ))}
                  </ul>
                </div>
              ),
            )
          ) : (
            <EmptyState text="Issues you create, comment on, log work on, or update in the last 30 days show up here." />
          ))}

        {tab === "viewed" &&
          (data?.recent.length ? (
            <ul>
              {data.recent.map((entry) => (
                <IssueRow
                  key={entry.issue.id}
                  issue={live(entry.issue)}
                  project={projectsById.get(entry.issue.projectId)}
                  meta={`Viewed ${relativeTime(entry.viewedAt, now)}`}
                />
              ))}
            </ul>
          ) : (
            <EmptyState text="Issues you open will appear here." />
          ))}

        {tab === "assigned" &&
          (assigned.length ? (
            CATEGORY_GROUPS.map(({ id, label }) => {
              const group = assigned.filter(
                (issue) => statusCategory(issue.status) === id,
              );
              if (group.length === 0) return null;
              return (
                <div className="your-work-group" key={id}>
                  <h3>
                    {label} <span>{group.length}</span>
                  </h3>
                  <ul>
                    {group.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        project={projectsById.get(issue.projectId)}
                        meta={`Updated ${relativeTime(issue.updatedAt, now)}`}
                      />
                    ))}
                  </ul>
                </div>
              );
            })
          ) : (
            <EmptyState text="Nothing is assigned to you right now." />
          ))}

        {tab === "starred" &&
          (starred.length ? (
            <ul>
              {starred.map((project) => (
                <li className="your-work-row" key={project.id}>
                  <FolderKanban size={16} aria-hidden="true" />
                  <div className="your-work-row-main">
                    <Link href={`/projects/${project.id}`}>{project.name}</Link>
                    <span>{project.key}</span>
                  </div>
                  <ProjectLinks project={project} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="Star projects from the Projects page to pin them here and in the sidebar." />
          ))}
      </section>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  );
}
