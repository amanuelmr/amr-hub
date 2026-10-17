"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronRight, Star } from "lucide-react";
import type { Project } from "../../data/projects";
import { ProjectAvatar } from "./ProjectAvatar";

export function StarredFlyout({
  projects,
  onNavigate,
}: {
  projects: Project[];
  onNavigate: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const starred = projects.filter((project) => project.starred);

  const close = () => {
    setIsOpen(false);
    onNavigate();
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={isOpen ? "shell-nav-item open" : "shell-nav-item"}
          title="Starred"
        >
          <Star size={16} aria-hidden="true" />
          <span className="shell-nav-label">Starred</span>
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
          <h3 className="shell-flyout-heading">Starred projects</h3>
          {starred.length === 0 ? (
            <p className="shell-flyout-empty">
              Star a project from its header to keep it close at hand.
            </p>
          ) : (
            <ul className="shell-flyout-list">
              {starred.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="shell-flyout-item"
                    onClick={close}
                  >
                    <ProjectAvatar project={project} />
                    <span className="shell-flyout-item-text">
                      <span>{project.name}</span>
                      <small>{project.key}</small>
                    </span>
                    <Star className="shell-flyout-star" size={13} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <footer className="shell-flyout-footer">
            <Link href="/projects" onClick={close}>
              View all projects
            </Link>
          </footer>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
