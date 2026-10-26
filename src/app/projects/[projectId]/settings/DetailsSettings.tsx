"use client";

import { FormEvent, useState } from "react";
import { useProjects } from "../../../ProjectProvider";
import {
  PROJECT_BACKGROUNDS,
  PROJECT_COLORS,
  PROJECT_STATUS_LABELS,
  type BoardType,
  type Project,
  type ProjectBackground,
  type ProjectStatus,
} from "../../../data/projects";
import { toDateInput, type ProjectPerson } from "./adminUi";

export function DetailsSettings({
  project,
  people,
  readOnly,
}: {
  project: Project;
  people: ProjectPerson[];
  readOnly: boolean;
}) {
  const { updateProject } = useProjects();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color ?? PROJECT_COLORS[0]);
  const [leadUserId, setLeadUserId] = useState(project.leadUserId ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [targetDate, setTargetDate] = useState(toDateInput(project.targetDate));
  const [boardType, setBoardType] = useState<BoardType>(project.boardType);
  const [background, setBackground] = useState<ProjectBackground | null>(
    project.background ?? null,
  );
  const [url, setUrl] = useState(project.url ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setMessage({
        ok: false,
        text: "Use at least 2 characters for the name.",
      });
      return;
    }
    const trimmedUrl = url.trim();
    if (trimmedUrl && !/^https?:\/\/\S+\.\S+/i.test(trimmedUrl)) {
      setMessage({ ok: false, text: "Use a full http or https URL." });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    const saved = await updateProject(project.id, {
      name: name.trim(),
      description: description.trim() || null,
      color,
      leadUserId: leadUserId || null,
      status,
      targetDate: targetDate || null,
      boardType,
      background,
      url: trimmedUrl || null,
    });
    setIsSaving(false);
    setMessage(
      saved
        ? { ok: true, text: "Project details saved." }
        : { ok: false, text: "Project could not be saved." },
    );
  };

  return (
    <form
      className="pa-form pa-settings-form"
      onSubmit={handleSubmit}
      noValidate
    >
      <fieldset disabled={readOnly} className="pa-fieldset">
        <div className="pa-form-row">
          <label className="form-field">
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
          <label className="form-field">
            <span>Key</span>
            <input value={project.key} readOnly aria-readonly="true" />
            <span className="field-meta">Keys can&apos;t be changed.</span>
          </label>
        </div>
        <label className="form-field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={500}
          />
        </label>
        <label className="form-field">
          <span>URL</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            maxLength={2000}
            placeholder="https://docs.example.com/project"
          />
          <span className="field-meta">
            A page about the project, such as its docs or repository.
          </span>
        </label>
        <div className="pa-form-row">
          <label className="form-field">
            <span>Project lead</span>
            <select
              value={leadUserId}
              onChange={(event) => setLeadUserId(event.target.value)}
            >
              <option value="">No lead</option>
              {people.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ProjectStatus)
              }
            >
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="pa-form-row">
          <label className="form-field">
            <span>Target date</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Board type</span>
            <select
              value={boardType}
              onChange={(event) =>
                setBoardType(event.target.value as BoardType)
              }
            >
              <option value="SCRUM">Scrum — sprints and a backlog</option>
              <option value="KANBAN">Kanban — continuous flow</option>
            </select>
          </label>
        </div>
        <fieldset className="form-field label-field">
          <legend>Color</legend>
          <div className="label-options">
            {PROJECT_COLORS.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="project-color"
                  checked={color === option}
                  onChange={() => setColor(option)}
                />
                <span
                  className="project-color-dot"
                  style={{ background: option }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="form-field label-field">
          <legend>Background</legend>
          <div className="label-options project-background-options">
            <label title="None">
              <input
                type="radio"
                name="project-background"
                checked={background === null}
                onChange={() => setBackground(null)}
              />
              <span className="project-background-swatch" data-background="none">
                <span className="sr-only">None</span>
              </span>
            </label>
            {PROJECT_BACKGROUNDS.map((option) => (
              <label key={option.key} title={option.label}>
                <input
                  type="radio"
                  name="project-background"
                  checked={background === option.key}
                  onChange={() => setBackground(option.key)}
                />
                <span
                  className="project-background-swatch"
                  data-background={option.key}
                >
                  <span className="sr-only">{option.label}</span>
                </span>
              </label>
            ))}
          </div>
          <span className="field-meta">Shown behind every page of this project.</span>
        </fieldset>
      </fieldset>
      {message && (
        <p
          className={message.ok ? "pa-success" : "form-submit-error"}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      )}
      {!readOnly && (
        <div className="pa-dialog-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save details"}
          </button>
        </div>
      )}
    </form>
  );
}
