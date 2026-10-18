import { getCyclePhase } from "./cycles";
import {
  ISSUE_KINDS,
  ISSUE_STATUSES,
  KIND_LABELS,
  PRIORITY_LABELS,
  RESOLUTION_LABELS,
  STATUS_LABELS,
  type Cycle,
  type Issue,
  type IssuePriority,
  type WorkspaceMember,
} from "./issues";
import { stripHtml } from "./richText";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  isEmptyFieldValue,
  type CustomFieldDefinition,
  type CustomFieldValue,
} from "./customFields";
import {
  isBuiltinKind,
  isBuiltinStatus,
  isEpicLevel,
  orderStatuses,
  statusCategory,
  statusName,
  typeLevel,
  typeName,
  type ProjectWorkflow,
} from "./workflow";

/*
 * Jira Query Language subset: tokenizer, parser, evaluator, sorter and
 * autocomplete. Pure and isomorphic so the navigator and POST /api/search
 * evaluate identically. Dates are computed in UTC and weeks start on Monday.
 */

export type BuiltinJqlField =
  | "project"
  | "key"
  | "issuetype"
  | "status"
  | "statuscategory"
  | "priority"
  | "assignee"
  | "reporter"
  | "labels"
  | "sprint"
  | "fixversion"
  | "component"
  | "team"
  | "goal"
  | "parent"
  | "epic"
  | "text"
  | "summary"
  | "description"
  | "comment"
  | "environment"
  | "created"
  | "updated"
  | "resolved"
  | "due"
  | "startdate"
  | "flagged"
  | "archived"
  | "watcher"
  | "resolution"
  | "storypoints"
  | "rank";

/** A custom field reference: `cf[<field id>]` (or `cf[<name>]` when parsed leniently). */
export type CustomJqlField = `cf[${string}]`;
export type JqlField = BuiltinJqlField | CustomJqlField;

/** What JQL needs to know about a custom field. */
export type JqlCustomField = Pick<CustomFieldDefinition, "id" | "name" | "type" | "options">;

export type JqlOperator =
  | "="
  | "!="
  | "~"
  | "!~"
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "not in"
  | "is"
  | "is not"
  | "was"
  | "was not"
  | "was in"
  | "was not in";

export type JqlOperand =
  | { kind: "literal"; value: string; quoted: boolean; position: number }
  | { kind: "function"; name: string; args: string[]; position: number };

export type JqlValue =
  | { kind: "empty" }
  | { kind: "single"; operand: JqlOperand }
  | { kind: "list"; items: (JqlOperand | { kind: "empty" })[] };

export type JqlNode =
  | { type: "and"; children: JqlNode[] }
  | { type: "or"; children: JqlNode[] }
  | { type: "not"; child: JqlNode }
  | {
      type: "clause";
      field: JqlField;
      fieldText: string;
      operator: JqlOperator;
      value: JqlValue;
      position: number;
    };

export type JqlSortDirection = "ASC" | "DESC";
export type JqlOrderBy = { field: JqlField; direction: JqlSortDirection };

export type JqlQuery = { where: JqlNode | null; orderBy: JqlOrderBy[] };

export type JqlError = { message: string; position: number };

export type JqlParseResult =
  | { ok: true; query: JqlQuery }
  | { ok: false; error: JqlError };

export type JqlProject = { id: string; key: string; name: string };

export type JqlContext = {
  now: Date;
  currentUserId?: string | null;
  currentMemberId?: string | null;
  projectsByKey?: Record<string, JqlProject>;
  cycles?: Cycle[];
  members?: WorkspaceMember[];
  /** Lets `epic` resolve grandparent epics for subtasks. */
  issuesById?: Map<string, Issue>;
  /** Per-project workflows so custom statuses/types match by name. */
  workflows?: Record<string, ProjectWorkflow>;
  /** Custom field definitions; defaults to registerJqlCustomFields(). */
  customFields?: JqlCustomField[];
};

type FieldType =
  | "project"
  | "key"
  | "enum"
  | "user"
  | "multi"
  | "sprint"
  | "version"
  | "issue"
  | "text"
  | "date"
  | "flag"
  | "number"
  /** An unresolved custom field (lenient parsing): any operator, any function. */
  | "custom";

const EQ: JqlOperator[] = ["=", "!=", "in", "not in", "is", "is not"];
const ORD: JqlOperator[] = [...EQ, ">", ">=", "<", "<="];
const TEXT: JqlOperator[] = ["~", "!~", "is", "is not"];
const WAS: JqlOperator[] = ["was", "was not", "was in", "was not in"];

type FieldSpec = {
  name: string;
  type: FieldType;
  operators: JqlOperator[];
  sortable: boolean;
};

export const JQL_FIELD_SPECS: Record<BuiltinJqlField, FieldSpec> = {
  project: { name: "project", type: "project", operators: EQ, sortable: true },
  key: { name: "key", type: "key", operators: ORD, sortable: true },
  issuetype: { name: "issuetype", type: "enum", operators: EQ, sortable: true },
  status: { name: "status", type: "enum", operators: [...EQ, ...WAS], sortable: true },
  statuscategory: {
    name: "statusCategory",
    type: "enum",
    operators: EQ,
    sortable: true,
  },
  priority: {
    name: "priority",
    type: "enum",
    operators: [...ORD, ...WAS],
    sortable: true,
  },
  assignee: { name: "assignee", type: "user", operators: [...EQ, ...WAS], sortable: true },
  reporter: { name: "reporter", type: "user", operators: EQ, sortable: true },
  labels: { name: "labels", type: "multi", operators: EQ, sortable: true },
  sprint: { name: "sprint", type: "sprint", operators: EQ, sortable: true },
  fixversion: { name: "fixVersion", type: "version", operators: EQ, sortable: true },
  component: { name: "component", type: "multi", operators: EQ, sortable: true },
  team: { name: "team", type: "multi", operators: EQ, sortable: true },
  goal: { name: "goal", type: "multi", operators: EQ, sortable: true },
  parent: { name: "parent", type: "issue", operators: EQ, sortable: true },
  epic: { name: "epic", type: "issue", operators: EQ, sortable: true },
  text: { name: "text", type: "text", operators: ["~", "!~"], sortable: false },
  summary: { name: "summary", type: "text", operators: TEXT, sortable: true },
  description: { name: "description", type: "text", operators: TEXT, sortable: false },
  comment: { name: "comment", type: "text", operators: ["~", "!~"], sortable: false },
  environment: { name: "environment", type: "text", operators: TEXT, sortable: false },
  created: { name: "created", type: "date", operators: ORD, sortable: true },
  updated: { name: "updated", type: "date", operators: ORD, sortable: true },
  resolved: { name: "resolved", type: "date", operators: ORD, sortable: true },
  due: { name: "due", type: "date", operators: ORD, sortable: true },
  startdate: { name: "startDate", type: "date", operators: ORD, sortable: true },
  flagged: { name: "flagged", type: "flag", operators: EQ, sortable: true },
  archived: { name: "archived", type: "flag", operators: EQ, sortable: true },
  watcher: { name: "watcher", type: "user", operators: EQ, sortable: false },
  resolution: { name: "resolution", type: "enum", operators: EQ, sortable: true },
  storypoints: { name: "\"story points\"", type: "number", operators: ORD, sortable: true },
  rank: { name: "rank", type: "number", operators: ORD, sortable: true },
};

const FIELD_ALIASES: Record<string, BuiltinJqlField> = {
  project: "project",
  key: "key",
  issue: "key",
  issuekey: "key",
  id: "key",
  issuetype: "issuetype",
  type: "issuetype",
  status: "status",
  statuscategory: "statuscategory",
  priority: "priority",
  assignee: "assignee",
  reporter: "reporter",
  creator: "reporter",
  labels: "labels",
  label: "labels",
  sprint: "sprint",
  fixversion: "fixversion",
  fixversions: "fixversion",
  version: "fixversion",
  component: "component",
  components: "component",
  team: "team",
  goal: "goal",
  goals: "goal",
  parent: "parent",
  epic: "epic",
  epiclink: "epic",
  text: "text",
  summary: "summary",
  title: "summary",
  description: "description",
  comment: "comment",
  environment: "environment",
  created: "created",
  createddate: "created",
  updated: "updated",
  updateddate: "updated",
  resolved: "resolved",
  resolutiondate: "resolved",
  due: "due",
  duedate: "due",
  startdate: "startdate",
  flagged: "flagged",
  archived: "archived",
  watcher: "watcher",
  watchers: "watcher",
  resolution: "resolution",
  storypoints: "storypoints",
  storypoint: "storypoints",
  storypointestimate: "storypoints",
  estimate: "storypoints",
  rank: "rank",
};

export function resolveJqlField(text: string): BuiltinJqlField | null {
  return FIELD_ALIASES[text.toLowerCase().replace(/[\s_-]+/g, "")] ?? null;
}

/* ------------------------------------------------------------------ */
/* Custom fields                                                       */
/* ------------------------------------------------------------------ */

let registeredCustomFields: JqlCustomField[] = [];

/**
 * Client-side default for contexts that do not pass `customFields` (the
 * browser loads the workspace's fields once). Never call this on the server:
 * the server passes fields per organisation through the context instead.
 */
export function registerJqlCustomFields(fields: JqlCustomField[]) {
  registeredCustomFields = fields;
}

