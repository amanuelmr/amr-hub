"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, ChevronRight, Columns3, MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";
import { parseJql } from "../../../data/jql";
import { useChartTheme } from "../../../components/reports/useChartTheme";
import {
  CHART_FIELDS,
  FORMAT_COLORS,
  type ChartBucket,
  type ChartField,
  type FormatRule,
  type ListPrefs,
} from "./listView";

type Update = (change: (current: ListPrefs) => ListPrefs) => void;

/** The list's "…" menu: chart, format rules, done and hierarchy toggles, export. */
export function ListMenu({
  prefs,
  onUpdate,
  onOpenRules,
  onExportVisible,
  onExportAll,
  onPrint,
  hasParents,
  allCollapsed,
  onToggleCollapsed,
}: {
  prefs: ListPrefs;
  onUpdate: Update;
  onOpenRules: () => void;
  onExportVisible: () => void;
  onExportAll: () => void;
  onPrint: () => void;
  hasParents: boolean;
  allCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const check = (on: boolean) => (
    <span className="search-menu-check" aria-hidden="true">
      {on ? <Check size={12} /> : null}
    </span>
  );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="icon-button list-more" aria-label="More list actions">
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="search-menu" align="end" sideOffset={6}>
          <DropdownMenu.CheckboxItem
            className="search-menu-item"
            checked={prefs.showChart}
            onCheckedChange={(showChart) => onUpdate((current) => ({ ...current, showChart }))}
          >
            {check(prefs.showChart)}
            View work items as a chart
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Item className="search-menu-item" onSelect={onOpenRules}>
            <span className="search-menu-check" aria-hidden="true" />
            Format rules
            {prefs.rules.length > 0 && <span className="list-menu-count">{prefs.rules.length}</span>}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="search-menu-separator" />
          <DropdownMenu.CheckboxItem
            className="search-menu-item"
            checked={prefs.hideDone}
            onCheckedChange={(hideDone) => onUpdate((current) => ({ ...current, hideDone }))}
          >
            {check(prefs.hideDone)}
            Hide done work items
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.CheckboxItem
            className="search-menu-item"
            checked={prefs.showHierarchy}
            onCheckedChange={(showHierarchy) => onUpdate((current) => ({ ...current, showHierarchy }))}
          >
            {check(prefs.showHierarchy)}
            Show hierarchy
          </DropdownMenu.CheckboxItem>
          {prefs.showHierarchy && hasParents && (
            <DropdownMenu.Item className="search-menu-item" onSelect={onToggleCollapsed}>
              <span className="search-menu-check" aria-hidden="true" />
              {allCollapsed ? "Expand parent work items" : "Collapse parent work items"}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="search-menu-separator" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="search-menu-item list-menu-sub">
              <span className="search-menu-check" aria-hidden="true" />
              Export
              <ChevronRight size={13} aria-hidden="true" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="search-menu" sideOffset={4}>
                <DropdownMenu.Item className="search-menu-item" onSelect={onExportVisible}>
                  CSV (visible fields)
                </DropdownMenu.Item>
                <DropdownMenu.Item className="search-menu-item" onSelect={onExportAll}>
                  CSV (all fields)
                </DropdownMenu.Item>
                <DropdownMenu.Item className="search-menu-item" onSelect={onPrint}>
                  Print list
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Configure columns: a searchable checklist of every field the list can show. */
export function ColumnPicker({
  columns,
  visible,
  onToggle,
  onReset,
}: {
  columns: { id: string; label: string }[];
  visible: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = columns.filter((column) => column.label.toLowerCase().includes(needle));
  return (
    <Popover.Root onOpenChange={(open) => !open && setQuery("")}>
      <Popover.Trigger asChild>
        <button type="button" className="icon-button" aria-label="Configure columns" title="Configure columns">
          <Columns3 size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="search-popover list-column-picker" align="end" sideOffset={6}>
          <p className="search-popover-title">
            Columns · {visible.length} of {columns.length} shown
          </p>
          <label className="list-column-search">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              placeholder="Search fields"
              aria-label="Search fields"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="search-column-list">
            {shown.map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={visible.includes(column.id)}
                  disabled={column.id === "summary"}
                  onChange={() => onToggle(column.id)}
                />
                {column.label}
              </label>
            ))}
            {shown.length === 0 && <p className="list-column-empty">No fields match.</p>}
          </div>
          <button className="text-button" type="button" onClick={onReset}>
            Restore defaults
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Conditional row formatting: rows matching a JQL query get a colour. */
export function FormatRulesDialog({
  rules,
  onSave,
  onClose,
}: {
  rules: FormatRule[];
  onSave: (rules: FormatRule[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FormatRule[]>(rules);
  const errors = draft.map((rule) => {
    if (!rule.jql.trim()) return "Enter a query";
    const parsed = parseJql(rule.jql);
    return parsed.ok ? null : parsed.error.message;
  });
  const change = (id: string, patch: Partial<FormatRule>) =>
    setDraft((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  const move = (index: number, offset: number) =>
    setDraft((current) => {
      const next = [...current];
      const [rule] = next.splice(index, 1);
      next.splice(index + offset, 0, rule);
      return next;
    });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="save-view-dialog planning-dialog list-rules-dialog">
          <header>
            <Dialog.Title asChild>
              <h2>Format rules</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description>
            Highlight rows that match a query. When several rules match, the first one wins.
          </Dialog.Description>
          <ol className="list-rules">
            {draft.map((rule, index) => (
              <li key={rule.id} className={`list-rule format-${rule.color}`}>
                <span className="list-rule-label">If</span>
                <input
                  value={rule.jql}
                  placeholder="priority = Highest"
                  aria-label={`Query for rule ${index + 1}`}
                  aria-invalid={errors[index] ? true : undefined}
                  onChange={(event) => change(rule.id, { jql: event.target.value })}
                />
                <span className="list-rule-label">then</span>
                <select
                  aria-label={`Colour for rule ${index + 1}`}
                  value={rule.color}
                  onChange={(event) => change(rule.id, { color: event.target.value as FormatRule["color"] })}
                >
                  {FORMAT_COLORS.map((color) => (
                    <option key={color.key} value={color.key}>
                      {color.label}
                    </option>
                  ))}
                </select>
                <span className="list-rule-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move rule ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move rule ${index + 1} down`}
                    disabled={index === draft.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete rule ${index + 1}`}
                    onClick={() => setDraft((current) => current.filter((item) => item.id !== rule.id))}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
                {errors[index] && rule.jql.trim() && (
                  <span className="field-error list-rule-error">{errors[index]}</span>
                )}
              </li>
            ))}
          </ol>
          {draft.length === 0 && <p className="list-rules-empty">No rules yet.</p>}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setDraft((current) => [...current, { id: crypto.randomUUID(), jql: "", color: "red" }])
            }
          >
            <Plus size={14} aria-hidden="true" /> Add rule
          </button>
          <footer className="filter-details-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={errors.some(Boolean)}
              onClick={() => {
                onSave(draft.map((rule) => ({ ...rule, jql: rule.jql.trim() })));
                onClose();
              }}
            >
              Save
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The visible work items counted by one field, as a bar chart. */
export function ListChart({
  buckets,
  chartBy,
  total,
  onChartBy,
  onClose,
}: {
  buckets: ChartBucket[];
  chartBy: ChartField;
  total: number;
  onChartBy: (field: ChartField) => void;
  onClose: () => void;
}) {
  const theme = useChartTheme();
  const label = CHART_FIELDS.find((field) => field.key === chartBy)?.label ?? "";
  return (
    <section className="list-chart" aria-label={`Work items by ${label.toLowerCase()}`}>
      <header className="list-chart-header">
        <h2>Work items by</h2>
        <select
          aria-label="Chart field"
          value={chartBy}
          onChange={(event) => onChartBy(event.target.value as ChartField)}
        >
          {CHART_FIELDS.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
        <span className="list-chart-total">{total} work items</span>
        <button type="button" className="icon-button" aria-label="Close chart" onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      {buckets.length === 0 ? (
        <p className="list-chart-empty">No work items to chart.</p>
      ) : (
        <div role="img" aria-label={buckets.map((bucket) => `${bucket.label} ${bucket.count}`).join(", ")}>
          <ResponsiveContainer width="100%" height={Math.min(40 + buckets.length * 28, 260)}>
            <BarChart data={buckets} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: theme.muted, fontSize: 10, fontFamily: theme.font }}
                axisLine={{ stroke: theme.grid }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tick={{ fill: theme.ink, fontSize: 11, fontFamily: theme.font }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: theme.grid, opacity: 0.3 }}
                contentStyle={{ background: theme.surface, border: `1px solid ${theme.grid}`, fontSize: 12 }}
              />
              <Bar dataKey="count" name="Work items" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                {buckets.map((bucket, index) => (
                  <Cell key={bucket.key} fill={theme.series[Math.min(index, theme.series.length - 1)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
