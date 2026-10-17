"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  CheckCircle2,
  PencilLine,
  PlusCircle,
  Star,
} from "lucide-react";
import { useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import { KindIcon } from "../../components/IssueVisuals";
import { WorkspaceLoading } from "../../components/WorkspaceLoading";
import { selectedIssueHref } from "../../components/issue/selectedIssue";
import { buildWorkspaceActivity, formatActivityTime } from "../../data/activity";
import { useWorkflow } from "../../WorkflowProvider";
import {
  PRIORITY_LABELS,
  type Issue,
  type IssuePriority,
} from "../../data/issues";
import { computeProjectSummary, groupByDay } from "./summaryStats";
import { PersonAvatar } from "./settings/adminUi";

const CATEGORY_SLICES = [
  { key: "TODO", label: "To do", className: "pa-fill-todo", fill: "#a3a3a3" },
  {
    key: "IN_PROGRESS",
    label: "In progress",
    className: "pa-fill-progress",
    fill: "#3b82f6",
  },
  { key: "DONE", label: "Done", className: "pa-fill-done", fill: "#22c55e" },
] as const;

const PRIORITY_ORDER: IssuePriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO_PRIORITY",
];

function StatTile({
  icon: Icon,
  value,
  label,
  period = "in the last 7 days",
}: {
  icon: typeof Star;
  value: number;
  label: string;
  period?: string;
}) {
  return (
    <div className="pa-stat">
      <span className="pa-stat-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div>
        <strong>
          {value} {label}
        </strong>
        <span>{period}</span>
      </div>
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <header className="pa-card-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <Link className="pa-card-link" href={href}>
        View all
      </Link>
    </header>
  );
}