export function registeredJqlCustomFields() {
  return registeredCustomFields;
}

function customFieldsOf(ctx: Pick<JqlContext, "customFields">) {
  return ctx.customFields ?? registeredCustomFields;
}

export function isCustomJqlField(field: JqlField): field is CustomJqlField {
  return field.startsWith("cf[");
}

export function customFieldJqlKey(id: string): CustomJqlField {
  return `cf[${id}]`;
}

function customRef(field: CustomJqlField) {
  return field.slice(3, -1);
}

export function findJqlCustomField(field: CustomJqlField, fields: JqlCustomField[]) {
  const ref = customRef(field);
  const wanted = ref.trim().toLowerCase();
  return (
    fields.find((candidate) => candidate.id === ref) ??
    fields.find((candidate) => candidate.name.trim().toLowerCase() === wanted) ??
    null
  );
}

/**
 * Resolves field text: system fields first, then `cf[id]`, then a custom
 * field name. With "any", unknown names are accepted as custom references.
 */
export function resolveJqlFieldText(
  text: string,
  fields: JqlCustomField[] | "any" = registeredCustomFields,
): JqlField | null {
  const builtin = resolveJqlField(text);
  if (builtin) return builtin;
  const known = fields === "any" ? [] : fields;
  const bracket = /^cf\[([^\]]+)\]$/i.exec(text.trim());
  if (bracket) {
    const ref = bracket[1].trim();
    if (fields === "any" || known.some((field) => field.id === ref)) return `cf[${ref}]`;
    return null;
  }
  const wanted = text.trim().toLowerCase();
  const byName = known.find((field) => field.name.trim().toLowerCase() === wanted);
  if (byName) return customFieldJqlKey(byName.id);
  return fields === "any" && wanted ? `cf[${text.trim()}]` : null;
}

function customFieldSpec(field: JqlCustomField | null, fallbackName: string): FieldSpec {
  if (!field) {
    return {
      name: fallbackName,
      type: "custom",
      operators: [...ORD, "~", "!~"],
      sortable: true,
    };
  }
  const name = quoteJqlValue(field.name);
  switch (field.type) {
    case "TEXT":
    case "URL":
      return { name, type: "text", operators: TEXT, sortable: true };
    case "PARAGRAPH":
      return { name, type: "text", operators: TEXT, sortable: false };
    case "NUMBER":
      return { name, type: "number", operators: ORD, sortable: true };
    case "DATE":
    case "DATETIME":
      return { name, type: "date", operators: ORD, sortable: true };
    case "SELECT":
    case "RADIO":
      return { name, type: "enum", operators: EQ, sortable: true };
    case "USER":
      return { name, type: "user", operators: EQ, sortable: true };
    default:
      return { name, type: "multi", operators: EQ, sortable: true };
  }
}

/** The spec for any field, custom ones included. */
export function jqlFieldSpec(
  field: JqlField,
  fields: JqlCustomField[] = registeredCustomFields,
): FieldSpec {
  if (!isCustomJqlField(field)) return JQL_FIELD_SPECS[field];
  return customFieldSpec(findJqlCustomField(field, fields), field);
}

type FunctionCategory = "user" | "date" | "sprint" | "version";

const FUNCTIONS: Record<string, FunctionCategory> = {
  currentuser: "user",
  now: "date",
  startofday: "date",
  endofday: "date",
  startofweek: "date",
  endofweek: "date",
  startofmonth: "date",
  endofmonth: "date",
  startofyear: "date",
  endofyear: "date",
  opensprints: "sprint",
  closedsprints: "sprint",
  futuresprints: "sprint",
  releasedversions: "version",
  unreleasedversions: "version",
};

const FUNCTION_FIELD_TYPES: Record<FunctionCategory, FieldType[]> = {
  user: ["user"],
  date: ["date"],
  sprint: ["sprint"],
  version: ["version"],
};

const RESERVED = new Set([
  "and",
  "or",
  "not",
  "in",
  "is",
  "was",
  "empty",
  "null",
  "order",
  "by",
  "asc",
  "desc",
]);

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

type TokenType = "word" | "string" | "op" | "lparen" | "rparen" | "comma" | "eof";

export type JqlToken = {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  /** True for a string token whose closing quote is missing. */
  unterminated?: boolean;
};

class JqlSyntaxError extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(message);
  }
}

