"use client";

import { Suspense } from "react";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft } from "lucide-react";
import { useProjects } from "../../../ProjectProvider";
import { WorkspaceLoading } from "../../../components/WorkspaceLoading";
import { AutomationSettings } from "./AutomationSettings";
import { BoardSettings } from "./BoardSettings";
import { DangerZone } from "./DangerZone";
import { DetailsSettings } from "./DetailsSettings";
import { FieldSettings } from "./FieldSettings";
import { WorkflowSettings } from "./WorkflowSettings";
import { WorkTypeSettings } from "./WorkTypeSettings";
import { useProjectPeople, useWorkspaceRole } from "./adminUi";

const SECTIONS = [
  { value: "details", label: "Details" },
  { value: "types", label: "Work types" },
  { value: "fields", label: "Fields" },
  { value: "workflow", label: "Workflow" },
  { value: "board", label: "Board" },
  { value: "automation", label: "Automation" },
  { value: "danger", label: "Danger zone" },
] as const;

type SectionValue = (typeof SECTIONS)[number]["value"];

function isSection(value: string | null): value is SectionValue {
  return SECTIONS.some((section) => section.value === value);
}

export default function ProjectSettingsPage() {
  return (
    <Suspense fallback={<WorkspaceLoading label="settings" />}>
      <ProjectSettings />
    </Suspense>
  );
}

function ProjectSettings() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { projects, isLoading } = useProjects();
  const { isViewer, isOwner } = useWorkspaceRole();
  const people = useProjectPeople(projectId);
  const project = projects.find((candidate) => candidate.id === projectId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SectionValue = isSection(tabParam) ? tabParam : "details";

  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "details") params.delete("tab");
    else params.set("tab", value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  if (isLoading && !project) return <WorkspaceLoading label="settings" />;

  if (!project) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Project not found</h2>
          <p>It may have been removed, or you may not have access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page pa-settings-page">
      <Tabs.Root
        className="pa-settings"
        value={activeTab}
        onValueChange={selectTab}
        orientation="vertical"
      >
        <aside className="pa-settings-sidebar">
          <Link className="pa-settings-back" href={`/projects/${project.id}`}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to project
          </Link>
          <div className="pa-settings-project">
            <span
              className="pa-settings-avatar"
              style={{ background: project.color ?? "var(--gray-300)" }}
              aria-hidden="true"
            >
              {project.key.slice(0, 2)}
            </span>
            <span>
              <strong>{project.name}</strong>
              <small>
                {project.boardType === "KANBAN" ? "Kanban" : "Scrum"} software
                project
              </small>
            </span>
          </div>
          <Tabs.List className="pa-settings-nav" aria-label="Settings sections">
            {SECTIONS.map((section) => (
              <Tabs.Trigger
                key={section.value}
                value={section.value}
                className={
                  section.value === "danger"
                    ? "pa-settings-tab pa-settings-tab-danger"
                    : "pa-settings-tab"
                }
              >
                {section.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </aside>

        <div className="pa-settings-main">
          <header className="jira-page-header">
            <div>
              <h1 className="jira-page-title">Project settings</h1>
              {isViewer && (
                <p className="jira-page-subtitle">
                  Viewers can see settings but not change them.
                </p>
              )}
            </div>
          </header>
          <Tabs.Content value="details" className="panel pa-settings-panel">
            <h2>Details</h2>
            <DetailsSettings
              key={`${project.id}-details`}
              project={project}
              people={people}
              readOnly={isViewer}
            />
          </Tabs.Content>
          <Tabs.Content value="types" className="panel pa-settings-panel">
            <h2>Work types</h2>
            <WorkTypeSettings projectId={project.id} readOnly={isViewer} />
          </Tabs.Content>
          <Tabs.Content value="fields" className="panel pa-settings-panel">
            <h2>Fields</h2>
            <FieldSettings projectId={project.id} readOnly={isViewer} />
          </Tabs.Content>
          <Tabs.Content value="workflow" className="panel pa-settings-panel">
            <h2>Workflow</h2>
            <WorkflowSettings projectId={project.id} readOnly={isViewer} />
          </Tabs.Content>
          <Tabs.Content value="board" className="panel pa-settings-panel">
            <h2>Board</h2>
            <BoardSettings
              // Remount when the server changes the mapping (e.g. a new status).
              key={`${project.id}-board-${JSON.stringify(project.boardConfig)}`}
              project={project}
              readOnly={isViewer}
            />
          </Tabs.Content>
          <Tabs.Content value="automation" className="panel pa-settings-panel">
            <h2>Automation</h2>
            <AutomationSettings projectId={project.id} readOnly={isViewer} />
          </Tabs.Content>
          <Tabs.Content value="danger" className="panel pa-settings-panel">
            <h2>Danger zone</h2>
            <DangerZone project={project} isOwner={isOwner} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
