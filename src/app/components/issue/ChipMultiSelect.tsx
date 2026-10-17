"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Pencil, Plus, Search } from "lucide-react";

export type ChipOption = { id: string; name: string };

/**
 * Jira multi-select field: shows only the selected values as chips, and edits
 * them in a searchable popover (labels, components).
 */
export function ChipMultiSelect<T extends ChipOption>({
  label,
  options,
  selectedIds,
  disabled,
  emptyText = "None",
  renderChip,
  onChange,
}: {
  label: string;
  options: T[];
  selectedIds: string[];
  disabled?: boolean;
  emptyText?: string;
  renderChip?: (option: T) => React.ReactNode;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const normalized = query.trim().toLowerCase();
  const visible = options.filter((option) =>
    option.name.toLowerCase().includes(normalized),
  );
  const chip = (option: T) =>
    renderChip ? (
      renderChip(option)
    ) : (
      <span className="issue-chip">{option.name}</span>
    );

  const chips = (
    <span className="issue-chip-list">
      {selected.length === 0 ? (
        <span className="issue-field-empty">{emptyText}</span>
      ) : (
        selected.map((option) => (
          <span key={option.id} className="issue-chip-item">
            {chip(option)}
          </span>
        ))
      )}
    </span>
  );

  if (disabled) return chips;

  return (
    <Popover.Root onOpenChange={(open) => !open && setQuery("")}>
      <Popover.Trigger asChild>
        <button
          className="issue-chip-trigger"
          type="button"
          aria-label={`Edit ${label.toLowerCase()}`}
        >
          {chips}
          {selected.length === 0 ? (
            <Plus className="issue-chip-edit" size={13} aria-hidden="true" />
          ) : (
            <Pencil className="issue-chip-edit" size={12} aria-hidden="true" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="issue-popover issue-chip-popover"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <label className="issue-picker-search">
            <Search size={13} aria-hidden="true" />
            <span className="sr-only">Search {label.toLowerCase()}</span>
            <input
              value={query}
              autoFocus
              placeholder={`Search ${label.toLowerCase()}`}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ul className="issue-chip-options" role="listbox" aria-multiselectable>
            {visible.length === 0 && (
              <li className="issue-picker-empty">
                {options.length === 0
                  ? `No ${label.toLowerCase()} yet`
                  : "No matches"}
              </li>
            )}
            {visible.map((option) => {
              const isSelected = selectedIds.includes(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() =>
                      onChange(
                        isSelected
                          ? selectedIds.filter((id) => id !== option.id)
                          : [...selectedIds, option.id],
                      )
                    }
                  >
                    <span className="issue-chip-check" aria-hidden="true">
                      {isSelected && <Check size={12} />}
                    </span>
                    {chip(option)}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
