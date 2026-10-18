"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { useProjects } from "../../../ProjectProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { REPORTS, REPORT_GROUPS } from "../../../components/reports/registry";

export default function ProjectReportsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { allProjects: projects, isLoading } = useProjects();
  const project = projects.find((candidate) => candidate.id === projectId);
  const [query, setQuery] = useState("");

  if (isLoading && !project) return <WorkspaceLoading label="Loading reports" />;

  const needle = query.trim().toLowerCase();
  const available = REPORTS.filter(
    (report) =>
      !(report.scrumOnly && project?.boardType === "KANBAN") &&
      (!needle ||
        `${report.title} ${report.description}`.toLowerCase().includes(needle)),
  );

  return (
    <div className="page reports-page">
      <h1 className="sr-only">Reports</h1>
      <div className="jira-toolbar">
        <label className="jira-toolbar-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search reports</span>
          <input
            type="search"
            placeholder="Search reports"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {available.length === 0 && (
        <p className="empty-state">No reports match “{query}”.</p>
      )}
      {REPORT_GROUPS.map((group) => {
        const reports = available.filter((report) => report.group === group);
        if (reports.length === 0) return null;
        return (
          <section key={group} className="reports-group" aria-label={group}>
            <h2 className="reports-group-title">{group}</h2>
            <div className="reports-grid">
              {reports.map(({ slug, title, description, icon: Icon }) => (
                <Link
                  key={slug}
                  href={`/projects/${projectId}/reports/${slug}`}
                  className="panel report-card"
                >
                  <span className="report-card-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="report-card-body">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowRight className="report-card-arrow" size={15} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
