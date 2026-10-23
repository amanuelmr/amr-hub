"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { SlidersHorizontal, X } from "lucide-react";
import type { Issue } from "../../data/issues";
import {
  BACKLOG_FIELDS,
  workloadByAssignee,
  type BacklogField,
  type BacklogView,
} from "./backlogView";
import { MemberAvatar } from "./PlanningVisuals";

const AVATAR_LIMIT = 4;

/**
 * The assignee avatars in a sprint header; they open the sprint's workload:
 * work items and story points per person.
 */
export function SprintWorkload({
  sprintName,
  issues,
  subtasks,
}: {
  sprintName: string;
  issues: Issue[];
  subtasks: Issue[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [withSubtasks, setWithSubtasks] = useState(false);
  const people = [
    ...new Map(
      issues.filter((issue) => issue.assignee).map((issue) => [issue.assignee!.id, issue.assignee!]),
    ).values(),
  ];
  if (issues.length === 0) return null;
  const { rows, total } = workloadByAssignee(issues, withSubtasks ? subtasks : []);

  return (
    <>
      <button
        type="button"
        className="backlog-workload-trigger"
        aria-label={`Workload by assignee for ${sprintName}`}
        title="Workload by assignee"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
      >
        {people.length === 0 ? (
          <MemberAvatar member={null} />
        ) : (
          people.slice(0, AVATAR_LIMIT).map((person) => <MemberAvatar key={person.id} member={person} />)
        )}
      </button>
      {isOpen && (
        <Dialog.Root open onOpenChange={setIsOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="planning-dialog-overlay" />
            <Dialog.Content className="save-view-dialog planning-dialog">
              <header>
                <Dialog.Title asChild>
                  <h2>Workload by assignee</h2>
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button className="icon-button" type="button" aria-label="Close">
                    <X size={16} aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>
              <Dialog.Description>{sprintName}</Dialog.Description>
              <label className="planning-check-row">
                <input
                  type="checkbox"
                  checked={withSubtasks}
                  onChange={() => setWithSubtasks((current) => !current)}
                />
                Include subtasks in estimates
              </label>
              <table className="backlog-workload-table">
                <thead>
                  <tr>
                    <th scope="col">Assignee</th>
                    <th scope="col">Work items</th>
                    <th scope="col">Story points</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.assigneeId ?? "unassigned"}>
                      <td>
                        <span className="backlog-workload-person">
                          <MemberAvatar member={row.assigneeId ? { name: row.name } : null} />
                          {row.name}
                        </span>
                      </td>
                      <td>{row.items}</td>
                      <td>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{total.items}</td>
                    <td>{total.points}</td>
                  </tr>
                </tfoot>
              </table>
              <footer className="filter-details-actions">
                <button className="primary-button" type="button" onClick={() => setIsOpen(false)}>
                  Done
                </button>
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}

/** Per-viewer backlog settings: side panels, density and row fields. */
export function BacklogViewSettings({
  view,
  onUpdate,
  showVersions,
  showEpics,
  onToggleVersions,
  onToggleEpics,
}: {
  view: BacklogView;
  onUpdate: (change: (current: BacklogView) => BacklogView) => void;
  showVersions: boolean;
  showEpics: boolean;
  onToggleVersions: () => void;
  onToggleEpics: () => void;
}) {
  const toggleField = (field: BacklogField) =>
    onUpdate((current) => ({
      ...current,
      hidden: current.hidden.includes(field)
        ? current.hidden.filter((hidden) => hidden !== field)
        : [...current.hidden, field],
    }));

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="icon-button" type="button" aria-label="View settings" title="View settings">
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="backlog-view-settings" align="end" sideOffset={6}>
          <h3>View settings</h3>
          <label>
            <input type="checkbox" checked={showVersions} onChange={onToggleVersions} />
            Version panel
            <kbd>V</kbd>
          </label>
          <label>
            <input type="checkbox" checked={showEpics} onChange={onToggleEpics} />
            Epic panel
            <kbd>E</kbd>
          </label>
          <h4>Density</h4>
          {(["default", "compact"] as const).map((density) => (
            <label key={density}>
              <input
                type="radio"
                name="backlog-density"
                checked={view.density === density}
                onChange={() => onUpdate((current) => ({ ...current, density }))}
              />
              {density === "default" ? "Default" : "Compact"}
            </label>
          ))}
          <h4>Fields</h4>
          {BACKLOG_FIELDS.map((field) => (
            <label key={field.key}>
              <input
                type="checkbox"
                checked={!view.hidden.includes(field.key)}
                onChange={() => toggleField(field.key)}
              />
              {field.label}
            </label>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
