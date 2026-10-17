"use client";

import { RichTextEditor } from "../RichTextEditor";
import type { WorkspaceMember } from "../../data/issues";
import {
  FORM_PRIORITIES,
  type FormAnswers,
  type FormAnswerValue,
  type FormField,
} from "./formModel";

/** Renders a form's fields for filling in (fill page) or previewing (builder). */
export function FormRenderer({
  fields,
  answers,
  errors = {},
  onChange,
  members,
  disabled = false,
  idPrefix = "form",
}: {
  fields: FormField[];
  answers: FormAnswers;
  errors?: Record<string, string>;
  onChange: (fieldId: string, value: FormAnswerValue) => void;
  members: WorkspaceMember[];
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="gf-form-fields">
      {fields.map((field) => {
        const inputId = `${idPrefix}-${field.id}`;
        const helpId = field.help ? `${inputId}-help` : undefined;
        const errorId = errors[field.id] ? `${inputId}-error` : undefined;
        const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
        const value = answers[field.id];
        const text = typeof value === "string" ? value : "";
        const common = {
          id: inputId,
          disabled,
          "aria-invalid": Boolean(errors[field.id]),
          "aria-describedby": describedBy,
          "aria-required": field.required,
        };

        const label = (
          <span className="gf-fill-label">
            {field.label}
            {field.required && (
              <span className="gf-required" aria-hidden="true">
                *
              </span>
            )}
          </span>
        );

        let control: React.ReactNode;
        switch (field.kind) {
          case "SUMMARY":
          case "SHORT_TEXT":
            control = (
              <input
                {...common}
                value={text}
                maxLength={255}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            );
            break;
          case "PARAGRAPH":
            control = (
              <textarea
                {...common}
                rows={4}
                maxLength={5000}
                value={text}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            );
            break;
          case "DESCRIPTION":
            control = (
              <div className="gf-editor" id={inputId} aria-describedby={describedBy}>
                <RichTextEditor
                  value={text}
                  onChange={(html) => onChange(field.id, html)}
                  members={members}
                />
              </div>
            );
            break;
          case "NUMBER":
            control = (
              <input
                {...common}
                type="number"
                inputMode="decimal"
                value={text}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            );
            break;
          case "DATE":
            control = (
              <input
                {...common}
                type="date"
                value={text}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
            );
            break;
          case "DROPDOWN":
            control = (
              <select
                {...common}
                value={text}
                onChange={(event) => onChange(field.id, event.target.value || null)}
              >
                <option value="">Select...</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            );
            break;
          case "PRIORITY":
            control = (
              <select
                {...common}
                value={text}
                onChange={(event) => onChange(field.id, event.target.value || null)}
              >
                <option value="">Select...</option>
                {FORM_PRIORITIES.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </select>
            );
            break;
          case "CHECKBOX": {
            const selected = Array.isArray(value) ? value : [];
            control = (
              <div className="gf-checkbox-group" id={inputId} aria-describedby={describedBy}>
                {field.options.map((option) => (
                  <label key={option} className="gf-checkbox">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={selected.includes(option)}
                      onChange={(event) =>
                        onChange(
                          field.id,
                          event.target.checked
                            ? [...selected, option]
                            : selected.filter((entry) => entry !== option),
                        )
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            );
            break;
          }
        }

        const grouped = field.kind === "CHECKBOX" || field.kind === "DESCRIPTION";
        return (
          <div key={field.id} className="form-field gf-fill-field">
            {grouped ? (
              <span id={`${inputId}-label`}>{label}</span>
            ) : (
              <label htmlFor={inputId}>{label}</label>
            )}
            {field.help && (
              <small id={helpId} className="gf-help">
                {field.help}
              </small>
            )}
            {grouped ? (
              <div role="group" aria-labelledby={`${inputId}-label`}>
                {control}
              </div>
            ) : (
              control
            )}
            {errors[field.id] && (
              <small id={errorId} className="gf-field-error" role="alert">
                {errors[field.id]}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}
