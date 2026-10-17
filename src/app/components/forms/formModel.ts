/**
 * Jira Forms (intake forms): shared types and pure helpers for the builder,
 * the fill page and the API (src/server/forms.ts).
 */

export const FORM_FIELD_KINDS = [
  "SUMMARY",
  "DESCRIPTION",
  "SHORT_TEXT",
  "PARAGRAPH",
  "NUMBER",
  "DATE",
  "DROPDOWN",
  "CHECKBOX",
  "PRIORITY",
] as const;

export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

export const FORM_FIELD_KIND_LABELS: Record<FormFieldKind, string> = {
  SUMMARY: "Summary",
  DESCRIPTION: "Description",
  SHORT_TEXT: "Short text",
  PARAGRAPH: "Paragraph",
  NUMBER: "Number",
  DATE: "Date",
  DROPDOWN: "Dropdown",
  CHECKBOX: "Checkboxes",
  PRIORITY: "Priority",
};

/** Kinds that map onto a work item field, so a form may hold each once. */
export const SINGLETON_FIELD_KINDS: FormFieldKind[] = ["SUMMARY", "DESCRIPTION", "PRIORITY"];

export const OPTION_FIELD_KINDS: FormFieldKind[] = ["DROPDOWN", "CHECKBOX"];

export type FormField = {
  id: string;
  kind: FormFieldKind;
  label: string;
  help: string;
  required: boolean;
  options: string[];
};

export type IntakeForm = {
  id: string;
  name: string;
  description: string;
  issueType: string;
  issueTypeName: string;
  fields: FormField[];
  isActive: boolean;
  submissions: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type FormWorkType = { key: string; name: string };

export type FormBuilderResponse = {
  form: IntakeForm;
  workTypes: FormWorkType[];
};

export type FormFillResponse = {
  form: IntakeForm;
  project: { id: string; key: string; name: string };
};

export type FormAnswerValue = string | string[] | null;
export type FormAnswers = Record<string, FormAnswerValue>;

export type FormSubmitResponse = {
  issue: { id: string; title: string; projectId: string };
};

/** Same keys + labels as the work item priority field. */
export const FORM_PRIORITIES = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "NO_PRIORITY", label: "No priority" },
] as const;

let fieldCounter = 0;

export function newFieldId() {
  fieldCounter += 1;
  return `f_${Date.now().toString(36)}${fieldCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function createField(kind: FormFieldKind, id = newFieldId()): FormField {
  const defaults: Record<FormFieldKind, Pick<FormField, "label" | "required" | "options">> = {
    SUMMARY: { label: "Summary", required: true, options: [] },
    DESCRIPTION: { label: "Description", required: false, options: [] },
    SHORT_TEXT: { label: "Short answer", required: false, options: [] },
    PARAGRAPH: { label: "Long answer", required: false, options: [] },
    NUMBER: { label: "Number", required: false, options: [] },
    DATE: { label: "Date", required: false, options: [] },
    DROPDOWN: { label: "Choose one", required: false, options: ["Option 1", "Option 2"] },
    CHECKBOX: { label: "Choose any", required: false, options: ["Option 1", "Option 2"] },
    PRIORITY: { label: "Priority", required: false, options: [] },
  };
  return { id, kind, help: "", ...defaults[kind] };
}

export function defaultFormFields(): FormField[] {
  return [createField("SUMMARY", "summary"), createField("DESCRIPTION", "description")];
}

/**
 * Normalises a builder field list: Summary is always present, first and
 * required; singleton kinds appear once.
 */
export function normalizeFormFields(fields: FormField[]): FormField[] {
  const seen = new Set<FormFieldKind>();
  const rest: FormField[] = [];
  let summary: FormField | null = null;
  for (const field of fields) {
    if (SINGLETON_FIELD_KINDS.includes(field.kind)) {
      if (seen.has(field.kind)) continue;
      seen.add(field.kind);
    }
    if (field.kind === "SUMMARY") summary = { ...field, required: true };
    else rest.push(field);
  }
  return [summary ?? createField("SUMMARY", "summary"), ...rest];
}

/** Field kinds the builder may still add (singletons already present are hidden). */
export function addableFieldKinds(fields: FormField[]): FormFieldKind[] {
  const present = new Set(fields.map((field) => field.kind));
  return FORM_FIELD_KINDS.filter(
    (kind) => !(SINGLETON_FIELD_KINDS.includes(kind) && present.has(kind)),
  );
}

export function isAnswerEmpty(value: FormAnswerValue | undefined) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "" || value.replace(/<[^>]*>/g, "").trim() === "";
}

/** Trims labels/options and drops blank option lines before saving. */
export function cleanFieldsForSave(fields: FormField[]): FormField[] {
  return normalizeFormFields(fields).map((field) => ({
    ...field,
    label: field.label.trim(),
    help: field.help.trim(),
    options: OPTION_FIELD_KINDS.includes(field.kind)
      ? field.options.map((option) => option.trim()).filter(Boolean)
      : [],
  }));
}

/** Client-side check mirroring the server's formFieldsSchema messages. */
export function validateFormFields(fields: FormField[]): string | null {
  for (const field of fields) {
    if (!field.label) return "Every field needs a label.";
    if (OPTION_FIELD_KINDS.includes(field.kind)) {
      if (field.options.length === 0) return `“${field.label}” needs at least one option.`;
      const lowered = field.options.map((option) => option.toLowerCase());
      if (new Set(lowered).size !== lowered.length) return `“${field.label}” has duplicate options.`;
    }
  }
  return null;
}
