"use client";

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Search } from "lucide-react";
import { KindIcon } from "../IssueVisuals";
import { matchesIssueQuery } from "./issueDetailLogic";
import type { IssueKind } from "../../data/issues";

export type PickerIssue = { id: string; title: string; kind: IssueKind };

export function IssuePickerList({
  candidates,
  onSelect,
  placeholder = "Search by key or title",
  emptyLabel = "No matching issues",
}: {
  candidates: PickerIssue[];
  onSelect: (issue: PickerIssue) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () =>
      candidates
        .filter((issue) => matchesIssueQuery(issue, query))
        .slice(0, 50),
    [candidates, query],
  );

  return (
    <div className="issue-picker">
      <label className="issue-picker-search">
        <Search size={14} aria-hidden="true" />
        <span className="sr-only">{placeholder}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      </label>
      <ul className="issue-picker-list" role="listbox">
        {matches.length === 0 && (
          <li className="issue-picker-empty">{emptyLabel}</li>
        )}
        {matches.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => onSelect(issue)}
            >
              <KindIcon kind={issue.kind} />
              <span className="issue-picker-key">{issue.id}</span>
              <span className="issue-picker-title">{issue.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IssuePickerPopover({
  trigger,
  candidates,
  onSelect,
  onClear,
  clearLabel,
  disabled,
}: {
  trigger: React.ReactNode;
  candidates: PickerIssue[];
  onSelect: (issue: PickerIssue) => void;
  onClear?: () => void;
  clearLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button className="issue-field-trigger" type="button">
          {trigger}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="issue-popover"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <IssuePickerList
            candidates={candidates}
            onSelect={(issue) => {
              setOpen(false);
              onSelect(issue);
            }}
          />
          {onClear && (
            <button
              className="text-button issue-popover-footer"
              type="button"
              onClick={() => {
                setOpen(false);
                onClear();
              }}
            >
              {clearLabel ?? "Clear"}
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
