"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ListFilter, Plus, Search, X } from "lucide-react";
import type { JqlError, JqlSuggestionSource } from "../../data/jql";
import { JqlEditor } from "../search/JqlEditor";
import {
  CONDITION_FIELDS,
  conditionsToJql,
  operatorNeedsValue,
  type Condition,
  type ConditionField,
  type ConditionOperator,
} from "./advancedFilter";
import type { IssueFilters } from "./boardModel";
import { panelFilterCount } from "./FilterControls";

type Mode = "basic" | "advanced" | "jql";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

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
  choices,
  jqlSource,
  jqlError,
}: {
  fields: FilterField[];
  filters: IssueFilters;
  setFilters: (change: (current: IssueFilters) => IssueFilters) => void;
  /** Values offered in the Advanced tab for choice fields. */
  choices: Partial<Record<ConditionField, string[]>>;
  jqlSource: JqlSuggestionSource;
  jqlError: JqlError | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(filters.jql ? "jql" : "basic");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [jqlDraft, setJqlDraft] = useState(filters.jql);
  const shown = fields.filter((field) => field.options.length > 0);

  // Shift+F opens and closes the panel, as on other boards.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || !event.shiftKey || event.metaKey || event.ctrlKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      setIsOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const applyJql = (jql: string) => setFilters((current) => ({ ...current, jql }));
  const updateCondition = (index: number, change: Partial<Condition>) =>
    setConditions((current) =>
      current.map((condition, position) => {
        if (position !== index) return condition;
        const next = { ...condition, ...change };
        if (change.field) {
          const meta = CONDITION_FIELDS.find((entry) => entry.field === change.field)!;
          next.operator = meta.operators[0];
          next.value = "";
        }
        return next;
      }),
    );
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
    <Popover.Root
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery("");
        else setJqlDraft(filters.jql);
      }}
    >
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
          <div className="board-filter-modes" role="tablist" aria-label="Filter mode">
            {(["basic", "advanced", "jql"] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                className={mode === value ? "active" : undefined}
                onClick={() => setMode(value)}
              >
                {value === "basic" ? "Basic" : value === "advanced" ? "Advanced" : "JQL"}
              </button>
            ))}
            <span className="board-filter-shortcut">
              <kbd>Shift</kbd> + <kbd>F</kbd>
            </span>
          </div>
          {mode === "advanced" && (
            <div className="board-filter-advanced">
              {conditions.length === 0 && (
                <p className="board-filter-empty">Build conditions that all must match.</p>
              )}
              {conditions.map((condition, index) => {
                const meta = CONDITION_FIELDS.find((entry) => entry.field === condition.field)!;
                const options = choices[condition.field] ?? [];
                return (
                  <div className="board-filter-condition" key={index}>
                    <select
                      aria-label="Field"
                      value={condition.field}
                      onChange={(event) =>
                        updateCondition(index, { field: event.target.value as ConditionField })
                      }
                    >
                      {CONDITION_FIELDS.map((entry) => (
                        <option key={entry.field} value={entry.field}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Operator"
                      value={condition.operator}
                      onChange={(event) =>
                        updateCondition(index, { operator: event.target.value as ConditionOperator })
                      }
                    >
                      {meta.operators.map((operator) => (
                        <option key={operator} value={operator}>
                          {operator}
                        </option>
                      ))}
                    </select>
                    {operatorNeedsValue(condition.operator) &&
                      (meta.input === "choice" ? (
                        <select
                          aria-label="Value"
                          value={condition.value}
                          onChange={(event) => updateCondition(index, { value: event.target.value })}
                        >
                          <option value="">Choose…</option>
                          {condition.field === "assignee" && (
                            <option value="currentUser()">Me (currentUser())</option>
                          )}
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label="Value"
                          value={condition.value}
                          inputMode={meta.input === "number" ? "decimal" : undefined}
                          placeholder={meta.input === "date" ? "2026-10-31 or -7d" : "Value"}
                          onChange={(event) => updateCondition(index, { value: event.target.value })}
                        />
                      ))}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove condition"
                      onClick={() =>
                        setConditions((current) => current.filter((_, position) => position !== index))
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
              <div className="board-filter-advanced-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setConditions((current) => [
                      ...current,
                      { field: "assignee", operator: "=", value: "" },
                    ])
                  }
                >
                  <Plus size={14} aria-hidden="true" /> Add filters
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!conditionsToJql(conditions)}
                  onClick={() => applyJql(conditionsToJql(conditions))}
                >
                  Apply
                </button>
              </div>
              {filters.jql && (
                <p className="board-filter-applied">
                  Applied: <code>{filters.jql}</code>
                  <button type="button" className="text-button" onClick={() => applyJql("")}>
                    Clear all
                  </button>
                </p>
              )}
            </div>
          )}
          {mode === "jql" && (
            <div className="board-filter-jql">
              <JqlEditor
                value={jqlDraft}
                onChange={setJqlDraft}
                onSearch={() => applyJql(jqlDraft.trim())}
                source={jqlSource}
                error={filters.jql && filters.jql === jqlDraft.trim() ? jqlError : null}
              />
              <p className="board-filter-empty">
                Press Enter to apply. The query narrows the board on top of its own filter.
              </p>
              {filters.jql && (
                <button type="button" className="text-button" onClick={() => {
                  setJqlDraft("");
                  applyJql("");
                }}>
                  Clear JQL
                </button>
              )}
            </div>
          )}
          {mode === "basic" && (
            <div className="board-filter-basic">
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
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
