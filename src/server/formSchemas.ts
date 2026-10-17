import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import {
  FORM_FIELD_KINDS,
  FORM_PRIORITIES,
  FORM_FIELD_KIND_LABELS,
  isAnswerEmpty,
  OPTION_FIELD_KINDS,
  SINGLETON_FIELD_KINDS,
  type FormAnswers,
  type FormField,
} from "../app/components/forms/formModel";
import { sanitizeDescriptionHtml, stripHtml } from "./richText";

const optionSchema = z.string().trim().min(1, "Options can't be blank").max(120);

export const formFieldSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[A-Za-z0-9_-]+$/, "Field ids may only use letters, numbers, - and _"),
    kind: z.enum(FORM_FIELD_KINDS),
    label: z.string().trim().min(1, "Every field needs a label").max(120),
    help: z.string().trim().max(300).default(""),
    required: z.boolean().default(false),
    options: z.array(optionSchema).max(50).default([]),
  })
  .strict();

export const formFieldsSchema = z
  .array(formFieldSchema)
  .min(1)
  .max(40, "A form can have up to 40 fields")
  .superRefine((fields, context) => {
    if (fields[0]?.kind !== "SUMMARY") {
      context.addIssue({ code: "custom", message: "Summary must be the first field" });
    }
    const ids = new Set<string>();
    const kinds = new Set<string>();
    fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        context.addIssue({ code: "custom", message: `Duplicate field id ${field.id}`, path: [index, "id"] });
      }
      ids.add(field.id);
      if (SINGLETON_FIELD_KINDS.includes(field.kind)) {
        if (kinds.has(field.kind)) {
          context.addIssue({
            code: "custom",
            message: `A form can only have one ${FORM_FIELD_KIND_LABELS[field.kind]} field`,
            path: [index, "kind"],
          });
        }
        kinds.add(field.kind);
      }
      if (OPTION_FIELD_KINDS.includes(field.kind)) {
        if (field.options.length === 0) {
          context.addIssue({
            code: "custom",
            message: `“${field.label}” needs at least one option`,
            path: [index, "options"],
          });
        }
        if (new Set(field.options.map((option) => option.toLowerCase())).size !== field.options.length) {
          context.addIssue({
            code: "custom",
            message: `“${field.label}” has duplicate options`,
            path: [index, "options"],
          });
        }
      }
    });
  })
  .transform((fields) =>
    fields.map((field) => ({
      ...field,
      required: field.kind === "SUMMARY" ? true : field.required,
      options: OPTION_FIELD_KINDS.includes(field.kind) ? field.options : [],
    })),
  );

const nameSchema = z.string().trim().min(1, "Give the form a name").max(120);
const descriptionSchema = z.string().trim().max(2000);
const issueTypeSchema = z.string().trim().min(1).max(40);

export const createFormSchema = z
  .object({
    name: nameSchema.default("Untitled form"),
    description: descriptionSchema.default(""),
    issueType: issueTypeSchema.default("TASK"),
    fields: formFieldsSchema.optional(),
  })
  .strict();

export const updateFormSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    issueType: issueTypeSchema.optional(),
    fields: formFieldsSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

const answerValueSchema = z.union([
  z.string().max(20000),
  z.array(z.string().max(200)).max(50),
  z.null(),
]);

export const submitFormSchema = z
  .object({ answers: z.record(z.string().max(60), answerValueSchema) })
  .strict();

export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;

/** Parses the stored JSON column; tolerates legacy/corrupt data. */
export function parseStoredFields(raw: string): FormField[] {
  try {
    const parsed = formFieldsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SUBMISSION_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "span",
  "dl",
  "dt",
  "dd",
];

export type SubmissionResult =
  | { ok: true; title: string; description: string; priority: string | null }
  | { ok: false; errors: Record<string, string> };

const PRIORITY_VALUES = new Set<string>(FORM_PRIORITIES.map((priority) => priority.value));

/**
 * Validates answers against a form and maps them onto a work item:
 * Summary → title, Description → description body, Priority → priority, and
 * every other answer appended as an HTML definition list.
 */
export function buildSubmission(fields: FormField[], answers: FormAnswers): SubmissionResult {
  const errors: Record<string, string> = {};
  let title = "";
  let descriptionBody = "";
  let priority: string | null = null;
  const extra: Array<{ label: string; html: string }> = [];

  for (const field of fields) {
    const value = answers[field.id];
    if (isAnswerEmpty(value)) {
      if (field.required) errors[field.id] = "This field is required";
      continue;
    }

    switch (field.kind) {
      case "SUMMARY": {
        const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
        if (text.length < 4) errors[field.id] = "Use at least 4 characters";
        else if (text.length > 255) errors[field.id] = "Keep the summary under 255 characters";
        else title = text;
        break;
      }
      case "DESCRIPTION": {
        if (typeof value !== "string") {
          errors[field.id] = "Enter text";
          break;
        }
        descriptionBody = sanitizeDescriptionHtml(value);
        break;
      }
      case "PRIORITY": {
        if (typeof value !== "string" || !PRIORITY_VALUES.has(value)) {
          errors[field.id] = "Choose a priority";
          break;
        }
        priority = value;
        break;
      }
      case "SHORT_TEXT":
      case "PARAGRAPH": {
        if (typeof value !== "string") {
          errors[field.id] = "Enter text";
          break;
        }
        const limit = field.kind === "SHORT_TEXT" ? 255 : 5000;
        if (value.trim().length > limit) {
          errors[field.id] = `Keep this under ${limit} characters`;
          break;
        }
        extra.push({
          label: field.label,
          html: escapeHtml(value.trim()).replace(/\r?\n/g, "<br>"),
        });
        break;
      }
      case "NUMBER": {
        const number = typeof value === "string" ? Number(value.trim()) : Number.NaN;
        if (!Number.isFinite(number)) {
          errors[field.id] = "Enter a number";
          break;
        }
        extra.push({ label: field.label, html: escapeHtml(String(number)) });
        break;
      }
      case "DATE": {
        const valid =
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(new Date(`${value}T12:00:00.000Z`).getTime()) &&
          new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value;
        if (!valid) {
          errors[field.id] = "Enter a valid date";
          break;
        }
        extra.push({ label: field.label, html: escapeHtml(value as string) });
        break;
      }
      case "DROPDOWN": {
        if (typeof value !== "string" || !field.options.includes(value)) {
          errors[field.id] = "Choose one of the options";
          break;
        }
        extra.push({ label: field.label, html: escapeHtml(value) });
        break;
      }
      case "CHECKBOX": {
        const selected = Array.isArray(value) ? value : [value as string];
        if (selected.some((option) => !field.options.includes(option))) {
          errors[field.id] = "Choose from the listed options";
          break;
        }
        const ordered = field.options.filter((option) => selected.includes(option));
        extra.push({ label: field.label, html: escapeHtml(ordered.join(", ")) });
        break;
      }
    }
  }

  if (!fields.some((field) => field.kind === "SUMMARY")) {
    errors._form = "This form has no Summary field";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const list =
    extra.length > 0
      ? `<dl>${extra
          .map((entry) => `<dt><strong>${escapeHtml(entry.label)}</strong></dt><dd>${entry.html}</dd>`)
          .join("")}</dl>`
      : "";
  const description = sanitizeHtml(`${descriptionBody}${list}`, {
    allowedTags: SUBMISSION_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["data-type", "data-id", "data-label"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  }).trim();

  return {
    ok: true,
    title,
    description: stripHtml(description).length === 0 ? "" : description,
    priority,
  };
}
