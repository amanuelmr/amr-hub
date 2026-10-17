"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { Issue } from "../../data/issues";
import type { JqlField, JqlOrderBy } from "../../data/jql";
import { columnsFrom, type ColumnId, type ColumnLookups } from "./columns";

type IssueResultsTableProps = {
  issues: Issue[];
  columns: ColumnId[];
  lookups: ColumnLookups;
  orderBy: JqlOrderBy[];
  onSort?: (field: JqlField) => void;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  onToggleAll?: (select: boolean) => void;
  activeIssueId?: string | null;
  onActivate?: (id: string) => void;
};

export function IssueResultsTable({
  issues,
  columns,
  lookups,
  orderBy,
  onSort,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  activeIssueId,
  onActivate,
}: IssueResultsTableProps) {
  const visible = columnsFrom(columns);
  const selectable = !!selectedIds && !!onToggleSelected;
  const template = [
    ...(selectable ? ["36px"] : []),
    ...visible.map((column) => column.width),
  ].join(" ");
  const allSelected =
    selectable && issues.length > 0 && issues.every((issue) => selectedIds.has(issue.id));
  const someSelected =
    selectable && !allSelected && issues.some((issue) => selectedIds.has(issue.id));
  const primary = orderBy[0];

  return (
    <div className="search-table-scroll">
      <div className="search-table" role="table" aria-rowcount={issues.length}>
        <div
          className="search-table-row search-table-head"
          role="row"
          style={{ gridTemplateColumns: template }}
        >
          {selectable && (
            <span role="columnheader" className="search-check-cell">
              <input
                type="checkbox"
                aria-label="Select all issues on this page"
                checked={allSelected}
                ref={(element) => {
                  if (element) element.indeterminate = someSelected;
                }}
                onChange={(event) => onToggleAll?.(event.target.checked)}
              />
            </span>
          )}
          {visible.map((column) => {
            const isSorted = primary?.field === column.sortField;
            return (
              <span
                role="columnheader"
                key={column.id}
                aria-sort={
                  isSorted
                    ? primary.direction === "ASC"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                {onSort ? (
                  <button
                    type="button"
                    className={isSorted ? "search-sort active" : "search-sort"}
                    onClick={() => onSort(column.sortField)}
                    title={`Sort by ${column.label}`}
                  >
                    {column.id === "type" ? <span className="sr-only">Type</span> : column.label}
                    {isSorted &&
                      (primary.direction === "ASC" ? (
                        <ArrowUp size={11} aria-hidden="true" />
                      ) : (
                        <ArrowDown size={11} aria-hidden="true" />
                      ))}
                  </button>
                ) : (
                  column.label
                )}
              </span>
            );
          })}
        </div>

        {issues.map((issue) => {
          const isSelected = selectedIds?.has(issue.id) ?? false;
          const className = [
            "search-table-row",
            isSelected ? "selected" : "",
            activeIssueId === issue.id ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              className={className}
              role="row"
              key={issue.id}
              style={{ gridTemplateColumns: template }}
              onClick={(event) => {
                if (!onActivate) return;
                const target = event.target as HTMLElement;
                if (target.closest("a, button, input, select, label")) return;
                onActivate(issue.id);
              }}
            >
              {selectable && (
                <span role="cell" className="search-check-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${issue.id}`}
                    checked={isSelected}
                    onChange={() => onToggleSelected(issue.id)}
                  />
                </span>
              )}
              {visible.map((column) => (
                <span role="cell" key={column.id} className={`search-cell search-cell-${column.id}`}>
                  {column.render(issue, lookups)}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
