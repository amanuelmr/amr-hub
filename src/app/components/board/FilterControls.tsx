"use client";

import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { IssueKind, WorkspaceMember } from "../../data/issues";
import { useWorkflows } from "../../WorkflowProvider";
import { KindIcon } from "../IssueVisuals";
import { UNASSIGNED, epicColor, initials, type IssueFilters } from "./boardModel";

export function PlanningSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="planning-search">
      <Search size={14} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        placeholder="Search"
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}>
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

const STACK_LIMIT = 5;

/** Jira's assignee avatar stack: click an avatar to filter, overflow in "+N". */
export function AssigneeStack({
  members,
  includeUnassigned,
  selected,
  onToggle,
}: {
  members: WorkspaceMember[];
  includeUnassigned: boolean;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const entries = [
    ...members.map((member) => ({ id: member.id, name: member.name })),
    ...(includeUnassigned ? [{ id: UNASSIGNED, name: "Unassigned" }] : []),
  ];
  if (entries.length === 0) return null;
  const shown = entries.slice(0, STACK_LIMIT);
  const overflow = entries.slice(STACK_LIMIT);
  const overflowSelected = overflow.filter((entry) =>
    selected.includes(entry.id),
  ).length;

  return (
    <div className="planning-assignees" role="group" aria-label="Filter by assignee">
      {shown.map((entry) => {
        const active = selected.includes(entry.id);
        return (
          <button
            key={entry.id}
            type="button"
            className={
              active
                ? "avatar avatar-small planning-assignee active"
                : "avatar avatar-small planning-assignee"
            }
            aria-pressed={active}
            title={entry.name}
            onClick={() => onToggle(entry.id)}
          >
            {entry.id === UNASSIGNED ? "?" : initials(entry.name)}
            <span className="sr-only">{entry.name}</span>
          </button>
        );
      })}
      {overflow.length > 0 && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={
                overflowSelected > 0
                  ? "avatar avatar-small planning-assignee planning-assignee-more active"
                  : "avatar avatar-small planning-assignee planning-assignee-more"
              }
              aria-label={`${overflow.length} more assignees`}
            >
              +{overflow.length}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="planning-menu" align="start" sideOffset={4}>
              {overflow.map((entry) => (
                <FilterCheckItem
                  key={entry.id}
                  checked={selected.includes(entry.id)}
                  onToggle={() => onToggle(entry.id)}
                >
                  <span className="avatar avatar-small" aria-hidden="true">
                    {entry.id === UNASSIGNED ? "?" : initials(entry.name)}
                  </span>
                  {entry.name}
                </FilterCheckItem>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}

/** A toolbar dropdown button ("Epic ▾", "Type ▾") with a selected count. */
export function FilterMenu({
  label,
  count = 0,
  children,
  align = "start",
}: {
  label: ReactNode;
  count?: number;
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={count > 0 ? "planning-filter active" : "planning-filter"}
        >
          {label}
          {count > 0 && <span className="planning-filter-count">{count}</span>}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="planning-menu planning-filter-menu"
          align={align}
          sideOffset={4}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FilterCheckItem({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.CheckboxItem
      className="planning-menu-item planning-check-item"
      checked={checked}
      onCheckedChange={onToggle}
      onSelect={(event) => event.preventDefault()}
    >
      <span className="planning-check-box" aria-hidden="true">
        <DropdownMenu.ItemIndicator>
          <Check size={12} />
        </DropdownMenu.ItemIndicator>
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="planning-menu-label">{children}</DropdownMenu.Label>
  );
}

type FilterSetter = (update: (current: IssueFilters) => IssueFilters) => void;

export function EpicFilter({
  epics,
  filters,
  setFilters,
}: {
  epics: { id: string; title: string }[];
  filters: IssueFilters;
  setFilters: FilterSetter;
}) {
  return (
    <FilterMenu label="Epic" count={filters.epicId ? 1 : 0}>
      {epics.length === 0 && (
        <p className="planning-menu-empty">No epics in this project</p>
      )}
      {epics.map((epic) => (
        <FilterCheckItem
          key={epic.id}
          checked={filters.epicId === epic.id}
          onToggle={() =>
            setFilters((current) => ({
              ...current,
              epicId: current.epicId === epic.id ? null : epic.id,
            }))
          }
        >
          <span
            className="planning-epic-swatch"
            style={{ background: epicColor(epic.id) }}
            aria-hidden="true"
          />
          <span className="planning-menu-text">{epic.title}</span>
        </FilterCheckItem>
      ))}
    </FilterMenu>
  );
}

export function TypeFilter({
  kinds,
  filters,
  setFilters,
  projectId,
}: {
  kinds: IssueKind[];
  filters: IssueFilters;
  setFilters: FilterSetter;
  projectId?: string | null;
}) {
  const { typeMeta } = useWorkflows();
  return (
    <FilterMenu label="Type" count={filters.kinds.length}>
      {kinds.map((kind) => (
        <FilterCheckItem
          key={kind}
          checked={filters.kinds.includes(kind)}
          onToggle={() =>
            setFilters((current) => ({
              ...current,
              kinds: toggleValue(current.kinds, kind),
            }))
          }
        >
          <KindIcon kind={kind} projectId={projectId} />
          {typeMeta(projectId, kind).name}
        </FilterCheckItem>
      ))}
    </FilterMenu>
  );
}

export function hasActiveFilters(filters: IssueFilters) {
  return (
    filters.query.trim() !== "" ||
    filters.onlyMine ||
    filters.recent ||
    filters.flagged ||
    filters.assigneeIds.length > 0 ||
    filters.epicId !== null ||
    filters.labelId !== null ||
    filters.kinds.length > 0
  );
}

export function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
