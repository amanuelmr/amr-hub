"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { CardField } from "../../data/projects";

/** Per-viewer board view settings, kept in this browser like Jira's. */
export type BoardView = {
  daysInColumn: boolean;
  compact: boolean;
  collapsedColumns: string[];
  /** Card fields this viewer hid; the board settings decide what's offered. */
  hiddenFields: CardField[];
  /** Fixed-width columns, or columns that grow to fill the board. */
  columnSize: "fixed" | "flexible";
  /** Scroll inside each column, or the whole board together. */
  scroll: "columns" | "board";
  /** Hide done work after this many days; undefined keeps the board's setting, null never hides. */
  doneDays?: number | null;
};

export const DEFAULT_BOARD_VIEW: BoardView = {
  daysInColumn: true,
  compact: false,
  collapsedColumns: [],
  hiddenFields: [],
  columnSize: "flexible",
  scroll: "columns",
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseBoardView(raw: string | null): BoardView {
  if (!raw) return DEFAULT_BOARD_VIEW;
  try {
    const value = JSON.parse(raw) as Partial<BoardView>;
    return {
      daysInColumn:
        typeof value.daysInColumn === "boolean"
          ? value.daysInColumn
          : DEFAULT_BOARD_VIEW.daysInColumn,
      compact: typeof value.compact === "boolean" ? value.compact : false,
      collapsedColumns: Array.isArray(value.collapsedColumns)
        ? value.collapsedColumns.filter((id): id is string => typeof id === "string")
        : [],
      hiddenFields: Array.isArray(value.hiddenFields)
        ? value.hiddenFields.filter((field): field is CardField => typeof field === "string")
        : [],
      columnSize: value.columnSize === "fixed" ? "fixed" : "flexible",
      scroll: value.scroll === "board" ? "board" : "columns",
      ...(value.doneDays === null || typeof value.doneDays === "number"
        ? { doneDays: value.doneDays }
        : {}),
    };
  } catch {
    return DEFAULT_BOARD_VIEW;
  }
}

export function useBoardView(projectId: string, boardId: string) {
  const key = `amr.board-view.${projectId}.${boardId}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const view = useMemo(() => parseBoardView(raw), [raw]);

  const update = useCallback(
    (change: (current: BoardView) => BoardView) => {
      const next = change(parseBoardView(read(key)));
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); the view just resets.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  const toggleColumn = useCallback(
    (columnId: string) =>
      update((current) => ({
        ...current,
        collapsedColumns: current.collapsedColumns.includes(columnId)
          ? current.collapsedColumns.filter((id) => id !== columnId)
          : [...current.collapsedColumns, columnId],
      })),
    [update],
  );

  return { view, update, toggleColumn };
}
