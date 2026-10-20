"use client";

import { useState } from "react";
import { CalendarDays, ExternalLink, Hash, Link2, UserRound } from "lucide-react";
import { ChipMultiSelect } from "../issue/ChipMultiSelect";
import { DescriptionView } from "../DescriptionView";
import { RichTextEditor } from "../RichTextEditor";
import {
  formatFieldValue,
  isEmptyFieldValue,
  type CustomFieldDefinition,
  type CustomFieldValue,
} from "../../data/customFields";
import type { WorkspaceMember } from "../../data/issues";

export type FieldInputValue = CustomFieldValue | null | undefined;

function asList(value: FieldInputValue): string[] {
  if (isEmptyFieldValue(value)) return [];
  return Array.isArray(value) ? value : [String(value)];
}

/** Options to offer: enabled ones plus any disabled option already chosen. */
function visibleOptions(field: CustomFieldDefinition, value: FieldInputValue) {
  const chosen = asList(value);
  return field.options.filter((option) => !option.disabled || chosen.includes(option.id));
}

function toLocalDateTime(value: FieldInputValue) {
  if (isEmptyFieldValue(value)) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Text-like input that commits on blur/Enter in inline mode, on every change in a form. */
function DraftInput({
  type,
  value,
  inline,
  disabled,
  label,
  placeholder,
  invalid,
  onChange,
}: {
  type: "text" | "number" | "url";
  value: string;
  inline: boolean;
  disabled?: boolean;
  label: string;
  placeholder?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const current = inline ? draft : value;
  return (
    <input
      type={type === "number" ? "text" : type}
      inputMode={type === "number" ? "decimal" : undefined}
      value={current}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      maxLength={type === "url" ? 2000 : 255}
      onChange={(event) => {
        if (inline) setDraft(event.target.value);
        else onChange(event.target.value);
      }}
      onBlur={() => {
        if (inline && draft.trim() !== value.trim()) onChange(draft);
      }}
      onKeyDown={(event) => {
        if (inline && event.key === "Enter") event.currentTarget.blur();
        if (inline && event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function LabelsInput({
  value,
  inline,
  disabled,
  label,
  onChange,
}: {
  value: string[];
  inline: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = draft
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setDraft("");
    if (next.length === 0) return;
    const merged = [...value];
    for (const item of next) {
      if (!merged.some((existing) => existing.toLowerCase() === item.toLowerCase())) merged.push(item);
    }
    onChange(merged);
  };
  return (
    <div className="cf-labels">
      {value.length > 0 && (
        <ul className="cf-label-list">
          {value.map((item) => (
            <li key={item} className="issue-chip">
              {item}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => onChange(value.filter((entry) => entry !== item))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <input
          value={draft}
          aria-label={`Add ${label}`}
          placeholder={value.length ? "Add another" : inline ? "Add labels" : "Type and press Enter"}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
        />
      )}
    </div>
  );
}

function ParagraphInline({
  field,
  value,
  members,
  disabled,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: string;
  members: WorkspaceMember[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <div className="cf-paragraph-editor">
        <RichTextEditor value={draft} onChange={setDraft} members={members} autoFocus />
        <div className="cf-paragraph-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setEditing(false);
              if (draft !== value) onChange(draft);
            }}
          >
            Save
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="cf-paragraph-view"
      disabled={disabled}
      aria-label={`Edit ${field.name}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value ? <DescriptionView value={value} /> : <span className="issue-field-empty">None</span>}
    </button>
  );
}

/**
 * Editor for one custom field value. `inline` (issue details): text fields
 * commit on blur, others on change, and empty shows "None". Form mode (create
 * dialog, bulk change): every change is reported immediately.
 */
export function CustomFieldInput({
  field,
  value,
  members,
  disabled,
  inline = false,
  invalid,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: FieldInputValue;
  members: WorkspaceMember[];
  disabled?: boolean;
  inline?: boolean;
  invalid?: boolean;
  onChange: (value: CustomFieldValue | null) => void;
}) {
  const text = isEmptyFieldValue(value) || Array.isArray(value) ? "" : String(value);
  const options = visibleOptions(field, value);
  const emptyLabel = inline ? "None" : "None";

  if (disabled && inline && field.type !== "PARAGRAPH") {
    const display = formatFieldValue(field, value, members, {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (field.type === "URL" && display) {
      return (
        <a className="cf-url" href={display} target="_blank" rel="noreferrer noopener">
          {display}
        </a>
      );
    }
    return display ? <span className="issue-field-text">{display}</span> : <span className="issue-field-empty">None</span>;
  }

  switch (field.type) {
    case "TEXT":
      return (
        <label className={inline ? "issue-inline-input" : "cf-input"}>
          <DraftInput
            key={text}
            type="text"
            value={text}
            inline={inline}
            disabled={disabled}
            label={field.name}
            placeholder={inline ? "None" : undefined}
            invalid={invalid}
            onChange={(next) => onChange(next.trim() ? next : null)}
          />
        </label>
      );
    case "NUMBER":
      return (
        <label className={inline ? "editable-property cf-inline" : "cf-input"}>
          {inline && <Hash size={14} aria-hidden="true" />}
          <DraftInput
            key={text}
            type="number"
            value={text}
            inline={inline}
            disabled={disabled}
            label={field.name}
            placeholder={inline ? "None" : undefined}
            invalid={invalid}
            onChange={(next) => {
              const trimmed = next.trim();
              if (!trimmed) onChange(null);
              else onChange(Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed);
            }}
          />
        </label>
      );
    case "URL":
      return (
        <span className="cf-url-field">
          <label className={inline ? "editable-property cf-inline" : "cf-input"}>
            {inline && <Link2 size={14} aria-hidden="true" />}
            <DraftInput
              key={text}
              type="url"
              value={text}
              inline={inline}
              disabled={disabled}
              label={field.name}
              placeholder={inline ? "None" : "https://"}
              invalid={invalid}
              onChange={(next) => onChange(next.trim() ? next.trim() : null)}
            />
          </label>
          {inline && text && (
            <a className="icon-button" href={text} target="_blank" rel="noreferrer noopener" aria-label={`Open ${field.name}`}>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
        </span>
      );
    case "DATE":
      return (
        <label className={inline ? "editable-date" : "cf-input"}>
          {inline && <CalendarDays size={14} aria-hidden="true" />}
          <input
            type="date"
            aria-label={field.name}
            value={text.slice(0, 10)}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange(event.target.value || null)}
          />
        </label>
      );
    case "DATETIME":
      return (
        <label className={inline ? "editable-date" : "cf-input"}>
          {inline && <CalendarDays size={14} aria-hidden="true" />}
          <input
            type="datetime-local"
            aria-label={field.name}
            value={toLocalDateTime(value)}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            onChange={(event) =>
              onChange(event.target.value ? new Date(event.target.value).toISOString() : null)
            }
          />
        </label>
      );
    case "SELECT":
      return (
        <label className={inline ? "editable-property" : "cf-input"}>
          <select
            aria-label={field.name}
            value={text}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">{emptyLabel}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.value}
                {option.disabled ? " (disabled)" : ""}
              </option>
            ))}
          </select>
        </label>
      );
    case "USER":
      return (
        <label className={inline ? "editable-property property-person" : "cf-input"}>
          {inline && <UserRound size={14} aria-hidden="true" />}
          <select
            aria-label={field.name}
            value={text}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">{inline ? "None" : "Unassigned"}</option>
            {text && !members.some((member) => member.id === text) && (
              <option value={text}>Former member</option>
            )}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      );
    case "RADIO":
      return (
        <fieldset className="cf-choice-group" aria-label={field.name} disabled={disabled}>
          {options.map((option) => (
            <label key={option.id} className="cf-choice">
              <input
                type="radio"
                name={`cf-${field.id}`}
                checked={text === option.id}
                onChange={() => onChange(option.id)}
              />
              <span>{option.value}</span>
            </label>
          ))}
          {!field.required && (
            <label className="cf-choice">
              <input
                type="radio"
                name={`cf-${field.id}`}
                checked={!text}
                onChange={() => onChange(null)}
              />
              <span>None</span>
            </label>
          )}
        </fieldset>
      );
    case "CHECKBOXES": {
      const chosen = asList(value);
      return (
        <fieldset className="cf-choice-group" aria-label={field.name} disabled={disabled}>
          {options.map((option) => (
            <label key={option.id} className="cf-choice">
              <input
                type="checkbox"
                checked={chosen.includes(option.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...chosen, option.id]
                    : chosen.filter((id) => id !== option.id);
                  onChange(next.length ? next : null);
                }}
              />
              <span>{option.value}</span>
            </label>
          ))}
        </fieldset>
      );
    }
    case "MULTI_SELECT":
      return (
        <ChipMultiSelect
          label={field.name}
          options={options.map((option) => ({ id: option.id, name: option.value }))}
          selectedIds={asList(value)}
          disabled={disabled}
          emptyText={inline ? "None" : "Select options"}
          onChange={(ids) => onChange(ids.length ? ids : null)}
        />
      );
    case "LABELS":
      return (
        <LabelsInput
          value={asList(value)}
          inline={inline}
          disabled={disabled}
          label={field.name}
          onChange={(next) => onChange(next.length ? next : null)}
        />
      );
    case "PARAGRAPH":
      return inline ? (
        <ParagraphInline
          field={field}
          value={text}
          members={members}
          disabled={disabled}
          onChange={(next) => onChange(next || null)}
        />
      ) : (
        <RichTextEditor value={text} onChange={(html) => onChange(html || null)} members={members} />
      );
  }
}
