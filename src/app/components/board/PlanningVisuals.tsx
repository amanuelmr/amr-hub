import type { CSSProperties } from "react";
import { Flag } from "lucide-react";
import type { IssueRef, WorkspaceMember } from "../../data/issues";
import { epicColor, initials } from "./boardModel";

export function MemberAvatar({
  member,
  size = "small",
}: {
  member: Pick<WorkspaceMember, "name"> | null;
  size?: "small" | "regular";
}) {
  return (
    <span
      className={size === "small" ? "avatar avatar-small" : "avatar"}
      title={member?.name ?? "Unassigned"}
    >
      {member ? initials(member.name) : "?"}
      <span className="sr-only">{member?.name ?? "Unassigned"}</span>
    </span>
  );
}

export function EpicChip({ epic }: { epic: Pick<IssueRef, "id" | "title"> }) {
  return (
    <span
      className="planning-epic-chip"
      style={{ "--epic-color": epicColor(epic.id) } as CSSProperties}
      title={`Epic: ${epic.title}`}
    >
      {epic.title}
    </span>
  );
}

export function PointsBadge({ points }: { points: number | null }) {
  return (
    <span
      className={points === null ? "planning-points empty" : "planning-points"}
      title="Story points"
    >
      {points ?? "-"}
    </span>
  );
}

export function FlagMark() {
  return (
    <span className="planning-flag" title="Flagged">
      <Flag size={12} aria-hidden="true" />
      <span className="sr-only">Flagged</span>
    </span>
  );
}
