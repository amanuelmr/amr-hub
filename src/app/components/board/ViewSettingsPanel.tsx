"use client";

import Link from "next/link";
import { Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
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
  showDoneDays,
  boardDoneDays,
  onUpdate,
  onToggleLanes,
  onToggleFullScreen,
  onReset,
  onClose,
}: {
  view: BoardView;
  /** Fields the board's card layout offers. */
  boardFields: CardField[];
  hasLanes: boolean;
  allLanesCollapsed: boolean;
  isFullScreen: boolean;
  settingsHref: string | null;
  /** Kanban boards hide old done work; Scrum boards keep the whole sprint. */
  showDoneDays: boolean;
  boardDoneDays: number | null;
  onUpdate: (change: (current: BoardView) => BoardView) => void;
  onToggleLanes: () => void;
  onToggleFullScreen: () => void;
  /** Clears filters, grouping and these view settings. */
  onReset: () => void;
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
        <h3>Board</h3>
        {showDoneDays && (
          <label className="view-settings-select">
            <span>Hide done work items after</span>
            <select
              value={
                view.doneDays === undefined
                  ? "board"
                  : view.doneDays === null
                    ? "never"
                    : String(view.doneDays)
              }
              onChange={(event) => {
                const value = event.target.value;
                onUpdate((current) => {
                  const next = { ...current };
                  if (value === "board") delete next.doneDays;
                  else next.doneDays = value === "never" ? null : Number(value);
                  return next;
                });
              }}
            >
              <option value="board">
                Board default ({boardDoneDays === null ? "never" : `${boardDoneDays} days`})
              </option>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="never">Never hide</option>
            </select>
          </label>
        )}
        <div className="view-settings-segment" role="radiogroup" aria-label="Column size">
          <span>Column size</span>
          {(["fixed", "flexible"] as const).map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={view.columnSize === size}
              className={view.columnSize === size ? "active" : undefined}
              onClick={() => onUpdate((current) => ({ ...current, columnSize: size }))}
            >
              {size === "fixed" ? "Fixed" : "Flexible"}
            </button>
          ))}
        </div>
        <div className="view-settings-segment" role="radiogroup" aria-label="Scrolling">
          <span>Scrolling</span>
          {(["columns", "board"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={view.scroll === mode}
              className={view.scroll === mode ? "active" : undefined}
              onClick={() => onUpdate((current) => ({ ...current, scroll: mode }))}
            >
              {mode === "columns" ? "Within columns" : "Whole board"}
            </button>
          ))}
        </div>
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
        <button type="button" className="secondary-button" onClick={onReset}>
          <RotateCcw size={14} aria-hidden="true" />
          Reset board view
        </button>
      </section>
    </aside>
  );
}
