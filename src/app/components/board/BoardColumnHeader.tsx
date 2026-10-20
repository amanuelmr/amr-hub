"use client";

import { FormEvent, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronsLeftRight,
  ChevronsRightLeft,
  Gauge,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { BoardColumnConfig } from "../../data/projects";
import type { StatusCategory } from "../../data/workflow";

type Mode = "rename" | "limit" | null;

/**
 * Jira's column header: name, count, limit, a ✓ on done columns and a "…"
 * menu to rename, limit, move, collapse or delete the column.
 */
export function BoardColumnHeader({
  column,
  count,
  isDone,
  overLimit,
  collapsed,
  canConfigure,
  canMoveLeft,
  canMoveRight,
  canDelete,
  onToggleCollapse,
  onRename,
  onSetLimit,
  onMove,
  onDelete,
  children,
}: {
  column: BoardColumnConfig;
  count: number;
  isDone: boolean;
  overLimit: boolean;
  collapsed: boolean;
  canConfigure: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDelete: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => Promise<void>;
  onSetLimit: (limit: number | null) => Promise<void>;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const className = [
    "board-column-head",
    overLimit ? "over-limit" : "",
    collapsed ? "collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (collapsed) {
    return (
      <div className={className}>
        <button
          type="button"
          className="board-column-expand"
          aria-label={`Expand ${column.name}`}
          title={`Expand ${column.name}`}
          onClick={onToggleCollapse}
        >
          <ChevronsLeftRight size={14} aria-hidden="true" />
          <span className="board-column-name">{column.name}</span>
          <span className="board-column-count">{count}</span>
        </button>
      </div>
    );
  }

  const start = (next: Mode) => {
    setMode(next);
    setError(null);
    setValue(
      next === "rename"
        ? column.name
        : column.wipLimit !== null
          ? String(column.wipLimit)
          : "",
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (mode === "rename") {
        const name = value.trim();
        if (!name) {
          setError("Enter a name");
          return;
        }
        if (name !== column.name) await onRename(name.slice(0, 60));
      } else if (mode === "limit") {
        const trimmed = value.trim();
        const limit = trimmed === "" ? null : Number(trimmed);
        if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 999)) {
          setError("Use a whole number from 1 to 999, or leave it empty");
          return;
        }
        await onSetLimit(limit);
      }
      setMode(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save");
    }
  };

  if (mode) {
    return (
      <form className={`${className} editing`} onSubmit={submit}>
        <input
          className="board-column-input"
          value={value}
          autoFocus
          inputMode={mode === "limit" ? "numeric" : undefined}
          placeholder={mode === "limit" ? "No limit" : "Column name"}
          aria-label={mode === "limit" ? "Maximum work items" : "Column name"}
          aria-invalid={error ? true : undefined}
          title={error ?? undefined}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setMode(null)}
        />
        <button type="submit" className="board-column-icon" aria-label="Save">
          <Check size={14} aria-hidden="true" />
        </button>
        {error && <span className="sr-only" role="alert">{error}</span>}
      </form>
    );
  }

  return (
    <div className={className}>
      <span
        className="board-column-name"
        onDoubleClick={canConfigure ? () => start("rename") : undefined}
      >
        {column.name}
      </span>
      <span className="board-column-count">{count}</span>
      {isDone && (
        <Check
          className="board-column-done"
          size={14}
          aria-label="Done column"
        />
      )}
      {column.wipLimit !== null && (
        <span className="board-column-wip">Max {column.wipLimit}</span>
      )}
      {overLimit && <span className="sr-only">WIP limit exceeded</span>}
      {children}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="board-column-icon board-column-more"
            aria-label={`${column.name} column actions`}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="planning-menu" align="end" sideOffset={4}>
            {canConfigure && (
              <>
                <DropdownMenu.Item
                  className="planning-menu-item"
                  onSelect={() => start("rename")}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="planning-menu-item"
                  onSelect={() => start("limit")}
                >
                  <Gauge size={14} aria-hidden="true" />
                  Set column limit
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="planning-menu-item"
                  disabled={!canMoveLeft}
                  onSelect={() => onMove(-1)}
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  Move column left
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="planning-menu-item"
                  disabled={!canMoveRight}
                  onSelect={() => onMove(1)}
                >
                  <ArrowRight size={14} aria-hidden="true" />
                  Move column right
                </DropdownMenu.Item>
              </>
            )}
            <DropdownMenu.Item
              className="planning-menu-item"
              onSelect={onToggleCollapse}
            >
              <ChevronsRightLeft size={14} aria-hidden="true" />
              Collapse
            </DropdownMenu.Item>
            {canConfigure && (
              <DropdownMenu.Item
                className="planning-menu-item danger"
                disabled={!canDelete}
                onSelect={onDelete}
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

const CATEGORY_OPTIONS: { value: StatusCategory; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

/** Jira team-managed "+": a new column backed by a new workflow status. */
export function BoardAddColumn({
  onCreate,
}: {
  onCreate: (name: string, category: StatusCategory) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("IN_PROGRESS");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="board-add-column"
        aria-label="Create column"
        title="Create column"
        onClick={() => setIsOpen(true)}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    );
  }

  const close = () => {
    setIsOpen(false);
    setName("");
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a column name");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onCreate(name.trim().slice(0, 60), category);
      close();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Column could not be created",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="board-add-column-form" onSubmit={submit}>
      <input
        value={name}
        autoFocus
        maxLength={60}
        placeholder="Column name"
        aria-label="Column name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && close()}
      />
      <select
        value={category}
        aria-label="Status category"
        onChange={(event) => setCategory(event.target.value as StatusCategory)}
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="board-add-column-actions">
        <button type="submit" className="primary-button" disabled={isSaving}>
          {isSaving ? "Creating…" : "Create"}
        </button>
        <button type="button" className="secondary-button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