function lowerFirst(text: string) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function SummaryActivity({
  issues,
  issueHref,
}: {
  issues: Issue[];
  issueHref: (key: string) => string;
}) {
  const groups = groupByDay(buildWorkspaceActivity(issues, 12));

  if (groups.length === 0) {
    return <p className="activity-empty">Activity will appear as work changes.</p>;
  }

  return (
    <div className="pa-activity">
      {groups.map((group) => (
        <section key={group.label} className="pa-activity-day">
          <h3>{group.label}</h3>
          <ul>
            {group.items.map((event) => (
              <li key={event.id}>
                <PersonAvatar name={event.actor ?? "?"} />
                <p>
                  <b>{event.actor ?? "Someone"}</b>{" "}
                  {event.type === "CREATED" && event.description === "Issue created"
                    ? "created"
                    : lowerFirst(event.description)}{" "}
                  <Link
                    className="pa-activity-issue"
                    href={issueHref(event.issueId)}
                    scroll={false}
                  >
                    <span className="pa-key">{event.issueId}</span>
                    <span>{event.issueTitle}</span>
                  </Link>
                  <time
                    dateTime={event.createdAt}
                    title={new Date(event.createdAt).toLocaleString()}
                  >
                    {formatActivityTime(event.createdAt)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function ProjectSummaryPage() {
  return (
    <Suspense fallback={<WorkspaceLoading label="summary" />}>
      <ProjectSummary />
    </Suspense>
  );
}

function ProjectSummary() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { projects, isLoading: isLoadingProjects } = useProjects();
  const { issues: allIssues, isLoading: isLoadingIssues } = useIssues();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const issueHref = (key: string) =>
    selectedIssueHref(pathname, searchParams, key);

  const project = projects.find((candidate) => candidate.id === projectId);
  const issues = useMemo(
    () => allIssues.filter((issue) => issue.projectId === projectId),
    [allIssues, projectId],
  );
  const summary = useMemo(() => computeProjectSummary(issues), [issues]);
  const workflow = useWorkflow(projectId);
  // Configured types first, then any stray kinds still on issues.
  const kinds = useMemo(() => {
    const configured = workflow.types.map((type) => type.key);
    const extra = Object.keys(summary.byKind).filter(
      (kind) => !configured.includes(kind) && summary.byKind[kind] > 0,
    );
    return [...configured, ...extra];
  }, [workflow.types, summary.byKind]);

  if (isLoadingProjects && !project) {
    return <WorkspaceLoading label="project" />;
  }

  if (!project) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Project not found</h2>
          <p>It may have been removed, or you may not have access.</p>
          <Link className="secondary-button" href="/projects">
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  const pieData = CATEGORY_SLICES.map((slice) => ({
    ...slice,
    value: summary.byCategory[slice.key],
  }));
  const priorityData = PRIORITY_ORDER.map((priority) => ({
    name: PRIORITY_LABELS[priority],
    priority,
    value: summary.byPriority[priority],
  }));
  const total = issues.length;
  const jqlHref = (rest: string) =>
    `/issues?jql=${encodeURIComponent(`project = ${project.key} ${rest}`)}`;
  const listHref = `/projects/${projectId}/list`;

  return (
    <div className="page pa-summary">
      {isLoadingIssues && issues.length === 0 ? (
        <WorkspaceLoading label="summary" />
      ) : (
        <>
          <section className="pa-stat-strip" aria-label="Last 7 days">
            <StatTile
              icon={CheckCircle2}
              value={summary.doneLast7}
              label="completed"
            />
            <StatTile
              icon={PencilLine}
              value={summary.updatedLast7}
              label="updated"
            />
            <StatTile
              icon={PlusCircle}
              value={summary.createdLast7}
              label="created"
            />
            <StatTile
              icon={CalendarClock}
              value={summary.dueNext7}
              label="due soon"
              period="in the next 7 days"
            />
          </section>

          <div className="pa-summary-grid">
            <section className="panel pa-card">
              <CardHeader
                title="Status overview"
                subtitle="A snapshot of every work item by status category."
                href={listHref}
              />
              {total === 0 ? (
                <p className="activity-empty">No work items yet.</p>
              ) : (
                <div className="pa-donut">
                  <div className="pa-donut-chart">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={58}
                          outerRadius={86}
                          paddingAngle={2}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {pieData.map((slice) => (
                            <Cell
                              key={slice.key}
                              fill={slice.fill}
                              className={slice.className}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pa-donut-center">
                      <strong>{total}</strong>
                      <span>Total</span>
                    </div>
                  </div>
                  <ul className="pa-legend">
                    {pieData.map((slice) => (
                      <li key={slice.key}>
                        <span className={`pa-swatch ${slice.className}-bg`} />
                        {slice.label}
                        <strong>{slice.value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="panel pa-card">
              <CardHeader
                title="Recent activity"
                subtitle="Stay up to date with what's happening."
                href={jqlHref("ORDER BY updated DESC")}
              />
              <SummaryActivity issues={issues} issueHref={issueHref} />
            </section>

            <section className="panel pa-card">
              <CardHeader
                title="Priority breakdown"
                subtitle="How work is being prioritized."
                href={jqlHref("ORDER BY priority DESC")}
              />
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={priorityData}
                  margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                >
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    className="pa-axis"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    className="pa-axis"
                  />
                  <Tooltip cursor={{ fillOpacity: 0.08 }} />
                  <Bar dataKey="value" name="Issues" isAnimationActive={false}>
                    {priorityData.map((entry) => (
                      <Cell
                        key={entry.priority}
                        fill="#3b82f6"
                        className={`pa-fill-priority-${entry.priority.toLowerCase()}`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="panel pa-card">
              <CardHeader
                title="Types of work"
                subtitle="A breakdown of work items by their type."
                href={jqlHref("ORDER BY issuetype ASC")}
              />
              <ul className="pa-bars">
                {kinds.map((kind) => {
                  const count = summary.byKind[kind] ?? 0;
                  const percent =
                    total === 0 ? 0 : Math.round((count / total) * 100);
                  return (
                    <li key={kind}>
                      <span className="pa-bar-label">
                        <KindIcon kind={kind} projectId={projectId} />
                        {workflow.types.find((type) => type.key === kind)
                          ?.name ?? kind}
                      </span>
                      <span className="pa-bar-track">
                        <span
                          className="pa-bar-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="pa-bar-value">{percent}%</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="panel pa-card">
              <CardHeader
                title="Team workload"
                subtitle="Share of open work items per assignee."
                href={jqlHref("AND statusCategory != Done ORDER BY assignee ASC")}
              />
              {summary.workload.length === 0 ? (
                <p className="activity-empty">No open work items.</p>
              ) : (
                <ul className="pa-bars">
                  {summary.workload.map((entry) => (
                    <li key={entry.id ?? "unassigned"}>
                      <span className="pa-bar-label">
                        <PersonAvatar name={entry.id ? entry.name : "?"} />
                        {entry.name}
                      </span>
                      <span className="pa-bar-track">
                        <span
                          className="pa-bar-fill pa-fill-progress-bg"
                          style={{ width: `${entry.percent}%` }}
                        />
                      </span>
                      <span className="pa-bar-value">{entry.percent}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel pa-card">
              <CardHeader
                title="Epic progress"
                subtitle="Done child work items per epic."
                href={jqlHref("AND issuetype = Epic ORDER BY created DESC")}
              />
              {summary.epics.length === 0 ? (
                <p className="activity-empty">No epics in this project.</p>
              ) : (
                <ul className="pa-epics">
                  {summary.epics.map((epic) => {
                    const percent =
                      epic.total === 0
                        ? 0
                        : Math.round((epic.done / epic.total) * 100);
                    return (
                      <li key={epic.id}>
                        <Link href={issueHref(epic.id)} scroll={false}>
                          <KindIcon kind={epic.kind} projectId={projectId} />
                          <span className="pa-key">{epic.id}</span>
                          <span className="pa-epic-title">{epic.title}</span>
                        </Link>
                        <div className="pa-epic-progress">
                          <span className="pa-bar-track">
                            <span
                              className="pa-bar-fill pa-fill-done-bg"
                              style={{ width: `${percent}%` }}
                            />
                          </span>
                          <span className="pa-bar-value">
                            {epic.done}/{epic.total}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
