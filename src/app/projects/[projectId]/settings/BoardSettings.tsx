"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useProjects } from "../../../ProjectProvider";
import type { IssueStatus } from "../../../data/issues";
import { statusName } from "../../../data/workflow";
import { useWorkflow } from "../../../WorkflowProvider";
import type {
  BoardColumnConfig,
  BoardConfig,
  BoardSwimlanes,
  Project,
} from "../../../data/projects";
import {
  addColumn,
  assignStatus,
  moveColumn,
  unmappedStatuses,
} from "./boardEditor";

function ColumnRow({
  column,
  nameOf,
  readOnly,
  canDelete,
  onChange,
  onDelete,
  onUnmap,
}: {
  column: BoardColumnConfig;
  nameOf: (status: IssueStatus) => string;
  readOnly: boolean;
  canDelete: boolean;
  onChange: (column: BoardColumnConfig) => void;
  onDelete: () => void;
  onUnmap: (status: IssueStatus) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, disabled: readOnly });

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "pa-column-row dragging" : "pa-column-row"}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="icon-button pa-drag-handle"
        aria-label={`Reorder ${column.name}`}
        disabled={readOnly}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <input
        className="pa-column-name"
        value={column.name}
        maxLength={40}
        disabled={readOnly}
        aria-label="Column name"
        onChange={(event) => onChange({ ...column, name: event.target.value })}
      />
      <div className="pa-column-statuses">
        {column.statuses.length === 0 && (
          <span className="pa-muted">No statuses</span>
        )}
        {column.statuses.map((status) => (
          <span className="pa-status-chip" key={status}>
            {nameOf(status)}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Unmap ${nameOf(status)}`}
                onClick={() => onUnmap(status)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <label className="pa-wip">
        WIP
        <input
          type="number"
          min={1}
          max={999}
          placeholder="—"
          disabled={readOnly}
          value={column.wipLimit ?? ""}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            onChange({
              ...column,
              wipLimit:
                Number.isFinite(value) && value > 0
                  ? Math.min(value, 999)
                  : null,
            });
          }}
        />
      </label>
      {!readOnly && (
        <button
          type="button"
          className="icon-button"
          aria-label={`Delete ${column.name}`}
          disabled={!canDelete}
          onClick={onDelete}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

export function BoardSettings({
  project,
  readOnly,
}: {
  project: Project;
  readOnly: boolean;
}) {
  const { updateProject } = useProjects();
  const workflow = useWorkflow(project.id);
  const statusOrder = workflow.statuses.map((status) => status.key);
  const nameOf = (status: IssueStatus) => statusName(status, workflow.statuses);
  const [config, setConfig] = useState<BoardConfig>(project.boardConfig);
  const [newColumnName, setNewColumnName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const unmapped = unmappedStatuses(config.columns, statusOrder);
  // Keys still mapped on the board but no longer in the workflow.
  const staleKeys = config.columns
    .flatMap((column) => column.statuses)
    .filter((key) => !statusOrder.includes(key));
  const setColumns = (columns: BoardColumnConfig[]) =>
    setConfig((current) => ({ ...current, columns }));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      setColumns(
        moveColumn(config.columns, String(active.id), String(over.id)),
      );
    }
  };

  const save = async () => {
    if (config.columns.some((column) => !column.name.trim())) {
      setMessage({ ok: false, text: "Every column needs a name." });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    const saved = await updateProject(project.id, {
      boardConfig: {
        ...config,
        columns: config.columns.map((column) => ({
          ...column,
          name: column.name.trim(),
        })),
      },
    });
    setIsSaving(false);
    setMessage(
      saved
        ? { ok: true, text: "Board configuration saved." }
        : { ok: false, text: "Board configuration could not be saved." },
    );
  };

  return (
    <div className="pa-form pa-settings-form">
      <section>
        <h3 className="pa-section-title">Columns</h3>
        <p className="pa-muted">
          Drag to reorder. Each status can be mapped to one column; WIP limits
          highlight columns holding too much work.
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={config.columns.map((column) => column.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="pa-column-list">
              {config.columns.map((column) => (
                <ColumnRow
                  key={column.id}
                  column={column}
                  nameOf={nameOf}
                  readOnly={readOnly}
                  canDelete={config.columns.length > 1}
                  onChange={(next) =>
                    setColumns(
                      config.columns.map((existing) =>
                        existing.id === next.id ? next : existing,
                      ),
                    )
                  }
                  onDelete={() =>
                    setColumns(
                      config.columns.filter(
                        (existing) => existing.id !== column.id,
                      ),
                    )
                  }
                  onUnmap={(status) =>
                    setColumns(
                      assignStatus(config.columns, status, null, statusOrder),
                    )
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {!readOnly && config.columns.length < 12 && (
          <form
            className="pa-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              setColumns(addColumn(config.columns, newColumnName));
              setNewColumnName("");
            }}
          >
            <input
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder="New column name"
              maxLength={40}
              aria-label="New column name"
            />
            <button className="secondary-button" type="submit">
              <Plus size={15} aria-hidden="true" />
              Add column
            </button>
          </form>
        )}
      </section>

      <section>
        <h3 className="pa-section-title">Status mapping</h3>
        <ul className="pa-mapping">
          {statusOrder.map((status) => {
            const column = config.columns.find((candidate) =>
              candidate.statuses.includes(status),
            );
            return (
              <li key={status}>
                <span>{nameOf(status)}</span>
                <select
                  value={column?.id ?? ""}
                  disabled={readOnly}
                  aria-label={`Column for ${nameOf(status)}`}
                  onChange={(event) =>
                    setColumns(
                      assignStatus(
                        config.columns,
                        status,
                        event.target.value || null,
                        statusOrder,
                      ),
                    )
                  }
                >
                  <option value="">Unmapped</option>
                  {config.columns.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name || "Untitled"}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
        {unmapped.length > 0 && (
          <p className="pa-muted">
            Unmapped statuses (hidden from the board):{" "}
            {unmapped.map(nameOf).join(", ")}
          </p>
        )}
        {staleKeys.length > 0 && !readOnly && (
          <p className="pa-muted">
            Some columns reference statuses removed from the workflow.{" "}
            <button
              type="button"
              className="pa-link-button"
              onClick={() =>
                setColumns(
                  config.columns.map((column) => ({
                    ...column,
                    statuses: column.statuses.filter((key) =>
                      statusOrder.includes(key),
                    ),
                  })),
                )
              }
            >
              Remove them
            </button>
          </p>
        )}
        <p className="pa-muted">
          Add or rename statuses on the Workflow tab.
        </p>
      </section>

      <section className="pa-form-row">
        <label className="form-field">
          <span>Default swimlanes</span>
          <select
            value={config.swimlanes}
            disabled={readOnly}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                swimlanes: event.target.value as BoardSwimlanes,
              }))
            }
          >
            <option value="NONE">None</option>
            <option value="ASSIGNEE">Assignee</option>
            <option value="EPIC">Epic</option>
            <option value="PRIORITY">Priority</option>
          </select>
        </label>
        <label className="form-field">
          <span>Estimation statistic</span>
          <select
            value={config.estimation}
            disabled={readOnly}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                estimation: event.target.value as BoardConfig["estimation"],
              }))
            }
          >
            <option value="STORY_POINTS">Story points</option>
            <option value="TIME">Original time estimate</option>
          </select>
        </label>
      </section>

      {project.boardType === "KANBAN" && (
        <label className="pa-checkbox">
          <input
            type="checkbox"
            checked={config.showBacklogColumn}
            disabled={readOnly}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                showBacklogColumn: event.target.checked,
              }))
            }
          />
          Show the Backlog status as a board column (Kanban)
        </label>
      )}

      {message && (
        <p
          className={message.ok ? "pa-success" : "form-submit-error"}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
      {!readOnly && (
        <div className="pa-dialog-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setConfig(project.boardConfig)}
          >
            Reset
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={isSaving}
            onClick={save}
          >
            {isSaving ? "Saving..." : "Save board"}
          </button>
        </div>
      )}
    </div>
  );
}
