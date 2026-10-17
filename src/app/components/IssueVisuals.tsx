"use client";

import {
  Bookmark,
  Bug,
  Circle,
  CircleCheck,
  CircleDot,
  CircleHelp,
  Clock3,
  Eye,
  FileText,
  Flag,
  FlaskConical,
  Layers,
  Lightbulb,
  Rocket,
  Shield,
  SquareCheck,
  SquareSplitVertical,
  Star,
  Target,
  Wrench,
  Zap,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react";
import type { CSSProperties } from "react";
import {
  PRIORITY_LABELS,
  type IssueKind,
  type IssuePriority,
  type IssueStatus,
} from "../data/issues";
import {
  defaultTypeStyle,
  isBuiltinKind,
  statusClassName,
} from "../data/workflow";
import { useWorkflows } from "../WorkflowProvider";

export function StatusBadge({
  status,
  projectId,
}: {
  status: IssueStatus;
  projectId?: string | null;
}) {
  const meta = useWorkflows().statusMeta(projectId, status);
  const Icon =
    meta.category === "DONE"
      ? CircleCheck
      : status === "IN_REVIEW"
        ? Eye
        : meta.category === "IN_PROGRESS"
          ? Clock3
          : status === "BACKLOG"
            ? Circle
            : CircleDot;

  return (
    <span
      className={`status-badge ${statusClassName(status)}`}
      style={meta.color ? { color: meta.color } : undefined}
    >
      <Icon size={14} aria-hidden="true" />
      {meta.name}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  const Icon =
    priority === "URGENT" || priority === "HIGH"
      ? SignalHigh
      : priority === "MEDIUM"
        ? SignalMedium
        : SignalLow;

  return (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      <Icon size={14} aria-hidden="true" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/** Lucide glyphs for the curated work type icon set. */
export const WORK_TYPE_ICON_COMPONENTS: Record<string, typeof Bug> = {
  "square-check": SquareCheck,
  bookmark: Bookmark,
  bug: Bug,
  zap: Zap,
  "square-split-vertical": SquareSplitVertical,
  "flask-conical": FlaskConical,
  rocket: Rocket,
  lightbulb: Lightbulb,
  wrench: Wrench,
  shield: Shield,
  "file-text": FileText,
  flag: Flag,
  star: Star,
  target: Target,
  layers: Layers,
  "circle-help": CircleHelp,
};

export function WorkTypeGlyph({ icon, size = 15 }: { icon: string; size?: number }) {
  const Icon = WORK_TYPE_ICON_COMPONENTS[icon] ?? SquareCheck;
  return <Icon size={size} aria-hidden="true" />;
}

export function typeIconStyle(color: string): CSSProperties {
  return {
    color,
    background: `color-mix(in srgb, ${color} 16%, transparent)`,
  };
}

export function KindIcon({
  kind,
  projectId,
}: {
  kind: IssueKind;
  projectId?: string | null;
}) {
  const meta = useWorkflows().typeMeta(projectId, kind);
  const builtin = isBuiltinKind(kind);
  const customized =
    !builtin || meta.color.toLowerCase() !== defaultTypeStyle(kind).color;

  return (
    <span
      className={`kind-icon ${builtin ? `kind-${kind.toLowerCase()}` : "kind-custom"}`}
      style={customized ? typeIconStyle(meta.color) : undefined}
      title={meta.name}
    >
      <WorkTypeGlyph icon={meta.icon} />
      <span className="sr-only">{meta.name}</span>
    </span>
  );
}
