import type { Project } from "../../data/projects";

/** Jira-style project avatar: a colored square with the project key initials. */
export function ProjectAvatar({
  project,
  size = "sm",
}: {
  project: Pick<Project, "key" | "color">;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`shell-project-avatar shell-project-avatar-${size}`}
      style={{ background: project.color ?? "var(--gray-400)" }}
      aria-hidden="true"
    >
      {project.key.slice(0, 2).toUpperCase()}
    </span>
  );
}
