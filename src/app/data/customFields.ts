/*
 * Jira-style custom fields: shared types plus pure value normalisation and
 * formatting, used by the API, the issue screens, JQL and CSV.
 *
 * Values are stored on Issue.customFields as a JSON object keyed by field id.
 * Option-based fields store option ids (so options can be renamed, reordered
 * or disabled without touching issues) and user pickers store member ids.
 * Empty values are never stored: the key is removed instead.
 */

import { stripHtml } from "./richText";

export const CUSTOM_FIELD_TYPES = [
  "TEXT",
  "PARAGRAPH",
  "NUMBER",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTI_SELECT",
  "CHECKBOXES",
  "RADIO",
  "URL",
  "USER",
  "LABELS",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  TEXT: "Short text",
  PARAGRAPH: "Paragraph",
  NUMBER: "Number",
  DATE: "Date",
  DATETIME: "Date time",
  SELECT: "Select list (single choice)",
  MULTI_SELECT: "Select list (multiple choices)",
  CHECKBOXES: "Checkboxes",
  RADIO: "Radio buttons",
  URL: "URL",
  USER: "User picker (single user)",
  LABELS: "Labels",
};

export const CUSTOM_FIELD_TYPE_HELP: Record<CustomFieldType, string> = {
  TEXT: "A single line of text, up to 255 characters.",
  PARAGRAPH: "Multiple lines of rich text.",
  NUMBER: "Whole or decimal numbers.",
  DATE: "A calendar date.",
  DATETIME: "A date and a time of day.",
  SELECT: "Choose one value from a dropdown list.",
  MULTI_SELECT: "Choose several values from a list.",
  CHECKBOXES: "Tick any number of options.",
  RADIO: "Choose exactly one option.",
  URL: "A link to a web page.",
  USER: "Pick one person from the workspace.",
  LABELS: "Free-form tags, like the Labels field.",
};

export const OPTION_FIELD_TYPES: CustomFieldType[] = [
  "SELECT",
  "MULTI_SELECT",
  "CHECKBOXES",
  "RADIO",
];

export const MULTI_VALUE_FIELD_TYPES: CustomFieldType[] = [
  "MULTI_SELECT",
  "CHECKBOXES",
  "LABELS",
];

export type CustomFieldOption = {
  id: string;
  value: string;
  disabled?: boolean;
};

export type CustomFieldDefinition = {
  id: string;
  name: string;
  type: CustomFieldType;
  description: string | null;
  options: CustomFieldOption[];
  required: boolean;
  /** Work type keys the field applies to; empty means every type. */
  issueTypes: string[];
  position: number;
  /** null = global (all projects); otherwise the single project it belongs to. */
  projectId: string | null;
  /** Issues holding a value (management endpoints only). */
  usageCount?: number;
};

/** A stored value: text/HTML/date/option id/member id, a number, or a list. */
export type CustomFieldValue = string | number | string[];
export type CustomFieldValues = Record<string, CustomFieldValue>;

export const MAX_OPTIONS = 100;
export const MAX_TEXT_LENGTH = 255;
export const MAX_PARAGRAPH_LENGTH = 20000;
export const MAX_URL_LENGTH = 2000;
export const MAX_LABELS = 20;
export const MAX_LABEL_LENGTH = 50;

export function isCustomFieldType(value: string): value is CustomFieldType {
  return (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

export function isOptionField(type: CustomFieldType) {
  return OPTION_FIELD_TYPES.includes(type);
}

export function isMultiValueField(type: CustomFieldType) {
  return MULTI_VALUE_FIELD_TYPES.includes(type);
}

/** Parses the stored JSON column; anything malformed becomes {}. */
export function parseCustomFieldValues(raw: string | null | undefined): CustomFieldValues {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const values: CustomFieldValues = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") values[key] = value;
      else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        values[key] = value as string[];
      }
    }
    return values;
  } catch {
    return {};
  }
}

