"use client";

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ListFilter, Search } from "lucide-react";
import type { IssueFilters } from "./boardModel";
import { panelFilterCount } from "./FilterControls";

export type FilterOption = {
  value: string;
  label: string;
  /** Avatar, type icon, colour swatch… shown before the label. */
  visual?: ReactNode;
};

type ListKey =
  | "assigneeIds"
  | "kinds"
  | "epicIds"
  | "labelIds"
  | "priorities"
  | "statuses"
  | "componentIds"
  | "versionIds";

export type FilterField = {
  key: ListKey;
  label: string;
  options: FilterOption[];
};

/**
 * Jira's board "Filter" button: a panel with the fields on the left and a
 * searchable checklist on the right. Values OR within a field and AND across
 * fields.
 */
export function BoardFilterPanel({
  fields,
  filters,
  setFilters,
}: {
  fields: FilterField[];
  filters: IssueFilters;
  setFilters: (change: (current: IssueFilters) => IssueFilters) => void;
}) {
  const shown = fields.filter((field) => field.options.length > 0);
  const [activeKey, setActiveKey] = useState<ListKey>(shown[0]?.key ?? "assigneeIds");
  const [query, setQuery] = useState("");
  const count = panelFilterCount(filters);
  const active = shown.find((field) => field.key === activeKey) ?? shown[0];
  const needle = query.trim().toLowerCase();
  const options = active
    ? active.options.filter((option) => option.label.toLowerCase().includes(needle))
    : [];

  const toggle = (key: ListKey, value: string) =>
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));

  return (
    <Popover.Root onOpenChange={(open) => !open && setQuery("")}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={count > 0 ? "board-filter-button active" : "board-filter-button"}
        >
          <ListFilter size={15} aria-hidden="true" />
          Filter
          {count > 0 && <span className="board-filter-count">{count}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="board-filter-panel"
          align="start"
          sideOffset={6}
          aria-label="Filter work items"
        >
          <nav className="board-filter-fields" aria-label="Filter fields">
            {shown.map((field) => {
              const picked = filters[field.key].length;
              return (
                <button
                  key={field.key}
                  type="button"
                  className={field.key === active?.key ? "active" : undefined}
                  aria-current={field.key === active?.key ? "true" : undefined}
                  onClick={() => {
                    setActiveKey(field.key);
                    setQuery("");
                  }}
                >
                  <span>{field.label}</span>
                  {picked > 0 && <span className="board-filter-count">{picked}</span>}
                </button>
              );
            })}
          </nav>
          {active && (
            <div className="board-filter-values">
              <label className="board-filter-search">
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  placeholder={`Search ${active.label.toLowerCase()}`}
                  aria-label={`Search ${active.label.toLowerCase()}`}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="board-filter-options" role="group" aria-label={active.label}>
                {options.map((option) => {
                  const checked = filters[active.key].includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      className="board-filter-option"
                      onClick={() => toggle(active.key, option.value)}
                    >
                      <span className="planning-check-box" aria-hidden="true">
                        {checked && <Check size={12} />}
                      </span>
                      {option.visual}
                      <span className="board-filter-option-label">{option.label}</span>
                    </button>
                  );
                })}
                {options.length === 0 && (
                  <p className="board-filter-empty">No matches</p>
                )}
              </div>
              {filters[active.key].length > 0 && (
                <button
                  type="button"
                  className="text-button board-filter-reset"
                  onClick={() => setFilters((current) => ({ ...current, [active.key]: [] }))}
                >
                  Clear {active.label.toLowerCase()}
                </button>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
