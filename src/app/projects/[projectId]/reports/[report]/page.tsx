"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useIssues } from "../../../../IssueProvider";
import { useProjects } from "../../../../ProjectProvider";
import { WorkspaceLoading } from "../../../../components/WorkspaceLoading";
import { findReport, type ReportSlug } from "../../../../components/reports/registry";
import type { ReportProps } from "../../../../components/reports/ReportShared";
import {
  BurndownReport,
  BurnupReport,
  SprintReportView,
} from "../../../../components/reports/SprintReports";
import {
  ControlChartReport,
  CreatedVsResolvedReport,
  CumulativeFlowReport,
  VelocityReport,
} from "../../../../components/reports/FlowReports";
import {
  EpicReport,
  PieReport,
  TimeTrackingReport,
  VersionReport,
  WorkloadReport,
} from "../../../../components/reports/PlanningReports";

const REPORT_COMPONENTS: Record<ReportSlug, (props: ReportProps) => React.ReactNode> = {
  burndown: BurndownReport,
  burnup: BurnupReport,
  sprint: SprintReportView,
  velocity: VelocityReport,
  "cumulative-flow": CumulativeFlowReport,
  "control-chart": ControlChartReport,
  "created-vs-resolved": CreatedVsResolvedReport,
  pie: PieReport,
  version: VersionReport,
  epic: EpicReport,
  "time-tracking": TimeTrackingReport,
  workload: WorkloadReport,
};

export default function ProjectReportPage() {
  const { projectId, report: slug } = useParams<{
    projectId: string;
    report: string;
  }>();
  const { allProjects: projects, isLoading: isLoadingProjects } = useProjects();
  const { issues, cycles, isLoading } = useIssues();
  const project = projects.find((candidate) => candidate.id === projectId);
  const projectIssues = useMemo(
    () => issues.filter((issue) => issue.projectId === projectId),
    [issues, projectId],
  );
  const definition = findReport(slug);

  if ((isLoading || isLoadingProjects) && (!project || issues.length === 0)) {
    return <WorkspaceLoading label="Loading reports" />;
  }

  const Report = definition ? REPORT_COMPONENTS[definition.slug] : null;

  return (
    <div className="page reports-page">
      <nav className="report-back" aria-label="Breadcrumb">
        <Link className="text-link" href={`/projects/${projectId}/reports`}>
          <ArrowLeft size={14} aria-hidden="true" /> Reports
        </Link>
      </nav>
      {!project || !definition || !Report ? (
        <div className="empty-state">
          <h2>Report not found</h2>
          <p>This report or project does not exist.</p>
        </div>
      ) : (
        <Report project={project} issues={projectIssues} cycles={cycles} />
      )}
    </div>
  );
}
