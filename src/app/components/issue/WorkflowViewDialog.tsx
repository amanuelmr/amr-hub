"use client";

import { ArrowRight } from "lucide-react";
import {
  allowedTransitions,
  orderStatuses,
  transitionLabel,
  type ProjectWorkflow,
  type StatusCategory,
} from "../../data/workflow";
import { IssueDialog } from "./IssueDialogs";

const CATEGORIES: { key: StatusCategory; label: string }[] = [
  { key: "TODO", label: "To do" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "DONE", label: "Done" },
];

/**
 * Read-only view of the project's workflow: every status by category, with
 * the current one marked, and where each status can move next.
 */
export function WorkflowViewDialog({
  workflow,
  currentStatus,
  onClose,
}: {
  workflow: ProjectWorkflow;
  currentStatus: string;
  onClose: () => void;
}) {
  const statuses = orderStatuses(workflow.statuses);
  const fromCurrent = new Set(
    allowedTransitions(workflow, currentStatus).map((transition) => transition.toKey),
  );
  const hasRules = workflow.transitions.some((transition) => transition.fromKey !== null);

  return (
    <IssueDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Workflow"
      description={
        hasRules
          ? "Statuses this work item can move between. Highlighted statuses are reachable from the current one."
          : "This project lets work move freely between any statuses."
      }
    >
      <div className="workflow-view">
        <div className="workflow-view-lanes">
          {CATEGORIES.map((category) => (
            <section key={category.key} className="workflow-view-lane">
              <h3>{category.label}</h3>
              {statuses
                .filter((status) => status.category === category.key)
                .map((status) => (
                  <span
                    key={status.key}
                    className={[
                      "workflow-view-status",
                      `status-category-${status.category.toLowerCase()}`,
                      status.key === currentStatus ? "is-current" : "",
                      fromCurrent.has(status.key) ? "is-next" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={status.key === currentStatus ? "true" : undefined}
                  >
                    {status.name}
                    {status.key === currentStatus && <small>Current</small>}
                  </span>
                ))}
            </section>
          ))}
        </div>
        <h3 className="workflow-view-heading">Transitions</h3>
        <ul className="workflow-view-transitions">
          {statuses.map((status) => {
            const next = allowedTransitions(workflow, status.key);
            return (
              <li key={status.key} className={status.key === currentStatus ? "is-current" : undefined}>
                <span className="workflow-view-from">{status.name}</span>
                <ArrowRight size={13} aria-hidden="true" />
                <span className="workflow-view-to">
                  {next.length === 0
                    ? "No transitions"
                    : next.map((transition) => transitionLabel(transition, statuses)).join(", ")}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </IssueDialog>
  );
}
