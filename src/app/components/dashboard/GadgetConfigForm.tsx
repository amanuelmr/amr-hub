"use client";

import { useState, type FormEvent } from "react";
import { useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import {
  GROUP_FIELDS,
  GROUP_FIELD_LABELS,
  type GroupField,
} from "../../data/reports";
import { GADGET_META, type Gadget, type GadgetConfig } from "./gadgetMeta";

export function GadgetConfigForm({
  gadget,
  onSave,
  onCancel,
}: {
  gadget: Gadget;
  onSave: (config: GadgetConfig) => void;
  onCancel: () => void;
}) {
  const { savedViews } = useIssues();
  const { projects } = useProjects();
  const [config, setConfig] = useState<GadgetConfig>(gadget.config);
  const fields = GADGET_META[gadget.type].fields;
  const set = (patch: Partial<GadgetConfig>) =>
    setConfig((current) => ({ ...current, ...patch }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ ...config, title: config.title?.trim() || undefined });
  };

  const fieldSelect = (
    key: "groupBy" | "rowField" | "columnField",
    label: string,
    fallback: GroupField,
  ) => (
    <label className="gadget-field" key={key}>
      <span>{label}</span>
      <select
        value={config[key] ?? fallback}
        onChange={(event) => set({ [key]: event.target.value as GroupField })}
      >
        {GROUP_FIELDS.map((field) => (
          <option key={field} value={field}>
            {GROUP_FIELD_LABELS[field]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form className="gadget-config" onSubmit={handleSubmit}>
      {fields.includes("title") && (
        <label className="gadget-field">
          <span>Title</span>
          <input
            value={config.title ?? ""}
            maxLength={80}
            placeholder={GADGET_META[gadget.type].label}
            onChange={(event) => set({ title: event.target.value })}
          />
        </label>
      )}
      {fields.includes("projectId") && (
        <label className="gadget-field">
          <span>Project</span>
          <select
            value={config.projectId ?? ""}
            onChange={(event) => set({ projectId: event.target.value || null })}
          >
            <option value="">
              {gadget.type === "SPRINT_HEALTH" ? "First project" : "All projects"}
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.includes("savedViewId") && (
        <label className="gadget-field">
          <span>Saved view</span>
          <select
            value={config.savedViewId ?? ""}
            onChange={(event) => set({ savedViewId: event.target.value || null })}
          >
            <option value="">Choose a view</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields.includes("groupBy") && fieldSelect("groupBy", "Group by", "status")}
      {fields.includes("rowField") && fieldSelect("rowField", "Rows", "assignee")}
      {fields.includes("columnField") &&
        fieldSelect("columnField", "Columns", "status")}
      {fields.includes("days") && (
        <label className="gadget-field">
          <span>Period</span>
          <select
            value={config.days ?? 30}
            onChange={(event) =>
              set({ days: Number(event.target.value) as 7 | 30 | 90 })
            }
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      )}
      {fields.includes("limit") && (
        <label className="gadget-field">
          <span>Rows shown</span>
          <input
            type="number"
            min={1}
            max={50}
            value={config.limit ?? 8}
            onChange={(event) =>
              set({
                limit: Math.min(50, Math.max(1, Number(event.target.value) || 1)),
              })
            }
          />
        </label>
      )}
      <div className="gadget-config-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button">
          Apply
        </button>
      </div>
    </form>
  );
}
