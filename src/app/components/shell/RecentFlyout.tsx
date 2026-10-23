"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronRight, Clock3 } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import type { IssueKind } from "../../data/issues";
import type { Project } from "../../data/projects";
import { KindIcon } from "../IssueVisuals";
import { ProjectAvatar } from "./ProjectAvatar";
import { groupRecent } from "./recentGroups";

type RecentIssue = {
  id: string;
  title: string;
  kind: IssueKind;
  projectId: string;
  viewedAt: string;
};

export function RecentFlyout({
  recentProjects,
  onNavigate,
}: {
  recentProjects: Project[];
  onNavigate: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [issues, setIssues] = useState<RecentIssue[] | null>(null);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) return;
    apiRequest<{ recent: RecentIssue[] }>("/api/your-work?only=recent&limit=20")
      .then((response) => setIssues(response.recent ?? []))
      .catch(() => setIssues((current) => current ?? []));
  };

  const close = () => {
    setIsOpen(false);
    onNavigate();
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={isOpen ? "shell-nav-item open" : "shell-nav-item"}
          title="Recent"
        >
          <Clock3 size={16} aria-hidden="true" />
          <span className="shell-nav-label">Recent</span>
          <ChevronRight className="shell-nav-trailing" size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="shell-flyout"
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
        >
          <section aria-label="Recently viewed work items">
            <h3 className="shell-flyout-heading">Viewed work items</h3>
            {issues === null ? (
              <p className="shell-flyout-empty">Loading…</p>
            ) : issues.length === 0 ? (
              <p className="shell-flyout-empty">Work items you view will show up here.</p>
            ) : (
              groupRecent(issues, new Date()).map((group) => (
                <div key={group.label} className="shell-flyout-group">
                  <h4 className="shell-flyout-subheading">{group.label}</h4>
                  <ul className="shell-flyout-list">
                    {group.items.map((issue) => (
                      <li key={issue.id}>
                        <Link
                          href={`/issues/${issue.id}`}
                          className="shell-flyout-item"
                          onClick={close}
                        >
                          <KindIcon kind={issue.kind} />
                          <span className="shell-flyout-item-text">
                            <span>{issue.title}</span>
                            <small>{issue.id}</small>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
          {recentProjects.length > 0 && (
            <section aria-label="Recent projects">
              <h3 className="shell-flyout-heading">Projects</h3>
              <ul className="shell-flyout-list">
                {recentProjects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="shell-flyout-item"
                      onClick={close}
                    >
                      <ProjectAvatar project={project} />
                      <span className="shell-flyout-item-text">
                        <span>{project.name}</span>
                        <small>{project.boardType === "KANBAN" ? "Kanban" : "Scrum"} project</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <footer className="shell-flyout-footer">
            <Link href="/your-work" onClick={close}>
              View all recent items
            </Link>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