export function isEmptyFieldValue(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Whether a field shows on issues of this project and work type. */
export function fieldAppliesTo(
  field: Pick<CustomFieldDefinition, "projectId" | "issueTypes">,
  projectId: string,
  kind: string,
) {
  if (field.projectId && field.projectId !== projectId) return false;
  return field.issueTypes.length === 0 || field.issueTypes.includes(kind);
}

/** Global fields first, then project fields, each by position. */
export function sortFields<T extends Pick<CustomFieldDefinition, "projectId" | "position" | "name">>(
  fields: T[],
) {
  return [...fields].sort(
    (left, right) =>
      Number(left.projectId !== null) - Number(right.projectId !== null) ||
      left.position - right.position ||
      left.name.localeCompare(right.name),
  );
}

export function applicableFields<T extends CustomFieldDefinition>(
  fields: T[],
  projectId: string,
  kind: string,
) {
  return sortFields(fields.filter((field) => fieldAppliesTo(field, projectId, kind)));
}

/** Fields a project can use at all (global + its own), ignoring work type. */
export function projectFields<T extends CustomFieldDefinition>(fields: T[], projectId: string) {
  return sortFields(
    fields.filter((field) => field.projectId === null || field.projectId === projectId),
  );
}

function optionMatch(field: CustomFieldDefinition, raw: string) {
  const wanted = raw.trim().toLowerCase();
  return (
    field.options.find((option) => option.id === raw) ??
    field.options.find((option) => option.value.trim().toLowerCase() === wanted)
  );
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type NormalizeResult =
  | { ok: true; value: CustomFieldValue | null }
  | { ok: false; error: string };

/**
 * Validates one incoming value against its field definition and returns the
 * value to store (null = clear). Options may be given by id or by name and are
 * stored by id; a disabled option is accepted only when it is already set
 * (`previous`). Member existence for user pickers is checked by the caller.
 */
export function normalizeFieldValue(
  field: CustomFieldDefinition,
  raw: unknown,
  previous?: CustomFieldValue,
): NormalizeResult {
  const fail = (error: string): NormalizeResult => ({ ok: false, error: `${field.name}: ${error}` });
  if (isEmptyFieldValue(raw)) return { ok: true, value: null };

  const allowOption = (optionId: string) => {
    const option = field.options.find((candidate) => candidate.id === optionId);
    if (!option) return false;
    if (!option.disabled) return true;
    return Array.isArray(previous) ? previous.includes(optionId) : previous === optionId;
  };

  switch (field.type) {
    case "TEXT": {
      if (typeof raw !== "string" && typeof raw !== "number") return fail("Enter text");
      const value = String(raw).trim();
      if (value.length > MAX_TEXT_LENGTH) return fail(`Use ${MAX_TEXT_LENGTH} characters or fewer`);
      return { ok: true, value };
    }
    case "PARAGRAPH": {
      if (typeof raw !== "string") return fail("Enter text");
      if (raw.length > MAX_PARAGRAPH_LENGTH) return fail("The text is too long");
      return { ok: true, value: stripHtml(raw).length === 0 && !/<img/i.test(raw) ? null : raw.trim() };
    }
    case "NUMBER": {
      const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
      if (!Number.isFinite(value)) return fail("Enter a number");
      if (Math.abs(value) > 1e15) return fail("The number is too large");
      return { ok: true, value };
    }
    case "DATE": {
      if (typeof raw !== "string") return fail("Enter a date");
      const value = raw.trim().slice(0, 10);
      if (!isValidDateKey(value)) return fail("Enter a valid date (yyyy-mm-dd)");
      return { ok: true, value };
    }
    case "DATETIME": {
      if (typeof raw !== "string") return fail("Enter a date and time");
      const parsed = new Date(raw.trim());
      if (Number.isNaN(parsed.getTime())) return fail("Enter a valid date and time");
      return { ok: true, value: parsed.toISOString() };
    }
    case "URL": {
      if (typeof raw !== "string") return fail("Enter a URL");
      const value = raw.trim();
      if (value.length > MAX_URL_LENGTH || !isValidHttpUrl(value)) {
        return fail("Enter a valid http(s) URL");
      }
      return { ok: true, value };
    }
    case "USER": {
      if (typeof raw !== "string") return fail("Choose a person");
      return { ok: true, value: raw.trim() };
    }
    case "SELECT":
    case "RADIO": {
      if (typeof raw !== "string") return fail("Choose an option");
      const option = optionMatch(field, raw);
      if (!option || !allowOption(option.id)) return fail(`'${raw}' is not a valid option`);
      return { ok: true, value: option.id };
    }
    case "MULTI_SELECT":
    case "CHECKBOXES": {
      const items = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : null;
      if (!items || !items.every((item) => typeof item === "string")) {
        return fail("Choose options from the list");
      }
      const ids: string[] = [];
      for (const item of items as string[]) {
        const option = optionMatch(field, item);
        if (!option || !allowOption(option.id)) return fail(`'${item}' is not a valid option`);
        if (!ids.includes(option.id)) ids.push(option.id);
      }
      // Keep the configured option order.
      const order = field.options.map((option) => option.id);
      ids.sort((left, right) => order.indexOf(left) - order.indexOf(right));
      return { ok: true, value: ids.length ? ids : null };
    }
    case "LABELS": {
      const items = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
          ? raw.split(/[\s,]+/)
          : null;
      if (!items || !items.every((item) => typeof item === "string")) return fail("Enter labels");
      const labels: string[] = [];
      for (const item of items as string[]) {
        const label = item.trim();
        if (!label) continue;
        if (/\s/.test(label)) return fail("Labels cannot contain spaces");
        if (label.length > MAX_LABEL_LENGTH) return fail(`Labels must be ${MAX_LABEL_LENGTH} characters or fewer`);
        if (!labels.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
          labels.push(label);
        }
      }
      if (labels.length > MAX_LABELS) return fail(`Use ${MAX_LABELS} labels or fewer`);
      return { ok: true, value: labels.length ? labels : null };
    }
  }
}

export function optionName(field: CustomFieldDefinition, optionId: string) {
  return field.options.find((option) => option.id === optionId)?.value ?? "Unknown option";
}

type NamedMember = { id: string; name: string };

export function formatDateKey(value: string) {
  if (!isValidDateKey(value.slice(0, 10))) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00.000Z`));
}

export function formatDateTime(value: string, timeZone?: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(parsed);
}

/** Human readable value ("" when empty). */
export function formatFieldValue(
  field: CustomFieldDefinition,
  value: CustomFieldValue | null | undefined,
  members: NamedMember[] = [],
  options: { timeZone?: string } = {},
): string {
  if (isEmptyFieldValue(value)) return "";
  switch (field.type) {
    case "PARAGRAPH":
      return stripHtml(String(value));
    case "NUMBER":
      return typeof value === "number" ? String(value) : String(value);
    case "DATE":
      return formatDateKey(String(value));
    case "DATETIME":
      return formatDateTime(String(value), options.timeZone ?? "UTC");
    case "SELECT":
    case "RADIO":
      return optionName(field, String(value));
    case "MULTI_SELECT":
    case "CHECKBOXES":
      return (Array.isArray(value) ? value : [String(value)])
        .map((id) => optionName(field, id))
        .join(", ");
    case "LABELS":
      return (Array.isArray(value) ? value : [String(value)]).join(", ");
    case "USER":
      return members.find((member) => member.id === value)?.name ?? "Former member";
    default:
      return String(value);
  }
}

/** Plain value for CSV export (option names, member names, ISO dates). */
export function exportFieldValue(
  field: CustomFieldDefinition,
  value: CustomFieldValue | null | undefined,
  members: NamedMember[] = [],
) {
  if (isEmptyFieldValue(value)) return "";
  if (field.type === "DATE" || field.type === "DATETIME" || field.type === "URL") {
    return String(value);
  }
  if (isMultiValueField(field.type)) {
    return formatFieldValue(field, value, members).split(", ").join("; ");
  }
  return formatFieldValue(field, value, members);
}

export function sameFieldValue(
  left: CustomFieldValue | null | undefined,
  right: CustomFieldValue | null | undefined,
) {
  if (isEmptyFieldValue(left) && isEmptyFieldValue(right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    );
  }
  return left === right;
}

/** A unique key for a new option id. */
export function newOptionId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `opt_${random}`;
}

/**
 * Applies an edited option list: entries with a known id keep it (rename,
 * reorder, disable); entries without one get a new id. Returns the ids that
 * were dropped so stored values can be cleaned up.
 */
export function mergeFieldOptions(
  existing: CustomFieldOption[],
  incoming: { id?: string; value: string; disabled?: boolean }[],
  makeId: () => string = newOptionId,
) {
  const known = new Set(existing.map((option) => option.id));
  const used = new Set<string>();
  const options: CustomFieldOption[] = incoming.map((option) => {
    const id = option.id && known.has(option.id) && !used.has(option.id) ? option.id : makeId();
    used.add(id);
    return option.disabled ? { id, value: option.value.trim(), disabled: true } : { id, value: option.value.trim() };
  });
  const removedIds = existing.map((option) => option.id).filter((id) => !used.has(id));
  return { options, removedIds };
}

/** Drops removed option ids from one stored value (null when nothing is left). */
export function withoutOptions(
  value: CustomFieldValue | undefined,
  removedIds: string[],
): CustomFieldValue | null | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const next = value.filter((id) => !removedIds.includes(id));
    return next.length ? next : null;
  }
  return typeof value === "string" && removedIds.includes(value) ? null : value;
}
