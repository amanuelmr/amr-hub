/**
 * Pure CSV import logic shared by the import wizard (client) and the import
 * route (server): an RFC 4180 parser, header → field guessing, value mapping,
 * row validation and parent ordering. No database or Node-only imports here.
 */

import { isEpicLevel } from "../app/data/workflow";

export type CsvParseResult = {
  rows: string[][];
  delimiter: string;
  errors: string[];
};

const CANDIDATE_DELIMITERS = [",", ";", "\t"];

/** Picks the delimiter that appears most often outside quotes on the first line. */
export function detectDelimiter(text: string) {
  const counts = new Map<string, number>(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === "\n" || char === "\r")) break;
    else if (!inQuotes && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = ",";
  let bestCount = 0;
  for (const [delimiter, count] of counts) {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180 parser: quoted fields, doubled quotes, delimiters and line breaks
 * inside quotes, CRLF / LF / CR line endings, a UTF-8 BOM and a trailing
 * newline. Fully blank lines are skipped.
 */
export function parseCsv(input: string, options: { delimiter?: string } = {}): CsvParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let line = 1;
  let quoteStartLine = 1;

  const endField = () => {
    row.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    const quoted = fieldWasQuoted;
    endField();
    if (quoted || !(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n" || (char === "\r" && text[index + 1] !== "\n")) line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field === "" && !fieldWasQuoted) {
        inQuotes = true;
        fieldWasQuoted = true;
        quoteStartLine = line;
      } else {
        // Stray quote inside an unquoted field: keep it literally (lenient, like Excel).
        field += char;
      }
    } else if (char === delimiter) {
      endField();
    } else if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
      line += 1;
    } else if (char === "\n") {
      endRow();
      line += 1;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    errors.push(`Unclosed quoted field starting on line ${quoteStartLine}`);
  }
  if (field !== "" || row.length > 0 || fieldWasQuoted) endRow();

  return { rows, delimiter, errors };
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

export const IMPORT_FIELDS = [
  { key: "issueId", label: "Issue id", hint: "Used to link parents within this file" },
  { key: "summary", label: "Summary", required: true },
  { key: "description", label: "Description" },
  { key: "kind", label: "Issue type" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee", hint: "Email or display name" },
  { key: "labels", label: "Labels", hint: "Comma or semicolon separated" },
  { key: "storyPoints", label: "Story points" },
  { key: "dueDate", label: "Due date" },
  { key: "parentKey", label: "Parent", hint: "Issue key or Issue id from this file" },
  { key: "sprint", label: "Sprint", hint: "Sprint name in the target project" },
  { key: "fixVersion", label: "Fix version", hint: "Created if missing" },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Array<ImportFieldKey | "">;

export function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<ImportFieldKey, string[]> = {
  issueId: ["issueid", "issuekey", "key", "id", "externalid"],
  summary: ["summary", "title", "name", "issuesummary"],
  description: ["description", "details", "body"],
  kind: ["issuetype", "type", "kind", "worktype", "workitemtype"],
  status: ["status", "state"],
  priority: ["priority"],
  assignee: ["assignee", "assigneeemail", "assignedto", "owner"],
  labels: ["labels", "label", "tags", "tag"],
  storyPoints: [
    "storypoints",
    "storypointestimate",
    "storypoint",
    "points",
    "estimate",
    "customfieldstorypoints",
  ],
  dueDate: ["duedate", "due", "deadline"],
  parentKey: ["parent", "parentid", "parentkey", "parentissue", "epiclink", "parentsummary"],
  sprint: ["sprint", "sprintname", "iteration"],
  fixVersion: ["fixversion", "fixversions", "fixversionnames", "release", "version"],
};

export function guessField(header: string): ImportFieldKey | "" {
  const normalized = normalizeHeader(header);
  if (!normalized) return "";
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field as ImportFieldKey;
  }
  return "";
}

/** Guesses a mapping for each header; each single-value field is used once, labels may repeat. */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const used = new Set<ImportFieldKey>();
  return headers.map((header) => {
    const field = guessField(header);
    if (!field) return "";
    if (field !== "labels" && used.has(field)) return "";
    used.add(field);
    return field;
  });
}

/* ------------------------------------------------------------------ */
/* Value mapping (status / type / priority)                            */
/* ------------------------------------------------------------------ */

export type ImportOption = { key: string; name: string };
export type ValueField = "status" | "kind" | "priority";
export type ValueMappings = Record<ValueField, Record<string, string>>;

const VALUE_SYNONYMS: Record<ValueField, Record<string, string>> = {
  status: {
    todo: "OPEN",
    open: "OPEN",
    new: "OPEN",
    selectedfordevelopment: "OPEN",
    backlog: "BACKLOG",
    inprogress: "IN_PROGRESS",
    doing: "IN_PROGRESS",
    inreview: "IN_REVIEW",
    review: "IN_REVIEW",
    codereview: "IN_REVIEW",
    done: "DONE",
    closed: "DONE",
    resolved: "DONE",
    complete: "DONE",
    completed: "DONE",
  },
  kind: {
    subtask: "SUBTASK",
    subtasks: "SUBTASK",
    story: "STORY",
    userstory: "STORY",
    task: "TASK",
    bug: "BUG",
    defect: "BUG",
    epic: "EPIC",
  },
  priority: {
    highest: "URGENT",
    blocker: "URGENT",
    critical: "URGENT",
    urgent: "URGENT",
    high: "HIGH",
    major: "HIGH",
    medium: "MEDIUM",
    normal: "MEDIUM",
    low: "LOW",
    minor: "LOW",
    lowest: "LOW",
    trivial: "LOW",
    none: "NO_PRIORITY",
    nopriority: "NO_PRIORITY",
  },
};

/** Best-effort match of a raw CSV value to an option key; "" when unknown. */
export function guessValue(field: ValueField, raw: string, options: ImportOption[]) {
  const normalized = normalizeHeader(raw);
  if (!normalized) return "";
  const direct = options.find(
    (option) =>
      normalizeHeader(option.key) === normalized || normalizeHeader(option.name) === normalized,
  );
  if (direct) return direct.key;
  const synonym = VALUE_SYNONYMS[field][normalized];
  if (synonym && options.some((option) => option.key === synonym)) return synonym;
  return "";
}

export function distinctValues(rows: string[][], columnIndexes: number[]) {
  const values = new Set<string>();
  for (const row of rows) {
    for (const index of columnIndexes) {
      const value = (row[index] ?? "").trim();
      if (value) values.add(value);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type ImportRow = {
  rowNumber: number;
  issueId: string;
  summary: string;
  description: string;
  kind: string;
  status: string;
  priority: string;
  assignee: string;
  labels: string[];
  storyPoints: string;
  dueDate: string;
  parentKey: string;
  sprint: string;
  fixVersion: string;
};

export const MAX_IMPORT_ROWS = 2000;

/** Undo the formula-injection guard our exporter adds ('=SUM → =SUM). */
function unguard(value: string) {
  return /^'[=+@\t\r]/.test(value) ? value.slice(1) : value;
}

export function splitLabels(value: string) {
  return value
    .split(/[,;]/)
    .map((label) => label.trim())
    .filter(Boolean);
}

/**
 * Turns parsed CSV data rows into import rows using the column mapping and the
 * value mappings. Status/type/priority hold an option key, or "" for default.
 */
export function buildImportRows(
  dataRows: string[][],
  mapping: ColumnMapping,
  valueMappings: ValueMappings,
  firstRowNumber = 2,
): ImportRow[] {
  return dataRows.map((cells, rowIndex) => {
    const row: ImportRow = {
      rowNumber: firstRowNumber + rowIndex,
      issueId: "",
      summary: "",
      description: "",
      kind: "",
      status: "",
      priority: "",
      assignee: "",
      labels: [],
      storyPoints: "",
      dueDate: "",
      parentKey: "",
      sprint: "",
      fixVersion: "",
    };
    mapping.forEach((field, columnIndex) => {
      if (!field) return;
      const value = unguard((cells[columnIndex] ?? "").trim());
      if (!value) return;
      if (field === "labels") {
        for (const label of splitLabels(value)) {
          if (!row.labels.includes(label)) row.labels.push(label);
        }
        return;
      }
      if (row[field]) return;
      if (field === "status" || field === "kind" || field === "priority") {
        row[field] = valueMappings[field][value] ?? "";
        return;
      }
      row[field] = value;
    });
    return row;
  });
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Normalizes common date formats to YYYY-MM-DD: ISO (with or without time),
 * Jira exports (16/Oct/26 9:00 AM), and slash dates read as MM/DD/YYYY unless
 * the first part is > 12 (then DD/MM/YYYY).
 */
export function normalizeDate(value: string): string | null {
  const text = value.trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[/-]([A-Za-z]{3})[A-Za-z]*[/-](\d{2,4})(?:\s.*)?$/.exec(text);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) return null;
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return isoDate(year, month, Number(match[1]));
  }

  match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:\s.*)?$/.exec(text);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return first > 12 ? isoDate(year, second, first) : isoDate(year, first, second);
  }
  return null;
}

export const STORY_POINT_VALUES = [0, 1, 2, 3, 5, 8, 13, 21] as const;

/** Snaps a numeric estimate to the nearest supported story point value. */
export function snapStoryPoints(value: number) {
  let best: number = STORY_POINT_VALUES[0];
  for (const candidate of STORY_POINT_VALUES) {
    if (Math.abs(candidate - value) < Math.abs(best - value)) best = candidate;
  }
  return best;
}

export type ImportValidationContext = {
  statuses: ImportOption[];
  kinds: ImportOption[];
  priorities: ImportOption[];
  members: Array<{ id: string; name: string; email: string }>;
  sprints: Array<{ id: string; name: string }>;
  /** Issue keys that already exist in the workspace (server only; optional on the client). */
  existingKeys?: Set<string>;
  defaults: { status: string; kind: string; priority: string };
};

export type ValidatedRow = {
  rowNumber: number;
  summary: string;
  description: string;
  kind: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  labels: string[];
  estimate: number | null;
  dueDate: string | null;
  parentRef: string | null;
  cycleId: string | null;
  fixVersion: string | null;
  issueId: string | null;
  errors: string[];
  warnings: string[];
};

function findMember(context: ImportValidationContext, value: string) {
  const needle = value.trim().toLowerCase();
  return (
    context.members.find((member) => member.email.toLowerCase() === needle) ??
    context.members.find((member) => member.name.toLowerCase() === needle) ??
    null
  );
}

function optionOrDefault(
  value: string,
  options: ImportOption[],
  fallback: string,
  label: string,
  warnings: string[],
) {
  if (!value) return fallback;
  if (options.some((option) => option.key === value)) return value;
  warnings.push(`${label} "${value}" is not available; using the default`);
  return fallback;
}

export function validateImportRow(
  row: ImportRow,
  context: ImportValidationContext,
): ValidatedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const summary = row.summary.replace(/\s+/g, " ").trim();
  if (!summary) errors.push("Summary is required");
  else if (summary.length > 255) errors.push("Summary must be 255 characters or fewer");

  if (row.description.length > 20000) errors.push("Description must be 20,000 characters or fewer");

  const kind = optionOrDefault(row.kind, context.kinds, context.defaults.kind, "Issue type", warnings);
  const status = optionOrDefault(row.status, context.statuses, context.defaults.status, "Status", warnings);
  const priority = optionOrDefault(
    row.priority,
    context.priorities,
    context.defaults.priority,
    "Priority",
    warnings,
  );

  let assigneeId: string | null = null;
  if (row.assignee) {
    const member = findMember(context, row.assignee);
    if (member) assigneeId = member.id;
    else warnings.push(`Assignee "${row.assignee}" is not a workspace member; left unassigned`);
  }

  let labels = row.labels.map((label) => label.slice(0, 60));
  if (labels.length > 10) {
    warnings.push("Only the first 10 labels are kept");
    labels = labels.slice(0, 10);
  }

  let estimate: number | null = null;
  if (row.storyPoints) {
    const points = Number(row.storyPoints.replace(",", "."));
    if (!Number.isFinite(points) || points < 0) {
      errors.push(`Story points "${row.storyPoints}" is not a number`);
    } else {
      estimate = snapStoryPoints(points);
      if (estimate !== points) warnings.push(`Story points ${points} rounded to ${estimate}`);
    }
  }

  let dueDate: string | null = null;
  if (row.dueDate) {
    dueDate = normalizeDate(row.dueDate);
    if (!dueDate) errors.push(`Due date "${row.dueDate}" is not a recognised date`);
  }

  let cycleId: string | null = null;
  if (row.sprint) {
    const sprint = context.sprints.find(
      (candidate) => candidate.name.toLowerCase() === row.sprint.trim().toLowerCase(),
    );
    if (sprint) cycleId = sprint.id;
    else warnings.push(`Sprint "${row.sprint}" was not found in the project; left in the backlog`);
  }

  const parentRef = row.parentKey.trim() || null;
  if (parentRef && isEpicLevel(kind)) errors.push("Epics cannot have a parent issue");

  return {
    rowNumber: row.rowNumber,
    summary,
    description: row.description,
    kind,
    status,
    priority,
    assigneeId,
    labels,
    estimate,
    dueDate,
    parentRef,
    cycleId,
    fixVersion: row.fixVersion.trim().slice(0, 120) || null,
    issueId: row.issueId.trim() || null,
    errors,
    warnings,
  };
}

/**
 * Orders rows so in-file parents are created before their children. Rows whose
 * parent is unresolvable (not in the file, not an existing key) or that form a
 * cycle get an error.
 */
export function orderRowsForImport(rows: ValidatedRow[], existingKeys?: Set<string>) {
  const byIssueId = new Map<string, ValidatedRow>();
  const duplicateIds = new Set<string>();
  for (const row of rows) {
    if (!row.issueId) continue;
    if (byIssueId.has(row.issueId)) duplicateIds.add(row.issueId);
    else byIssueId.set(row.issueId, row);
  }
  for (const row of rows) {
    if (row.issueId && duplicateIds.has(row.issueId)) {
      row.errors.push(`Issue id "${row.issueId}" appears more than once`);
    }
  }

  const ordered: ValidatedRow[] = [];
  const state = new Map<ValidatedRow, "visiting" | "done">();

  const visit = (row: ValidatedRow, chain: ValidatedRow[]) => {
    if (state.get(row) === "done") return;
    if (state.get(row) === "visiting") {
      for (const member of chain.slice(chain.indexOf(row))) {
        if (!member.errors.includes("Parent links form a cycle")) {
          member.errors.push("Parent links form a cycle");
        }
      }
      return;
    }
    state.set(row, "visiting");
    if (row.parentRef) {
      const parent = byIssueId.get(row.parentRef);
      if (parent && parent !== row) visit(parent, [...chain, row]);
      else if (parent === row) row.errors.push("An issue cannot be its own parent");
      else if (existingKeys && !existingKeys.has(row.parentRef.toUpperCase())) {
        row.errors.push(`Parent "${row.parentRef}" was not found`);
      }
    }
    state.set(row, "done");
    ordered.push(row);
  };

  for (const row of rows) visit(row, []);
  return ordered;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text CSV description → paragraphs of escaped HTML for the rich-text field. */
export function plainTextToHtml(value: string) {
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
