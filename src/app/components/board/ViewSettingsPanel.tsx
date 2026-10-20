"use client";

import Link from "next/link";
import { Maximize2, Minimize2, X } from "lucide-react";
import { CARD_FIELD_LABELS, type CardField } from "../../data/projects";
import type { BoardView } from "./useBoardView";

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="view-settings-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <i aria-hidden="true" />
    </label>
  );
}

/**
 * Jira's View settings side panel: what cards show for this viewer, compact
 * cards, swimlane and column expansion, and full screen.
 */
export function ViewSettingsPanel({
  view,
  boardFields,
  hasLanes,
  allLanesCollapsed,
  isFullScreen,
  settingsHref,
  onUpdate,
  onToggleLanes,
  onToggleFullScreen,
  onClose,
}: {
  view: BoardView;
  /** Fields the board's card layout offers. */
  boardFields: CardField[];
  hasLanes: boolean;
  allLanesCollapsed: boolean;
  isFullScreen: boolean;
  settingsHref: string | null;
  onUpdate: (change: (current: BoardView) => BoardView) => void;
  onToggleLanes: () => void;
  onToggleFullScreen: () => void;
  onClose: () => void;
}) {
  const toggleField = (field: CardField) =>
    onUpdate((current) => ({
      ...current,
      hiddenFields: current.hiddenFields.includes(field)
        ? current.hiddenFields.filter((hidden) => hidden !== field)
        : [...current.hiddenFields, field],
    }));

  return (
    <aside className="planning-insights view-settings" aria-label="View settings">
      <header className="planning-insights-header">
        <h2>View settings</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close view settings"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      <section className="view-settings-section">
        <h3>Show on cards</h3>
        <Toggle
          label="Days in column"
          checked={view.daysInColumn}
          onChange={() =>
            onUpdate((current) => ({ ...current, daysInColumn: !current.daysInColumn }))
          }
        />
        {boardFields.map((field) => (
          <Toggle
            key={field}
            label={CARD_FIELD_LABELS[field]}
            checked={!view.hiddenFields.includes(field)}
            onChange={() => toggleField(field)}
          />
        ))}
        {settingsHref && (
          <Link className="view-settings-link" href={settingsHref}>
            Add or remove fields for everyone in board settings
          </Link>
        )}
      </section>

      <section className="view-settings-section">
        <h3>Layout</h3>
        <Toggle
          label="Compact cards"
          checked={view.compact}
          onChange={() => onUpdate((current) => ({ ...current, compact: !current.compact }))}
        />
        {hasLanes && (
          <button type="button" className="secondary-button" onClick={onToggleLanes}>
            {allLanesCollapsed ? "Expand all swimlanes" : "Collapse all swimlanes"}
          </button>
        )}
        {view.collapsedColumns.length > 0 && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onUpdate((current) => ({ ...current, collapsedColumns: [] }))}
          >
            Expand all columns
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onToggleFullScreen}>
          {isFullScreen ? (
            <Minimize2 size={14} aria-hidden="true" />
          ) : (
            <Maximize2 size={14} aria-hidden="true" />
          )}
          {isFullScreen ? "Exit full screen" : "Full screen"}
        </button>
      </section>
    </aside>
  );
}
