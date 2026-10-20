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
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { parseJql } from "../../../data/jql";
import { useProjects } from "../../../ProjectProvider";
import type { IssueStatus } from "../../../data/issues";
import { statusName } from "../../../data/workflow";
import { useWorkflow } from "../../../WorkflowProvider";
import {
  CARD_BASE_FIELDS,
  CARD_EXTRA_FIELDS,
  CARD_FIELD_LABELS,
  MAX_CARD_EXTRA_FIELDS,
  type BoardColumnConfig,
  type BoardConfig,
  type BoardQuery,
  type BoardSwimlanes,
  type CardColorStrategy,
  type Project,
  type ProjectBoard,
} from "../../../data/projects";
import {
  addColumn,
  addQuery,
  assignStatus,
  moveColumn,
  removeQuery,
  shiftQuery,
  toggleCardField,
  unmappedStatuses,
  updateQuery,
} from "./boardEditor";

const QUERY_COLORS = ["#e5484d", "#f76b15", "#ffb224", "#30a46c", "#3e63dd", "#8e4ec6"];

function jqlError(jql: string) {
  if (!jql.trim()) return "Enter a JQL query";
  const parsed = parseJql(jql);
  return parsed.ok ? null : parsed.error.message;
}

/** Editable list of named JQL queries (quick filters, swimlanes, card colors). */
function QueryListEditor({
  queries,
  readOnly,
  withColor = false,
  addLabel,
  emptyText,
  onChange,
}: {
  queries: BoardQuery[];
  readOnly: boolean;
  withColor?: boolean;
  addLabel: string;
  emptyText: string;
  onChange: (queries: BoardQuery[]) => void;
}) {
  return (
    <div className="pa-query-list">
      {queries.length === 0 && <p className="pa-muted">{emptyText}</p>}
      {queries.map((query, index) => {
        const error = jqlError(query.jql);
        return (
          <div className="pa-query-row" key={query.id}>
            {withColor && (
              <input
                type="color"
                className="pa-query-color"
                value={query.color ?? QUERY_COLORS[0]}
                disabled={readOnly}
                aria-label={`Color for ${query.name || "query"}`}
                onChange={(event) =>
                  onChange(updateQuery(queries, query.id, { color: event.target.value }))
                }
              />
            )}
            <input
              className="pa-query-name"
              value={query.name}
              maxLength={60}
              placeholder="Name"
              disabled={readOnly}
              aria-label="Name"
              onChange={(event) =>
                onChange(updateQuery(queries, query.id, { name: event.target.value }))
              }
            />
            <input
              className={error ? "pa-query-jql invalid" : "pa-query-jql"}
              value={query.jql}
              maxLength={2000}
              placeholder='JQL, e.g. assignee = currentUser()'
              disabled={readOnly}
              aria-label={`JQL for ${query.name || "query"}`}
              aria-invalid={!!error}
              spellCheck={false}
              onChange={(event) =>
                onChange(updateQuery(queries, query.id, { jql: event.target.value }))
              }
            />
            {!readOnly && (
              <span className="pa-query-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${query.name || "query"} up`}
                  disabled={index === 0}
                  onClick={() => onChange(shiftQuery(queries, query.id, -1))}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${query.name || "query"} down`}
                  disabled={index === queries.length - 1}
                  onClick={() => onChange(shiftQuery(queries, query.id, 1))}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${query.name || "query"}`}
                  onClick={() => onChange(removeQuery(queries, query.id))}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </span>
            )}
            {error && query.jql.trim() && (
              <p className="field-error pa-query-error">Invalid JQL: {error}</p>
            )}
          </div>
        );
      })}
      {!readOnly && queries.length < 20 && (
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            onChange(
              addQuery(queries, {
                name: "",
                jql: "",
                ...(withColor
                  ? { color: QUERY_COLORS[queries.length % QUERY_COLORS.length] }
                  : {}),
              }),
            )
          }
        >
          <Plus size={15} aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

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
  board,
  onSaveBoard,
}: {
  project: Project;
  readOnly: boolean;
  /** An extra board being edited; omit for the project's default board. */
  board?: ProjectBoard;
  onSaveBoard?: (config: BoardConfig) => Promise<void>;
}) {
  const { updateProject } = useProjects();
  const isExtraBoard = !!board && !board.isDefault;
  const initialConfig = isExtraBoard ? board.config : project.boardConfig;
  const workflow = useWorkflow(project.id);
  const statusOrder = workflow.statuses.map((status) => status.key);
  const nameOf = (status: IssueStatus) => statusName(status, workflow.statuses);
  const [config, setConfig] = useState<BoardConfig>(initialConfig);
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

  const trimQuery = (query: BoardQuery): BoardQuery => ({
    ...query,
    name: query.name.trim(),
    jql: query.jql.trim(),
  });
  const extraCount = config.cardFields.filter((field) =>
    CARD_EXTRA_FIELDS.includes(field),
  ).length;

  const save = async () => {
    if (config.columns.some((column) => !column.name.trim())) {
      setMessage({ ok: false, text: "Every column needs a name." });
      return;
    }
    const queryLists = [
      config.quickFilters,
      config.swimlaneQueries,
      config.cardColors.strategy === "QUERY" ? config.cardColors.queries : [],
    ];
    if (
      queryLists.some((list) =>
        list.some((query) => !query.name.trim() || jqlError(query.jql)),
      )
    ) {
      setMessage({
        ok: false,
        text: "Every quick filter, swimlane and card color needs a name and valid JQL.",
      });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    const cleaned: BoardConfig = {
      ...config,
      columns: config.columns.map((column) => ({
        ...column,
        name: column.name.trim(),
      })),
      quickFilters: config.quickFilters.map(trimQuery),
      swimlaneQueries: config.swimlaneQueries.map(trimQuery),
      cardColors: {
        ...config.cardColors,
        queries: config.cardColors.queries.map(trimQuery),
      },
    };
    let saved: boolean;
    if (isExtraBoard && onSaveBoard) {
      saved = await onSaveBoard(cleaned).then(
        () => true,
        () => false,
      );
    } else {
      saved = await updateProject(project.id, { boardConfig: cleaned });
    }
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
            <option value="SUBTASKS">Subtasks</option>
            <option value="QUERY">Queries</option>
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

      {config.swimlanes === "QUERY" && (
        <section>
          <h3 className="pa-section-title">Swimlane queries</h3>
          <p className="pa-muted">
            Each work item appears in the first swimlane whose JQL matches it;
            the rest go to &ldquo;Everything else&rdquo;.
          </p>
          <QueryListEditor
            queries={config.swimlaneQueries}
            readOnly={readOnly}
            addLabel="Add swimlane"
            emptyText="No swimlanes yet."
            onChange={(swimlaneQueries) =>
              setConfig((current) => ({ ...current, swimlaneQueries }))
            }
          />
        </section>
      )}

      <section>
        <h3 className="pa-section-title">Quick filters</h3>
        <p className="pa-muted">
          Quick filters appear as buttons on the board and backlog. Turning on
          several shows only work items matching all of them.
        </p>
        <QueryListEditor
          queries={config.quickFilters}
          readOnly={readOnly}
          addLabel="Add quick filter"
          emptyText="No quick filters yet."
          onChange={(quickFilters) =>
            setConfig((current) => ({ ...current, quickFilters }))
          }
        />
      </section>

      <section>
        <h3 className="pa-section-title">Card layout</h3>
        <p className="pa-muted">
          Choose the fields shown on board cards. You can add up to{" "}
          {MAX_CARD_EXTRA_FIELDS} extra fields.
        </p>
        <div className="pa-card-fields">
          <fieldset>
            <legend>Default fields</legend>
            {CARD_BASE_FIELDS.map((field) => (
              <label className="pa-checkbox" key={field}>
                <input
                  type="checkbox"
                  checked={config.cardFields.includes(field)}
                  disabled={readOnly}
                  onChange={() =>
                    setConfig((current) => ({
                      ...current,
                      cardFields: toggleCardField(current.cardFields, field),
                    }))
                  }
                />
                {CARD_FIELD_LABELS[field]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>
              Extra fields ({extraCount}/{MAX_CARD_EXTRA_FIELDS})
            </legend>
            {CARD_EXTRA_FIELDS.map((field) => {
              const checked = config.cardFields.includes(field);
              return (
                <label className="pa-checkbox" key={field}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={
                      readOnly || (!checked && extraCount >= MAX_CARD_EXTRA_FIELDS)
                    }
                    onChange={() =>
                      setConfig((current) => ({
                        ...current,
                        cardFields: toggleCardField(current.cardFields, field),
                      }))
                    }
                  />
                  {CARD_FIELD_LABELS[field]}
                </label>
              );
            })}
          </fieldset>
        </div>
      </section>

      <section>
        <h3 className="pa-section-title">Card colors</h3>
        <label className="form-field">
          <span>Colors based on</span>
          <select
            value={config.cardColors.strategy}
            disabled={readOnly}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                cardColors: {
                  ...current.cardColors,
                  strategy: event.target.value as CardColorStrategy,
                },
              }))
            }
          >
            <option value="NONE">None</option>
            <option value="ISSUE_TYPE">Work type</option>
            <option value="PRIORITY">Priority</option>
            <option value="ASSIGNEE">Assignee</option>
            <option value="QUERY">Queries</option>
          </select>
        </label>
        {config.cardColors.strategy === "QUERY" && (
          <>
            <p className="pa-muted">
              Cards take the color of the first query they match.
            </p>
            <QueryListEditor
              queries={config.cardColors.queries}
              readOnly={readOnly}
              withColor
              addLabel="Add color"
              emptyText="No card colors yet."
              onChange={(queries) =>
                setConfig((current) => ({
                  ...current,
                  cardColors: { ...current.cardColors, queries },
                }))
              }
            />
          </>
        )}
        {config.cardColors.strategy !== "NONE" &&
          config.cardColors.strategy !== "QUERY" && (
            <p className="pa-muted">
              Cards show a color bar on the left based on their{" "}
              {config.cardColors.strategy === "ISSUE_TYPE"
                ? "work type color"
                : config.cardColors.strategy === "PRIORITY"
                  ? "priority"
                  : "assignee"}
              .
            </p>
          )}
      </section>

      {project.boardType === "SCRUM" && (
        <section>
          <h3 className="pa-section-title">Sprints</h3>
          <label className="pa-checkbox">
            <input
              type="checkbox"
              checked={config.parallelSprints}
              disabled={readOnly}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  parallelSprints: event.target.checked,
                }))
              }
            />
            Allow parallel sprints (more than one active sprint at a time)
          </label>
        </section>
      )}

      {project.boardType === "KANBAN" && (
        <label className="form-field pa-done-days">
          <span>Hide completed work items older than</span>
          <select
            value={config.kanbanDoneDays === null ? "" : String(config.kanbanDoneDays)}
            disabled={readOnly}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                kanbanDoneDays: event.target.value ? Number(event.target.value) : null,
              }))
            }
          >
            {[1, 7, 14, 28, 60, 90].map((days) => (
              <option key={days} value={days}>
                {days === 1 ? "1 day" : `${days} days`}
              </option>
            ))}
            {config.kanbanDoneDays !== null &&
              ![1, 7, 14, 28, 60, 90].includes(config.kanbanDoneDays) && (
                <option value={config.kanbanDoneDays}>
                  {config.kanbanDoneDays} days
                </option>
              )}
            <option value="">Never hide</option>
          </select>
        </label>
      )}

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
            onClick={() => setConfig(initialConfig)}
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