const WORD_BREAK = /[\s()=,!~<>"']/;

export function tokenizeJql(input: string, lenient = false): JqlToken[] {
  const tokens: JqlToken[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(" || char === ")" || char === ",") {
      tokens.push({
        type: char === "(" ? "lparen" : char === ")" ? "rparen" : "comma",
        value: char,
        start: index,
        end: index + 1,
      });
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const start = index;
      let value = "";
      index += 1;
      let closed = false;
      while (index < input.length) {
        const current = input[index];
        if (current === "\\" && index + 1 < input.length) {
          value += input[index + 1];
          index += 2;
          continue;
        }
        if (current === char) {
          closed = true;
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      if (!closed && !lenient) {
        throw new JqlSyntaxError("Unterminated string literal", start);
      }
      tokens.push({
        type: "string",
        value,
        start,
        end: index,
        ...(closed ? {} : { unterminated: true }),
      });
      continue;
    }

    const two = input.slice(index, index + 2);
    if (two === "!=" || two === "!~" || two === ">=" || two === "<=") {
      tokens.push({ type: "op", value: two, start: index, end: index + 2 });
      index += 2;
      continue;
    }

    if (char === "=" || char === "~" || char === ">" || char === "<") {
      tokens.push({ type: "op", value: char, start: index, end: index + 1 });
      index += 1;
      continue;
    }

    if (char === "!") {
      if (!lenient) {
        throw new JqlSyntaxError("Unexpected character '!'", index);
      }
      index += 1;
      continue;
    }

    const start = index;
    while (index < input.length && !WORD_BREAK.test(input[index])) {
      index += 1;
    }
    tokens.push({
      type: "word",
      value: input.slice(start, index),
      start,
      end: index,
    });
  }

  tokens.push({ type: "eof", value: "", start: input.length, end: input.length });
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Date helpers (UTC)                                                  */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const RELATIVE_PATTERN = /^([-+]?)((?:\d+\s*[yMwdhm]\s*)+)$/;

function addMonthsClamped(time: number, months: number) {
  const date = new Date(time);
  const day = date.getUTCDate();
  const target = new Date(time);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/** Applies a Jira relative offset like "-7d", "2w", "-1w 2d" to a timestamp. */
export function applyRelativeOffset(time: number, offset: string): number | null {
  const match = RELATIVE_PATTERN.exec(offset.trim());
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  let result = time;
  for (const part of match[2].matchAll(/(\d+)\s*([yMwdhm])/g)) {
    const amount = Number(part[1]) * sign;
    switch (part[2]) {
      case "y":
        result = addMonthsClamped(result, amount * 12);
        break;
      case "M":
        result = addMonthsClamped(result, amount);
        break;
      case "w":
        result += amount * 7 * DAY_MS;
        break;
      case "d":
        result += amount * DAY_MS;
        break;
      case "h":
        result += amount * 3_600_000;
        break;
      default:
        result += amount * 60_000;
    }
  }
  return result;
}

function startOfDayUtc(time: number) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfBoundary(unit: string, time: number) {
  const date = new Date(time);
  switch (unit) {
    case "week": {
      const offset = (date.getUTCDay() + 6) % 7;
      return startOfDayUtc(time) - offset * DAY_MS;
    }
    case "month":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    case "year":
      return Date.UTC(date.getUTCFullYear(), 0, 1);
    default:
      return startOfDayUtc(time);
  }
}

function endOfBoundary(unit: string, time: number) {
  const start = startOfBoundary(unit, time);
  const date = new Date(start);
  switch (unit) {
    case "week":
      return start + 7 * DAY_MS - 1;
    case "month":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1;
    case "year":
      return Date.UTC(date.getUTCFullYear() + 1, 0, 1) - 1;
    default:
      return start + DAY_MS - 1;
  }
}

type DateRange = { start: number; end: number; isRange: boolean };

const ABSOLUTE_DATE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/;

export function parseJqlDateLiteral(value: string, now: Date): DateRange | null {
  const trimmed = value.trim();
  const absolute = ABSOLUTE_DATE.exec(trimmed);
  if (absolute) {
    const [, year, month, day, hour, minute] = absolute;
    const start = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 0,
      minute ? Number(minute) : 0,
    );
    const check = new Date(start);
    if (
      check.getUTCMonth() !== Number(month) - 1 ||
      check.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return hour
      ? { start, end: start + 60_000, isRange: true }
      : { start, end: start + DAY_MS, isRange: true };
  }
  const relative = applyRelativeOffset(now.getTime(), trimmed);
  if (relative === null) return null;
  return { start: relative, end: relative, isRange: false };
}

function evaluateDateFunction(name: string, args: string[], now: Date): number | null {
  let base = now.getTime();
  if (args[0]) {
    const shifted = applyRelativeOffset(base, args[0]);
    if (shifted === null) return null;
    base = shifted;
  }
  if (name === "now") return base;
  const match = /^(start|end)of(day|week|month|year)$/.exec(name);
  if (!match) return null;
  return match[1] === "start"
    ? startOfBoundary(match[2], base)
    : endOfBoundary(match[2], base);
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

class Parser {
  private index = 0;

  constructor(
    private tokens: JqlToken[],
    private now: Date,
    private customFields: JqlCustomField[] | "any" = registeredCustomFields,
  ) {}

  private resolveField(text: string) {
    return resolveJqlFieldText(text, this.customFields);
  }

  private spec(field: JqlField) {
    return jqlFieldSpec(field, this.customFields === "any" ? [] : this.customFields);
  }

  private peek() {
    return this.tokens[this.index];
  }

  private next() {
    const token = this.tokens[this.index];
    if (token.type !== "eof") this.index += 1;
    return token;
  }

  private isKeyword(token: JqlToken, keyword: string) {
    return token.type === "word" && token.value.toLowerCase() === keyword;
  }

  private describe(token: JqlToken) {
    return token.type === "eof" ? "end of query" : `'${token.value}'`;
  }

  parseQuery(): JqlQuery {
    let where: JqlNode | null = null;
    if (this.peek().type !== "eof" && !this.isKeyword(this.peek(), "order")) {
      where = this.parseOr();
    }

    const orderBy: JqlOrderBy[] = [];
    if (this.isKeyword(this.peek(), "order")) {
      this.next();
      const by = this.next();
      if (!this.isKeyword(by, "by")) {
        throw new JqlSyntaxError(
          `Expected 'BY' after 'ORDER' but found ${this.describe(by)}`,
          by.start,
        );
      }
      do {
        const fieldToken = this.next();
        if (fieldToken.type !== "word" && fieldToken.type !== "string") {
          throw new JqlSyntaxError(
            `Expected a field to order by but found ${this.describe(fieldToken)}`,
            fieldToken.start,
          );
        }
        const field = this.resolveField(fieldToken.value);
        if (!field) {
          throw new JqlSyntaxError(
            `Field '${fieldToken.value}' does not exist`,
            fieldToken.start,
          );
        }
        if (!this.spec(field).sortable) {
          throw new JqlSyntaxError(
            `Field '${fieldToken.value}' cannot be used for ordering`,
            fieldToken.start,
          );
        }
        let direction: JqlSortDirection = "ASC";
        if (this.isKeyword(this.peek(), "asc")) {
          this.next();
        } else if (this.isKeyword(this.peek(), "desc")) {
          this.next();
          direction = "DESC";
        }
        orderBy.push({ field, direction });
      } while (this.peek().type === "comma" && this.next());
    }

    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw new JqlSyntaxError(
        `Expected AND, OR or ORDER BY but found ${this.describe(trailing)}`,
        trailing.start,
      );
    }

    return { where, orderBy };
  }

  private parseOr(): JqlNode {
    const children = [this.parseAnd()];
    while (this.isKeyword(this.peek(), "or")) {
      this.next();
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0] : { type: "or", children };
  }

  private parseAnd(): JqlNode {
    const children = [this.parseNot()];
    while (this.isKeyword(this.peek(), "and")) {
      this.next();
      children.push(this.parseNot());
    }
    return children.length === 1 ? children[0] : { type: "and", children };
  }

  private parseNot(): JqlNode {
    const token = this.peek();
    if (this.isKeyword(token, "not")) {
      this.next();
      return { type: "not", child: this.parseNot() };
    }
    if (token.type === "lparen") {
      this.next();
      const inner = this.parseOr();
      const closing = this.next();
      if (closing.type !== "rparen") {
        throw new JqlSyntaxError(
          `Expected ')' but found ${this.describe(closing)}`,
          closing.start,
        );
      }
      return inner;
    }
    return this.parseClause();
  }

  private parseOperator(): JqlOperator {
    const token = this.next();
    if (token.type === "op") return token.value as JqlOperator;
    const word = token.type === "word" ? token.value.toLowerCase() : "";

    if (word === "in") return "in";
    if (word === "not") {
      const following = this.next();
      if (this.isKeyword(following, "in")) return "not in";
      throw new JqlSyntaxError(
        `Expected 'IN' after 'NOT' but found ${this.describe(following)}`,
        following.start,
      );
    }
    if (word === "is") {
      if (this.isKeyword(this.peek(), "not")) {
        this.next();
        return "is not";
      }
      return "is";
    }
    if (word === "was") {
      const negated = this.isKeyword(this.peek(), "not");
      if (negated) this.next();
      if (this.isKeyword(this.peek(), "in")) {
        this.next();
        return negated ? "was not in" : "was in";
      }
      return negated ? "was not" : "was";
    }

    throw new JqlSyntaxError(
      `Expected an operator but found ${this.describe(token)}`,
      token.start,
    );
  }

  private parseClause(): JqlNode {
    const fieldToken = this.next();
    if (
      (fieldToken.type !== "word" && fieldToken.type !== "string") ||
      (fieldToken.type === "word" && RESERVED.has(fieldToken.value.toLowerCase()))
    ) {
      throw new JqlSyntaxError(
        `Expected a field name but found ${this.describe(fieldToken)}`,
        fieldToken.start,
      );
    }

    const field = this.resolveField(fieldToken.value);
    if (!field) {
      throw new JqlSyntaxError(
        `Field '${fieldToken.value}' does not exist`,
        fieldToken.start,
      );
    }

    const operatorToken = this.peek();
    const operator = this.parseOperator();
    const spec = this.spec(field);
    if (!spec.operators.includes(operator)) {
      throw new JqlSyntaxError(
        `The operator '${operator.toUpperCase()}' is not supported by the '${fieldToken.value}' field`,
        operatorToken.start,
      );
    }

    let value: JqlValue;
    if (operator === "is" || operator === "is not") {
      const token = this.next();
      if (!this.isKeyword(token, "empty") && !this.isKeyword(token, "null")) {
        throw new JqlSyntaxError(
          `Expected EMPTY after '${operator.toUpperCase()}' but found ${this.describe(token)}`,
          token.start,
        );
      }
      value = { kind: "empty" };
    } else if (operator.endsWith("in")) {
      if (this.peek().type === "lparen") {
        this.next();
        const items: (JqlOperand | { kind: "empty" })[] = [];
        if (this.peek().type !== "rparen") {
          do {
            if (this.isKeyword(this.peek(), "empty") || this.isKeyword(this.peek(), "null")) {
              this.next();
              items.push({ kind: "empty" });
            } else {
              items.push(this.parseOperand(field));
            }
          } while (this.peek().type === "comma" && this.next());
        }
        const closing = this.next();
        if (closing.type !== "rparen") {
          throw new JqlSyntaxError(
            `Expected ',' or ')' but found ${this.describe(closing)}`,
            closing.start,
          );
        }
        if (items.length === 0) {
          throw new JqlSyntaxError("The value list cannot be empty", closing.start);
        }
        value = { kind: "list", items };
      } else {
        const operand = this.parseOperand(field);
        if (operand.kind !== "function") {
          throw new JqlSyntaxError(
            `Expected '(' after '${operator.toUpperCase()}'`,
            operand.position,
          );
        }
        value = { kind: "list", items: [operand] };
      }
    } else if (
      (operator === "=" || operator === "!=") &&
      (this.isKeyword(this.peek(), "empty") || this.isKeyword(this.peek(), "null"))
    ) {
      this.next();
      value = { kind: "empty" };
    } else {
      value = { kind: "single", operand: this.parseOperand(field) };
    }

    return {
      type: "clause",
      field,
      fieldText: fieldToken.value,
      operator,
      value,
      position: fieldToken.start,
    };
  }

  private parseOperand(field: JqlField): JqlOperand {
    const token = this.next();
    const spec = this.spec(field);

    if (token.type === "string") {
      this.validateLiteral(field, token.value, token.start);
      return { kind: "literal", value: token.value, quoted: true, position: token.start };
    }

    if (token.type !== "word" || RESERVED.has(token.value.toLowerCase())) {
      throw new JqlSyntaxError(
        `Expected a value but found ${this.describe(token)}`,
        token.start,
      );
    }

    if (this.peek().type === "lparen") {
      const name = token.value.toLowerCase();
      const category = FUNCTIONS[name];
      if (!category) {
        throw new JqlSyntaxError(`Unknown function '${token.value}()'`, token.start);
      }
      if (spec.type !== "custom" && !FUNCTION_FIELD_TYPES[category].includes(spec.type)) {
        throw new JqlSyntaxError(
          `Function '${token.value}()' is not supported for the '${spec.name}' field`,
          token.start,
        );
      }
      this.next();
      const args: string[] = [];
      if (this.peek().type !== "rparen") {
        do {
          const arg = this.next();
          if (arg.type !== "word" && arg.type !== "string") {
            throw new JqlSyntaxError(
              `Expected a function argument but found ${this.describe(arg)}`,
              arg.start,
            );
          }
          if (category === "date" && applyRelativeOffset(0, arg.value) === null) {
            throw new JqlSyntaxError(
              `Invalid date offset '${arg.value}' (try -1d, 2w or -1M)`,
              arg.start,
            );
          }
          args.push(arg.value);
        } while (this.peek().type === "comma" && this.next());
      }
      const closing = this.next();
      if (closing.type !== "rparen") {
        throw new JqlSyntaxError(
          `Expected ')' to close ${token.value}( but found ${this.describe(closing)}`,
          closing.start,
        );
      }
      return { kind: "function", name, args, position: token.start };
    }

    this.validateLiteral(field, token.value, token.start);
    return { kind: "literal", value: token.value, quoted: false, position: token.start };
  }

  private validateLiteral(field: JqlField, value: string, position: number) {
    const type = this.spec(field).type;
    if (type === "date" && !parseJqlDateLiteral(value, this.now)) {
      throw new JqlSyntaxError(
        `'${value}' is not a valid date (use yyyy-mm-dd, "yyyy-mm-dd hh:mm" or -7d)`,
        position,
      );
    }
    if (type === "number" && !Number.isFinite(Number(value))) {
      throw new JqlSyntaxError(`'${value}' is not a number`, position);
    }
  }
}

export function parseJql(
  input: string,
  now = new Date(),
  options: {
    /** Known custom fields, or "any" to accept unknown names as custom fields. */
    customFields?: JqlCustomField[] | "any";
  } = {},
): JqlParseResult {
  try {
    const tokens = tokenizeJql(input);
    return {
      ok: true,
      query: new Parser(tokens, now, options.customFields ?? registeredCustomFields).parseQuery(),
    };
  } catch (error) {
    if (error instanceof JqlSyntaxError) {
      return { ok: false, error: { message: error.message, position: error.position } };
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

const PRIORITY_ORDER: IssuePriority[] = [
  "NO_PRIORITY",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];
const CATEGORY_ORDER = ["TODO", "IN_PROGRESS", "DONE"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

function norm(value: string) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function workflowOf(issue: Pick<Issue, "projectId">, ctx: JqlContext) {
  return ctx.workflows?.[issue.projectId];
}

/** Every status key -> name across built-ins and configured workflows. */
function allStatusLabels(ctx: JqlContext): Record<string, string> {
  const labels: Record<string, string> = { ...STATUS_LABELS };
  for (const workflow of Object.values(ctx.workflows ?? {})) {
    for (const status of workflow.statuses) labels[status.key] = status.name;
  }
  return labels;
}

function enumMatches(actual: string, labels: Record<string, string>, operand: string) {
  const wanted = norm(operand);
  return norm(actual) === wanted || norm(labels[actual] ?? "") === wanted;
}

function enumIndex(order: readonly string[], labels: Record<string, string>, operand: string) {
  const wanted = norm(operand);
  return order.findIndex(
    (value) => norm(value) === wanted || norm(labels[value] ?? "") === wanted,
  );
}

type UserLike = { id: string; name: string; email: string } | null;

function userMatches(user: UserLike, value: string) {
  if (!user) return false;
  const wanted = value.toLowerCase();
  return (
    user.id === value ||
    user.email.toLowerCase() === wanted ||
    user.name.toLowerCase() === wanted
  );
}

function sprintIdsFor(name: string, ctx: JqlContext) {
  const state =
    name === "opensprints" ? "ACTIVE" : name === "closedsprints" ? "CLOSED" : "FUTURE";
  const phase =
    name === "opensprints" ? "current" : name === "closedsprints" ? "past" : "upcoming";
  return new Set(
    (ctx.cycles ?? [])
      .filter((cycle) =>
        cycle.state ? cycle.state === state : getCyclePhase(cycle, ctx.now) === phase,
      )
      .map((cycle) => cycle.id),
  );
}

function findProject(value: string, ctx: JqlContext) {
  const projects = Object.values(ctx.projectsByKey ?? {});
  const wanted = value.toLowerCase();
  return projects.filter(
    (project) =>
      project.id === value ||
      project.key.toLowerCase() === wanted ||
      project.name.toLowerCase() === wanted,
  );
}

function projectForIssue(issue: Issue, ctx: JqlContext) {
  return Object.values(ctx.projectsByKey ?? {}).find(
    (project) => project.id === issue.projectId,
  );
}

function epicIdOf(issue: Issue, ctx: JqlContext): string | null {
  if (!issue.parent) return null;
  if (isEpicLevel(issue.parent.kind)) return issue.parent.id;
  const parent = ctx.issuesById?.get(issue.parent.id);
  if (parent?.parent && isEpicLevel(parent.parent.kind)) return parent.parent.id;
  return null;
}

function splitKey(key: string) {
  const match = /^(.*?)-(\d+)$/.exec(key);
  return match
    ? { prefix: match[1].toUpperCase(), number: Number(match[2]) }
    : { prefix: key.toUpperCase(), number: Number.NaN };
}

export function compareIssueKeys(left: string, right: string) {
  const a = splitKey(left);
  const b = splitKey(right);
  if (a.prefix !== b.prefix) return a.prefix < b.prefix ? -1 : 1;
  if (Number.isNaN(a.number) || Number.isNaN(b.number)) return 0;
  return a.number - b.number;
}

function issueDate(field: JqlField, issue: Issue): string | null {
  switch (field) {
    case "created":
      return issue.createdAt;
    case "updated":
      return issue.updatedAt;
    case "resolved":
      return issue.resolvedAt;
    case "due":
      return issue.dueDate;
    case "startdate":
      return issue.startDate;
    default:
      return null;
  }
}

function textHaystack(field: JqlField, issue: Issue) {
  const comments = (issue.comments ?? []).map((comment) => stripHtml(comment.body));
  switch (field) {
    case "summary":
      return issue.title;
    case "description":
      return stripHtml(issue.description ?? "");
    case "comment":
      return comments.join("\n");
    case "environment":
      return issue.environment ?? "";
    default:
      return [
        issue.id,
        issue.title,
        stripHtml(issue.description ?? ""),
        issue.environment ?? "",
        ...comments,
      ].join("\n");
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Jira-style `~`: every term must appear; `*` and `?` are wildcards. */
export function textContains(haystack: string, query: string) {
  const text = haystack.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((term) => {
    if (/[*?]/.test(term)) {
      const pattern = escapeRegExp(term).replace(/\\\*/g, "\\S*").replace(/\\\?/g, "\\S");
      return new RegExp(pattern).test(text);
    }
    return text.includes(term);
  });
}

function isFieldEmpty(field: JqlField, issue: Issue, ctx: JqlContext): boolean {
  switch (field) {
    case "assignee":
      return !issue.assignee;
    case "reporter":
      return !issue.creator;
    case "labels":
      return issue.labels.length === 0;
    case "component":
      return issue.components.length === 0;
    case "sprint":
      return !issue.cycleId;
    case "fixversion":
      return !issue.fixVersion;
    case "team":
      return !issue.team;
    case "goal":
      return !issue.goal;
    case "parent":
      return !issue.parentId;
    case "epic":
      return !epicIdOf(issue, ctx);
    case "summary":
      return !issue.title.trim();
    case "description":
      return !stripHtml(issue.description ?? "");
    case "environment":
      return !issue.environment?.trim();
    case "created":
    case "updated":
    case "resolved":
    case "due":
    case "startdate":
      return !issueDate(field, issue);
    case "flagged":
      return !issue.flagged;
    case "archived":
      return !issue.archivedAt;
    case "watcher":
      return (issue.watcherIds ?? []).length === 0;
    case "resolution":
      return !issue.resolution;
    case "storypoints":
      return issue.estimate === null || issue.estimate === undefined;
    default:
      return false;
  }
}

function literalMatches(
  field: JqlField,
  issue: Issue,
  value: string,
  ctx: JqlContext,
): boolean {
  switch (field) {
    case "project":
      return findProject(value, ctx).some((project) => project.id === issue.projectId) ||
        issue.projectId === value;
    case "key":
      return issue.id.toLowerCase() === value.toLowerCase();
    case "issuetype":
      return enumMatches(
        issue.kind,
        { [issue.kind]: typeName(issue.kind, workflowOf(issue, ctx)?.types) },
        value,
      );
    case "status":
      return enumMatches(
        issue.status,
        { [issue.status]: statusName(issue.status, workflowOf(issue, ctx)?.statuses) },
        value,
      );
    case "statuscategory":
      return enumMatches(statusCategory(issue.status), CATEGORY_LABELS, value);
    case "priority":
      return enumMatches(issue.priority, PRIORITY_LABELS, value);
    case "assignee":
      return userMatches(issue.assignee, value);
    case "reporter":
      return userMatches(issue.creator, value);
    case "watcher":
      return (issue.watcherIds ?? []).includes(value);
    case "labels":
      return issue.labels.some(
        (label) => label.id === value || label.name.toLowerCase() === value.toLowerCase(),
      );
    case "component":
      return issue.components.some(
        (component) =>
          component.id === value || component.name.toLowerCase() === value.toLowerCase(),
      );
    case "sprint": {
      if (!issue.cycleId) return false;
      if (issue.cycleId === value) return true;
      const cycle = ctx.cycles?.find((candidate) => candidate.id === issue.cycleId);
      return cycle?.name.toLowerCase() === value.toLowerCase();
    }
    case "fixversion":
      return (
        !!issue.fixVersion &&
        (issue.fixVersion.id === value ||
          issue.fixVersion.name.toLowerCase() === value.toLowerCase())
      );
    case "team":
      return (
        !!issue.team &&
        (issue.team.id === value ||
          issue.team.name.toLowerCase() === value.toLowerCase())
      );
    case "goal":
      return (
        !!issue.goal &&
        (issue.goal.id === value ||
          issue.goal.name.toLowerCase() === value.toLowerCase())
      );
    case "parent":
      return issue.parentId?.toLowerCase() === value.toLowerCase();
    case "epic":
      return epicIdOf(issue, ctx)?.toLowerCase() === value.toLowerCase();
    case "flagged": {
      const wanted = value.toLowerCase();
      const truthy = ["true", "yes", "impediment", "1", "flagged"].includes(wanted);
      return truthy ? issue.flagged : !issue.flagged;
    }
    case "archived": {
      const truthy = ["true", "yes", "1", "archived"].includes(value.toLowerCase());
      return truthy ? Boolean(issue.archivedAt) : !issue.archivedAt;
    }
    case "resolution":
      if (norm(value) === "unresolved") return !issue.resolution;
      return !!issue.resolution && enumMatches(issue.resolution, RESOLUTION_LABELS, value);
    case "storypoints":
      return issue.estimate !== null && issue.estimate === Number(value);
    case "rank":
      return issue.rank === Number(value);
    case "created":
    case "updated":
    case "resolved":
    case "due":
    case "startdate":
      return compareDate(field, issue, value, "=", ctx);
    default:
      return false;
  }
}

function operandToDateRange(operand: JqlOperand, ctx: JqlContext): DateRange | null {
  if (operand.kind === "function") {
    const time = evaluateDateFunction(operand.name, operand.args, ctx.now);
    return time === null ? null : { start: time, end: time, isRange: false };
  }
  return parseJqlDateLiteral(operand.value, ctx.now);
}

function compareRange(actual: number, range: DateRange, operator: JqlOperator) {
  switch (operator) {
    case ">":
      return range.isRange ? actual >= range.end : actual > range.end;
    case ">=":
      return actual >= range.start;
    case "<":
      return actual < range.start;
    case "<=":
      return range.isRange ? actual < range.end : actual <= range.end;
    default:
      return range.isRange
        ? actual >= range.start && actual < range.end
        : actual === range.start;
  }
}

function compareDate(
  field: JqlField,
  issue: Issue,
  value: string | JqlOperand,
  operator: JqlOperator,
  ctx: JqlContext,
) {
  const raw = issueDate(field, issue);
  if (!raw) return false;
  const range =
    typeof value === "string"
      ? parseJqlDateLiteral(value, ctx.now)
      : operandToDateRange(value, ctx);
  if (!range) return false;
  return compareRange(new Date(raw).getTime(), range, operator);
}

function operandMatches(
  field: JqlField,
  issue: Issue,
  operand: JqlOperand,
  ctx: JqlContext,
): boolean {
  if (operand.kind === "literal") return literalMatches(field, issue, operand.value, ctx);

  switch (operand.name) {
    case "currentuser":
      if (field === "assignee") {
        return !!ctx.currentMemberId && issue.assignee?.id === ctx.currentMemberId;
      }
      if (field === "reporter") {
        return !!ctx.currentUserId && issue.creator?.id === ctx.currentUserId;
      }
      return !!ctx.currentUserId && (issue.watcherIds ?? []).includes(ctx.currentUserId);
    case "opensprints":
    case "closedsprints":
    case "futuresprints":
      return !!issue.cycleId && sprintIdsFor(operand.name, ctx).has(issue.cycleId);
    case "releasedversions":
      return issue.fixVersion?.status === "RELEASED";
    case "unreleasedversions":
      return !!issue.fixVersion && issue.fixVersion.status !== "RELEASED";
    default:
      return compareDate(field, issue, operand, "=", ctx);
  }
}

function orderedCompare(
  field: JqlField,
  issue: Issue,
  operand: JqlOperand,
  operator: JqlOperator,
  ctx: JqlContext,
): boolean {
  if (jqlFieldSpec(field, customFieldsOf(ctx)).type === "date") {
    return compareDate(field, issue, operand, operator, ctx);
  }
  if (operand.kind !== "literal") return false;

  let diff: number | null = null;
  if (field === "key") {
    const a = splitKey(issue.id);
    const b = splitKey(operand.value);
    if (a.prefix === b.prefix && !Number.isNaN(a.number) && !Number.isNaN(b.number)) {
      diff = a.number - b.number;
    }
  } else if (field === "priority") {
    const target = enumIndex(PRIORITY_ORDER, PRIORITY_LABELS, operand.value);
    if (target >= 0) diff = PRIORITY_ORDER.indexOf(issue.priority) - target;
  } else if (field === "storypoints") {
    if (issue.estimate !== null && issue.estimate !== undefined) {
      diff = issue.estimate - Number(operand.value);
    }
  } else if (field === "rank") {
    diff = issue.rank - Number(operand.value);
  }

  if (diff === null) return false;
  switch (operator) {
    case ">":
      return diff > 0;
    case ">=":
      return diff >= 0;
    case "<":
      return diff < 0;
    default:
      return diff <= 0;
  }
}

/** Values a field held at any time, from current state plus the activity log. */
function historyValues(field: JqlField, issue: Issue): string[] {
  const values: string[] = [];
  const activity = issue.activity ?? [];
  if (field === "status" || field === "priority") {
    values.push(field === "status" ? issue.status : issue.priority);
    const type = field === "status" ? "STATUS_CHANGED" : "PRIORITY_CHANGED";
    const pattern = new RegExp(`changed ${field} from (.+) to (.+)$`);
    for (const event of activity) {
      if (event.type !== type) continue;
      const match = pattern.exec(event.description);
      if (match) values.push(match[1], match[2]);
    }
  } else if (field === "assignee") {
    if (issue.assignee) values.push(issue.assignee.name);
    for (const event of activity) {
      if (event.type !== "ASSIGNEE_CHANGED") continue;
      const match = /assigned the issue to (.+)$/.exec(event.description);
      if (match) values.push(match[1]);
    }
  }
  return values;
}

function wasMatches(field: JqlField, issue: Issue, operand: JqlOperand, ctx: JqlContext) {
  const history = historyValues(field, issue);
  if (operand.kind === "function") {
    if (operand.name !== "currentuser") return false;
    const me = ctx.members?.find((member) => member.id === ctx.currentMemberId);
    return !!me && history.some((name) => name.toLowerCase() === me.name.toLowerCase());
  }
  if (field === "assignee") {
    const wanted = operand.value.toLowerCase();
    const member = ctx.members?.find(
      (candidate) =>
        candidate.id === operand.value || candidate.email.toLowerCase() === wanted,
    );
    const name = member ? member.name.toLowerCase() : wanted;
    return history.some((value) => value.toLowerCase() === name);
  }
  const labels: Record<string, string> =
    field === "status" ? allStatusLabels(ctx) : PRIORITY_LABELS;
  return history.some((value) => {
    const wanted = norm(operand.value);
    return (
      norm(value) === wanted ||
      Object.entries(labels).some(
        ([key, label]) =>
          (norm(key) === wanted || norm(label) === wanted) &&
          (value === key || norm(value) === norm(label)),
      )
    );
  });
}

function valueItems(value: JqlValue): (JqlOperand | { kind: "empty" })[] {
  if (value.kind === "list") return value.items;
  if (value.kind === "single") return [value.operand];
  return [value];
}

function evaluateClause(
  node: Extract<JqlNode, { type: "clause" }>,
  issue: Issue,
  ctx: JqlContext,
): boolean {
  const { field, operator, value } = node;
  if (isCustomJqlField(field)) return evaluateCustomClause({ ...node, field }, issue, ctx);
  const empty = isFieldEmpty(field, issue, ctx);
  const items = valueItems(value);
  const matchesItem = (item: JqlOperand | { kind: "empty" }) =>
    item.kind === "empty" ? empty : operandMatches(field, issue, item, ctx);

  switch (operator) {
    case "is":
      return empty;
    case "is not":
      return !empty;
    case "=":
    case "in":
      return items.some(matchesItem);
    case "!=":
    case "not in":
      return !empty && !items.some(matchesItem);
    case "~":
    case "!~": {
      if (value.kind !== "single" || value.operand.kind !== "literal") return false;
      const contains = textContains(textHaystack(field, issue), value.operand.value);
      return operator === "~" ? contains : !contains;
    }
    case ">":
    case ">=":
    case "<":
    case "<=":
      return value.kind === "single" && orderedCompare(field, issue, value.operand, operator, ctx);
    case "was":
    case "was in":
      return items.some((item) => item.kind !== "empty" && wasMatches(field, issue, item, ctx));
    case "was not":
    case "was not in":
      return !items.some((item) => item.kind !== "empty" && wasMatches(field, issue, item, ctx));
    default:
      return false;
  }
}

function customValues(raw: CustomFieldValue | undefined): string[] {
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [String(raw)];
}

function optionLabel(field: JqlCustomField, id: string) {
  return field.options.find((option) => option.id === id)?.value ?? id;
}

/** Text used by `~` and for sorting. */
function customText(field: JqlCustomField | null, raw: CustomFieldValue | undefined, ctx: JqlContext) {
  if (isEmptyFieldValue(raw)) return "";
  const values = customValues(raw);
  switch (field?.type) {
    case "PARAGRAPH":
      return stripHtml(values.join(" "));
    case "SELECT":
    case "RADIO":
    case "MULTI_SELECT":
    case "CHECKBOXES":
      return values.map((id) => optionLabel(field, id)).join(", ");
    case "USER":
      return ctx.members?.find((member) => member.id === values[0])?.name ?? values[0];
    default:
      return values.join(" ");
  }
}

function customTime(field: JqlCustomField | null, raw: CustomFieldValue | undefined) {
  if (isEmptyFieldValue(raw) || Array.isArray(raw)) return null;
  const text = String(raw);
  const time = new Date(
    field?.type === "DATE" || /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text.slice(0, 10)}T00:00:00.000Z` : text,
  ).getTime();
  return Number.isNaN(time) ? null : time;
}

function customOperandMatches(
  field: JqlCustomField | null,
  raw: CustomFieldValue | undefined,
  operand: JqlOperand,
  ctx: JqlContext,
): boolean {
  if (isEmptyFieldValue(raw)) return false;
  const values = customValues(raw);
  if (operand.kind === "function") {
    if (operand.name === "currentuser") {
      return (!field || field.type === "USER") && !!ctx.currentMemberId && values[0] === ctx.currentMemberId;
    }
    const time = customTime(field, raw);
    const range = operandToDateRange(operand, ctx);
    return time !== null && !!range && compareRange(time, range, "=");
  }
  const wanted = operand.value;
  switch (field?.type) {
    case "SELECT":
    case "RADIO":
    case "MULTI_SELECT":
    case "CHECKBOXES":
      return values.some((id) => id === wanted || norm(optionLabel(field, id)) === norm(wanted));
    case "USER": {
      const member = ctx.members?.find((candidate) => candidate.id === values[0]) ?? null;
      return values[0] === wanted || userMatches(member, wanted);
    }
    case "LABELS":
      return values.some((label) => label.toLowerCase() === wanted.toLowerCase());
    case "NUMBER":
      return Number(raw) === Number(wanted);
    case "DATE":
    case "DATETIME": {
      const time = customTime(field, raw);
      const range = parseJqlDateLiteral(wanted, ctx.now);
      return time !== null && !!range && compareRange(time, range, "=");
    }
    default:
      return values.some((value) => value.toLowerCase() === wanted.toLowerCase());
  }
}

function customOrderedCompare(
  field: JqlCustomField | null,
  raw: CustomFieldValue | undefined,
  operand: JqlOperand,
  operator: JqlOperator,
  ctx: JqlContext,
) {
  if (isEmptyFieldValue(raw)) return false;
  const isDate = field?.type === "DATE" || field?.type === "DATETIME";
  if (isDate || operand.kind === "function") {
    const time = customTime(field, raw);
    const range = operandToDateRange(operand, ctx);
    return time !== null && !!range && compareRange(time, range, operator);
  }
  let diff: number;
  const left = Number(Array.isArray(raw) ? raw[0] : raw);
  const right = Number(operand.value);
  if (Number.isFinite(left) && Number.isFinite(right)) diff = left - right;
  else if (field) return false;
  else diff = customText(field, raw, ctx).localeCompare(operand.value);
  switch (operator) {
    case ">":
      return diff > 0;
    case ">=":
      return diff >= 0;
    case "<":
      return diff < 0;
    default:
      return diff <= 0;
  }
}

function evaluateCustomClause(
  node: Extract<JqlNode, { type: "clause" }> & { field: CustomJqlField },
  issue: Issue,
  ctx: JqlContext,
): boolean {
  const { field: key, operator, value } = node;
  const field = findJqlCustomField(key, customFieldsOf(ctx));
  const raw = issue.customFields?.[field?.id ?? customRef(key)];
  const empty = isEmptyFieldValue(raw);
  const items = valueItems(value);
  const matchesItem = (item: JqlOperand | { kind: "empty" }) =>
    item.kind === "empty" ? empty : customOperandMatches(field, raw, item, ctx);

  switch (operator) {
    case "is":
      return empty;
    case "is not":
      return !empty;
    case "=":
    case "in":
      return items.some(matchesItem);
    case "!=":
    case "not in":
      return !empty && !items.some(matchesItem);
    case "~":
    case "!~": {
      if (value.kind !== "single" || value.operand.kind !== "literal") return false;
      const contains = !empty && textContains(customText(field, raw, ctx), value.operand.value);
      return operator === "~" ? contains : !contains;
    }
    case ">":
    case ">=":
    case "<":
    case "<=":
      return value.kind === "single" && customOrderedCompare(field, raw, value.operand, operator, ctx);
    default:
      return false;
  }
}

export function evaluateJql(node: JqlNode | null, issue: Issue, ctx: JqlContext): boolean {
  if (!node) return true;
  switch (node.type) {
    case "and":
      return node.children.every((child) => evaluateJql(child, issue, ctx));
    case "or":
      return node.children.some((child) => evaluateJql(child, issue, ctx));
    case "not":
      return !evaluateJql(node.child, issue, ctx);
    default:
      return evaluateClause(node, issue, ctx);
  }
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

type SortValue = string | number | null;

function sortValue(field: JqlField, issue: Issue, ctx: JqlContext): SortValue {
  if (isCustomJqlField(field)) return customSortValue(field, issue, ctx);
  switch (field) {
    case "project":
      return (projectForIssue(issue, ctx)?.key ?? issue.projectId).toLowerCase();
    case "key":
      return issue.id;
    case "issuetype": {
      // Hierarchy first (epics, standard, subtasks), then configured order.
      const types = workflowOf(issue, ctx)?.types;
      const index = types
        ? types.findIndex((type) => type.key === issue.kind)
        : isBuiltinKind(issue.kind)
          ? ISSUE_KINDS.indexOf(issue.kind)
          : -1;
      return (1 - typeLevel(issue.kind)) * 1000 + (index === -1 ? 999 : index);
    }
    case "status": {
      const statuses = workflowOf(issue, ctx)?.statuses;
      const index = statuses
        ? orderStatuses(statuses).findIndex((status) => status.key === issue.status)
        : isBuiltinStatus(issue.status)
          ? ISSUE_STATUSES.indexOf(issue.status)
          : -1;
      return (
        CATEGORY_ORDER.indexOf(statusCategory(issue.status)) * 1000 +
        (index === -1 ? 999 : index)
      );
    }
    case "statuscategory":
      return CATEGORY_ORDER.indexOf(statusCategory(issue.status));
    case "priority":
      return PRIORITY_ORDER.indexOf(issue.priority);
    case "assignee":
      return issue.assignee?.name.toLowerCase() ?? null;
    case "reporter":
      return issue.creator?.name.toLowerCase() ?? null;
    case "labels":
      return issue.labels[0]?.name.toLowerCase() ?? null;
    case "component":
      return issue.components[0]?.name.toLowerCase() ?? null;
    case "sprint": {
      if (!issue.cycleId) return null;
      const cycle = ctx.cycles?.find((candidate) => candidate.id === issue.cycleId);
      return cycle ? new Date(cycle.startDate).getTime() : issue.cycleId;
    }
    case "fixversion":
      return issue.fixVersion?.name.toLowerCase() ?? null;
    case "team":
      return issue.team?.name.toLowerCase() ?? null;
    case "goal":
      return issue.goal?.name.toLowerCase() ?? null;
    case "parent":
      return issue.parentId;
    case "epic":
      return epicIdOf(issue, ctx);
    case "summary":
      return issue.title.toLowerCase();
    case "created":
    case "updated":
    case "resolved":
    case "due":
    case "startdate": {
      const raw = issueDate(field, issue);
      return raw ? new Date(raw).getTime() : null;
    }
    case "flagged":
      return issue.flagged ? 1 : 0;
    case "archived":
      return issue.archivedAt ? 1 : 0;
    case "resolution":
      return issue.resolution ? RESOLUTION_LABELS[issue.resolution].toLowerCase() : null;
    case "storypoints":
      return issue.estimate ?? null;
    case "rank":
      return issue.rank;
    default:
      return null;
  }
}

function customSortValue(key: CustomJqlField, issue: Issue, ctx: JqlContext): SortValue {
  const field = findJqlCustomField(key, customFieldsOf(ctx));
  const raw = issue.customFields?.[field?.id ?? customRef(key)];
  if (isEmptyFieldValue(raw)) return null;
  switch (field?.type) {
    case "NUMBER":
      return Number(raw);
    case "DATE":
    case "DATETIME":
      return customTime(field, raw);
    case "SELECT":
    case "RADIO": {
      const index = field.options.findIndex((option) => option.id === raw);
      return index >= 0 ? index : null;
    }
    default:
      return customText(field, raw, ctx).toLowerCase();
  }
}

function compareSortValues(field: JqlField, left: SortValue, right: SortValue) {
  if (field === "key" || field === "parent" || field === "epic") {
    return compareIssueKeys(String(left), String(right));
  }
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

export function sortIssuesByJql<T extends Issue>(
  issues: T[],
  orderBy: JqlOrderBy[],
  ctx: JqlContext,
): T[] {
  if (orderBy.length === 0) return [...issues];
  const decorated = issues.map((issue, index) => ({
    issue,
    index,
    values: orderBy.map(({ field }) => sortValue(field, issue, ctx)),
  }));
  decorated.sort((left, right) => {
    for (let position = 0; position < orderBy.length; position += 1) {
      const { field, direction } = orderBy[position];
      const a = left.values[position];
      const b = right.values[position];
      if (a === null && b === null) continue;
      if (a === null) return 1;
      if (b === null) return -1;
      const result = compareSortValues(field, a, b);
      if (result !== 0) return direction === "DESC" ? -result : result;
    }
    return left.index - right.index;
  });
  return decorated.map((entry) => entry.issue);
}

export const DEFAULT_JQL_ORDER: JqlOrderBy[] = [{ field: "created", direction: "DESC" }];

export type JqlSearchResult<T extends Issue> =
  | { ok: true; issues: T[]; query: JqlQuery }
  | { ok: false; error: JqlError };

/** Parses, filters and orders in one step; defaults to ORDER BY created DESC. */
export function searchIssuesWithJql<T extends Issue>(
  issues: T[],
  jql: string,
  ctx: JqlContext,
): JqlSearchResult<T> {
  const parsed = parseJql(jql, ctx.now, { customFields: customFieldsOf(ctx) });
  if (!parsed.ok) return parsed;
  const scopedCtx: JqlContext = {
    ...ctx,
    issuesById: ctx.issuesById ?? new Map(issues.map((issue) => [issue.id, issue])),
  };
  const matched = issues.filter((issue) =>
    evaluateJql(parsed.query.where, issue, scopedCtx),
  );
  const orderBy = parsed.query.orderBy.length ? parsed.query.orderBy : DEFAULT_JQL_ORDER;
  return { ok: true, issues: sortIssuesByJql(matched, orderBy, scopedCtx), query: parsed.query };
}

export function projectsByKeyFrom(projects: JqlProject[]): Record<string, JqlProject> {
  return Object.fromEntries(projects.map((project) => [project.key, project]));
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export function quoteJqlValue(value: string) {
  if (/^[A-Za-z0-9_.@+-]+$/.test(value) && !RESERVED.has(value.toLowerCase())) {
    return value;
  }
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function topLevelOrderIndex(jql: string): number | null {
  let tokens: JqlToken[];
  try {
    tokens = tokenizeJql(jql, true);
  } catch {
    return null;
  }
  let depth = 0;
  for (const token of tokens) {
    if (token.type === "lparen") depth += 1;
    if (token.type === "rparen") depth = Math.max(0, depth - 1);
    if (depth === 0 && token.type === "word" && token.value.toLowerCase() === "order") {
      return token.start;
    }
  }
  return null;
}

export function stripOrderBy(jql: string) {
  const index = topLevelOrderIndex(jql);
  return (index === null ? jql : jql.slice(0, index)).trim();
}

/** Replaces the ORDER BY clause (used by sortable column headers). */
export function setJqlOrderBy(jql: string, orderBy: JqlOrderBy[]) {
  const where = stripOrderBy(jql);
  if (orderBy.length === 0) return where;
  const clause = `ORDER BY ${orderBy
    .map(({ field, direction }) => `${jqlFieldSpec(field).name} ${direction}`)
    .join(", ")}`;
  return where ? `${where} ${clause}` : clause;
}

export type BasicFilters = {
  text?: string;
  status?: "ALL" | "ACTIVE" | string;
  priority?: string;
  projectKey?: string | null;
  labelName?: string | null;
  /** A member name, "UNASSIGNED", or empty for any. */
  assignee?: string | null;
  sort?: "NEWEST" | "OLDEST";
};

/** Converts Basic-mode filters into equivalent JQL (Jira's Basic -> JQL switch). */
export function basicFiltersToJql(filters: BasicFilters) {
  const clauses: string[] = [];
  if (filters.projectKey) clauses.push(`project = ${quoteJqlValue(filters.projectKey)}`);
  if (filters.status === "ACTIVE") {
    clauses.push("statusCategory != Done");
  } else if (filters.status && filters.status !== "ALL") {
    clauses.push(`status = ${quoteJqlValue(statusName(filters.status))}`);
  }
  if (filters.priority && filters.priority !== "ALL") {
    clauses.push(
      `priority = ${quoteJqlValue(PRIORITY_LABELS[filters.priority as IssuePriority] ?? filters.priority)}`,
    );
  }
  if (filters.labelName) clauses.push(`labels = ${quoteJqlValue(filters.labelName)}`);
  if (filters.assignee === "UNASSIGNED") clauses.push("assignee IS EMPTY");
  else if (filters.assignee) clauses.push(`assignee = ${quoteJqlValue(filters.assignee)}`);
  if (filters.text?.trim()) {
    clauses.push(`text ~ ${quoteJqlValue(filters.text.trim())}`);
  }
  const order = `ORDER BY created ${filters.sort === "OLDEST" ? "ASC" : "DESC"}`;
  return clauses.length ? `${clauses.join(" AND ")} ${order}` : order;
}

/* ------------------------------------------------------------------ */
/* Autocomplete                                                        */
/* ------------------------------------------------------------------ */

export type JqlSuggestionKind = "field" | "operator" | "value" | "keyword" | "function";

export type JqlSuggestion = {
  label: string;
  insert: string;
  kind: JqlSuggestionKind;
  detail?: string;
};

export type JqlSuggestionSource = {
  projects?: JqlProject[];
  members?: WorkspaceMember[];
  labels?: { name: string }[];
  cycles?: Cycle[];
  versions?: { name: string }[];
  components?: { name: string }[];
  /** Configured statuses/types; defaults to the built-ins when absent. */
  statuses?: { name: string }[];
  types?: { name: string }[];
  /** Custom fields; defaults to registerJqlCustomFields(). */
  customFields?: JqlCustomField[];
};

export type JqlSuggestions = {
  from: number;
  to: number;
  items: JqlSuggestion[];
};

const SUGGESTED_FIELDS: { label: string; field: BuiltinJqlField }[] = [
  { label: "project", field: "project" },
  { label: "key", field: "key" },
  { label: "issuetype", field: "issuetype" },
  { label: "status", field: "status" },
  { label: "statusCategory", field: "statuscategory" },
  { label: "priority", field: "priority" },
  { label: "assignee", field: "assignee" },
  { label: "reporter", field: "reporter" },
  { label: "labels", field: "labels" },
  { label: "sprint", field: "sprint" },
  { label: "fixVersion", field: "fixversion" },
  { label: "component", field: "component" },
  { label: "team", field: "team" },
  { label: "goal", field: "goal" },
  { label: "parent", field: "parent" },
  { label: "epic", field: "epic" },
  { label: "text", field: "text" },
  { label: "summary", field: "summary" },
  { label: "description", field: "description" },
  { label: "comment", field: "comment" },
  { label: "created", field: "created" },
  { label: "updated", field: "updated" },
  { label: "resolved", field: "resolved" },
  { label: "due", field: "due" },
  { label: "flagged", field: "flagged" },
  { label: "archived", field: "archived" },
  { label: "watcher", field: "watcher" },
  { label: "resolution", field: "resolution" },
  { label: "\"story points\"", field: "storypoints" },
];

const DATE_VALUE_SUGGESTIONS = [
  "-1d",
  "-7d",
  "-2w",
  "now()",
  "startOfDay()",
  "endOfDay()",
  "startOfWeek()",
  "endOfWeek()",
  "startOfMonth()",
  "endOfMonth()",
];

function uniqueNames(items: { name: string }[]) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(item.name);
  }
  return names;
}

function valueSuggestions(field: JqlField, source: JqlSuggestionSource): JqlSuggestion[] {
  const values = (items: string[], detail?: string): JqlSuggestion[] =>
    items.map((item) => ({ label: item, insert: quoteJqlValue(item), kind: "value", detail }));
  const fns = (items: string[]): JqlSuggestion[] =>
    items.map((item) => ({ label: item, insert: item, kind: "function" }));

  if (isCustomJqlField(field)) {
    const custom = findJqlCustomField(field, source.customFields ?? registeredCustomFields);
    switch (custom?.type) {
      case "SELECT":
      case "RADIO":
      case "MULTI_SELECT":
      case "CHECKBOXES":
        return values(custom.options.filter((option) => !option.disabled).map((option) => option.value));
      case "USER":
        return [
          ...fns(["currentUser()"]),
          ...values((source.members ?? []).map((member) => member.name)),
        ];
      case "DATE":
      case "DATETIME":
        return DATE_VALUE_SUGGESTIONS.map((item) => ({
          label: item,
          insert: item,
          kind: item.includes("(") ? "function" : "value",
        }));
      default:
        return [];
    }
  }

  switch (field) {
    case "project":
      return (source.projects ?? []).map((project) => ({
        label: project.key,
        insert: quoteJqlValue(project.key),
        kind: "value",
        detail: project.name,
      }));
    case "issuetype":
      return values(
        uniqueNames(source.types?.length ? source.types : Object.values(KIND_LABELS).map((name) => ({ name }))),
      );
    case "status":
      return values(
        uniqueNames(
          source.statuses?.length
            ? source.statuses
            : Object.values(STATUS_LABELS).map((name) => ({ name })),
        ),
      );
    case "statuscategory":
      return values(Object.values(CATEGORY_LABELS));
    case "priority":
      return values(Object.values(PRIORITY_LABELS));
    case "assignee":
    case "reporter":
      return [
        ...fns(["currentUser()"]),
        ...values((source.members ?? []).map((member) => member.name)),
      ];
    case "watcher":
      return fns(["currentUser()"]);
    case "labels":
      return values((source.labels ?? []).map((label) => label.name));
    case "sprint":
      return [
        ...fns(["openSprints()", "futureSprints()", "closedSprints()"]),
        ...values([...new Set((source.cycles ?? []).map((cycle) => cycle.name))]),
      ];
    case "fixversion":
      return [
        ...fns(["unreleasedVersions()", "releasedVersions()"]),
        ...values([...new Set((source.versions ?? []).map((version) => version.name))]),
      ];
    case "component":
      return values([...new Set((source.components ?? []).map((component) => component.name))]);
    case "resolution":
      return values(["Unresolved", ...Object.values(RESOLUTION_LABELS)]);
    case "flagged":
    case "archived":
      return values(["true", "false"]);
    case "created":
    case "updated":
    case "resolved":
    case "due":
    case "startdate":
      return DATE_VALUE_SUGGESTIONS.map((item) => ({
        label: item,
        insert: item,
        kind: item.includes("(") ? "function" : "value",
      }));
    case "storypoints":
      return values(["1", "2", "3", "5", "8", "13"]);
    default:
      return [];
  }
}

type Expectation =
  | { state: "field" }
  | { state: "operator"; field: JqlField | null }
  | { state: "value"; field: JqlField | null; operator: string }
  | { state: "connector"; inList: boolean }
  | { state: "by" }
  | { state: "orderField" }
  | { state: "direction" };

function computeExpectation(tokens: JqlToken[], customFields: JqlCustomField[]): Expectation {
  let expectation: Expectation = { state: "field" };
  let field: JqlField | null = null;
  let operator = "";
  let inList = false;
  let inOrder = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const word = token.type === "word" ? token.value.toLowerCase() : "";

    if (inOrder) {
      if (expectation.state === "by" && word === "by") expectation = { state: "orderField" };
      else if (expectation.state === "orderField") expectation = { state: "direction" };
      else if (expectation.state === "direction" && token.type === "comma") {
        expectation = { state: "orderField" };
      } else if (expectation.state === "direction" && (word === "asc" || word === "desc")) {
        expectation = { state: "direction" };
      }
      continue;
    }

    switch (expectation.state) {
      case "field":
        if (word === "not" || token.type === "lparen") break;
        if (word === "order") {
          inOrder = true;
          expectation = { state: "by" };
          break;
        }
        field = resolveJqlFieldText(token.value, customFields);
        expectation = { state: "operator", field };
        break;
      case "operator":
        if (word === "is" || word === "was") {
          const next = tokens[index + 1];
          if (next && next.type === "word" && next.value.toLowerCase() === "not") {
            index += 1;
            operator = `${word} not`;
          } else {
            operator = word;
          }
          if (word === "was") {
            const following = tokens[index + 1];
            if (following?.type === "word" && following.value.toLowerCase() === "in") {
              index += 1;
              operator += " in";
            }
          }
        } else if (word === "not") {
          const next = tokens[index + 1];
          if (next?.type === "word" && next.value.toLowerCase() === "in") index += 1;
          operator = "not in";
        } else {
          operator = token.type === "op" ? token.value : word;
        }
        expectation = { state: "value", field, operator };
        inList = false;
        break;
      case "value":
        if (token.type === "lparen" && operator.endsWith("in") && !inList) {
          inList = true;
          break;
        }
        if (token.type === "word" && tokens[index + 1]?.type === "lparen") {
          let depth = 0;
          for (index += 1; index < tokens.length; index += 1) {
            if (tokens[index].type === "lparen") depth += 1;
            if (tokens[index].type === "rparen") {
              depth -= 1;
              if (depth === 0) break;
            }
          }
        }
        expectation = { state: "connector", inList };
        break;
      case "connector":
        if (expectation.inList) {
          if (token.type === "comma") expectation = { state: "value", field, operator };
          else if (token.type === "rparen") {
            inList = false;
            expectation = { state: "connector", inList: false };
          }
          break;
        }
        if (word === "and" || word === "or") expectation = { state: "field" };
        else if (word === "order") {
          inOrder = true;
          expectation = { state: "by" };
        }
        break;
      default:
        break;
    }
  }

  return expectation;
}

function filterByPrefix(items: JqlSuggestion[], prefix: string) {
  const wanted = prefix.replace(/^["']/, "").toLowerCase();
  if (!wanted) return items;
  return items.filter((item) => {
    const label = item.label.replace(/^"/, "").toLowerCase();
    return label.startsWith(wanted) || (wanted.length > 1 && label.includes(wanted));
  });
}

export function getJqlSuggestions(
  text: string,
  caret: number,
  source: JqlSuggestionSource,
  limit = 12,
): JqlSuggestions {
  const before = text.slice(0, caret);
  const tokens = tokenizeJql(before, true).filter((token) => token.type !== "eof");
  const last = tokens.at(-1);
  const endsInWord =
    !!last &&
    last.end === before.length &&
    (last.type === "word" || last.type === "string" || last.type === "op") &&
    !(last.type === "string" && !last.unterminated);

  const context = endsInWord ? tokens.slice(0, -1) : tokens;
  const prefix = endsInWord && last ? last.value : "";
  const from = endsInWord && last ? last.start : caret;
  const customFields = source.customFields ?? registeredCustomFields;
  const expectation = computeExpectation(context, customFields);
  const customFieldItems = customFields.map((field) => ({
    label: quoteJqlValue(field.name),
    insert: quoteJqlValue(field.name),
    kind: "field" as const,
    detail: CUSTOM_FIELD_TYPE_LABELS[field.type],
    sortable: jqlFieldSpec(customFieldJqlKey(field.id), customFields).sortable,
  }));

  let items: JqlSuggestion[] = [];
  switch (expectation.state) {
    case "field":
      items = [
        ...SUGGESTED_FIELDS.map(({ label, field }) => ({
          label,
          insert: label,
          kind: "field" as const,
          detail: JQL_FIELD_SPECS[field].type,
        })),
        ...customFieldItems.map(({ label, insert, kind, detail }) => ({ label, insert, kind, detail })),
        { label: "NOT", insert: "NOT", kind: "keyword" },
        { label: "ORDER BY", insert: "ORDER BY", kind: "keyword" },
      ];
      break;
    case "operator": {
      const operators = expectation.field
        ? jqlFieldSpec(expectation.field, customFields).operators
        : ["=", "!="];
      items = operators.map((operator) => {
        const insert = /^[a-z]/.test(operator)
          ? operator.toUpperCase() + (operator.startsWith("is") ? " EMPTY" : "")
          : operator;
        return { label: insert, insert, kind: "operator" as const };
      });
      break;
    }
    case "value":
      if (expectation.operator.startsWith("is")) {
        items = [
          ...(expectation.operator === "is" ? [{ label: "NOT", insert: "NOT", kind: "keyword" as const }] : []),
          { label: "EMPTY", insert: "EMPTY", kind: "keyword" },
        ];
      } else {
        items = expectation.field ? valueSuggestions(expectation.field, source) : [];
        if (expectation.operator.endsWith("in") && !context.some((token) => token.type === "lparen")) {
          items = [{ label: "(", insert: "(", kind: "keyword" }, ...items];
        }
        if (
          expectation.field &&
          !["text", "summary", "description", "comment", "environment"].includes(expectation.field) &&
          ["=", "!=", "in", "not in"].includes(expectation.operator)
        ) {
          items.push({ label: "EMPTY", insert: "EMPTY", kind: "keyword" });
        }
      }
      break;
    case "connector":
      items = expectation.inList
        ? [
            { label: ",", insert: ",", kind: "keyword" },
            { label: ")", insert: ")", kind: "keyword" },
          ]
        : [
            { label: "AND", insert: "AND", kind: "keyword" },
            { label: "OR", insert: "OR", kind: "keyword" },
            { label: "ORDER BY", insert: "ORDER BY", kind: "keyword" },
          ];
      break;
    case "by":
      items = [{ label: "BY", insert: "BY", kind: "keyword" }];
      break;
    case "orderField":
      items = SUGGESTED_FIELDS.filter(({ field }) => JQL_FIELD_SPECS[field].sortable).map(
        ({ label }) => ({ label, insert: label, kind: "field" as const }),
      );
      items.push({ label: "rank", insert: "rank", kind: "field" });
      items.push(
        ...customFieldItems
          .filter((item) => item.sortable)
          .map(({ label, insert }) => ({ label, insert, kind: "field" as const })),
      );
      break;
    case "direction":
      items = [
        { label: "ASC", insert: "ASC", kind: "keyword" },
        { label: "DESC", insert: "DESC", kind: "keyword" },
        { label: ",", insert: ",", kind: "keyword" },
      ];
      break;
  }

  return {
    from,
    to: caret,
    items: filterByPrefix(items, prefix).slice(0, limit),
  };
}

/** Inserts a suggestion, adding a trailing space so typing can continue. */
export function applyJqlSuggestion(
  text: string,
  suggestions: Pick<JqlSuggestions, "from" | "to">,
  suggestion: JqlSuggestion,
) {
  const head = text.slice(0, suggestions.from);
  const tail = text.slice(suggestions.to);
  const needsSpace = !tail.startsWith(" ") && suggestion.insert !== "(";
  const inserted = `${suggestion.insert}${needsSpace ? " " : ""}`;
  return { text: `${head}${inserted}${tail}`, caret: head.length + inserted.length };
}
