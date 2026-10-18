import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  applicableFields,
  fieldAppliesTo,
  formatFieldValue,
  isCustomFieldType,
  isEmptyFieldValue,
  mergeFieldOptions,
  normalizeFieldValue,
  parseCustomFieldValues,
  sameFieldValue,
  withoutOptions,
  type CustomFieldDefinition,
  type CustomFieldOption,
  type CustomFieldValue,
  type CustomFieldValues,
} from "../app/data/customFields";
import { typeName } from "../app/data/workflow";
import { recordAudit, type AuditActor } from "./audit";
import type {
  CreateCustomFieldInput,
  UpdateCustomFieldInput,
} from "./customFieldSchemas";
import { sanitizeDescriptionHtml } from "./richText";

export class CustomFieldInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomFieldInputError";
  }
}

export class DuplicateCustomFieldError extends Error {
  constructor(name: string) {
    super(`A custom field named '${name}' already exists in this workspace`);
    this.name = "DuplicateCustomFieldError";
  }
}

type StoredField = Prisma.CustomFieldGetPayload<object>;

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeCustomField(
  field: StoredField,
  usageCount?: number,
): CustomFieldDefinition {
  const options = parseJsonArray(field.options)
    .filter(
      (option): option is CustomFieldOption =>
        !!option &&
        typeof option === "object" &&
        typeof (option as CustomFieldOption).id === "string" &&
        typeof (option as CustomFieldOption).value === "string",
    )
    .map((option) =>
      option.disabled
        ? { id: option.id, value: option.value, disabled: true }
        : { id: option.id, value: option.value },
    );
  return {
    id: field.id,
    name: field.name,
    type: isCustomFieldType(field.type) ? field.type : "TEXT",
    description: field.description,
    options,
    required: field.required,
    issueTypes: parseJsonArray(field.issueTypes).filter(
      (key): key is string => typeof key === "string",
    ),
    position: field.position,
    projectId: field.projectId,
    ...(usageCount === undefined ? {} : { usageCount }),
  };
}

/** Number of issues holding a value, per field id. */
async function usageCounts(organizationId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ key: string; count: bigint }[]>`
    SELECT key, COUNT(*)::bigint AS count
    FROM "Issue", jsonb_object_keys(
      CASE WHEN "customFields" ~ '^\\s*\\{' THEN "customFields"::jsonb ELSE '{}'::jsonb END
    ) AS key
    WHERE "organizationId" = ${organizationId}
    GROUP BY key`;
  return new Map(rows.map((row) => [row.key, Number(row.count)]));
}

/** Every field in the workspace (global and per project). */
export async function listAllCustomFields(
  organizationId: string,
): Promise<CustomFieldDefinition[]> {
  const fields = await prisma.customField.findMany({
    where: { organizationId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return fields.map((field) => serializeCustomField(field));
}

/**
 * Fields for management screens. `scope` "global" lists workspace fields;
 * a project id lists that project's own fields. Includes usage counts.
 */
export async function listCustomFieldsForScope(
  organizationId: string,
  scope: "global" | { projectId: string },
) {
  if (scope !== "global") {
    const project = await prisma.project.findFirst({
      where: { id: scope.projectId, organizationId },
      select: { id: true },
    });
    if (!project) return null;
  }
  const [fields, counts] = await Promise.all([
    prisma.customField.findMany({
      where: {
        organizationId,
        projectId: scope === "global" ? null : scope.projectId,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    usageCounts(organizationId),
  ]);
  return fields.map((field) => serializeCustomField(field, counts.get(field.id) ?? 0));
}

async function assertUniqueName(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.customField.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new DuplicateCustomFieldError(name);
}

export async function createCustomField(
  organizationId: string,
  projectId: string | null,
  input: CreateCustomFieldInput,
  actor: AuditActor,
) {
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) return null;
  }
  await assertUniqueName(organizationId, input.name);
  const { options } = mergeFieldOptions([], input.options ?? []);
  const last = await prisma.customField.findFirst({
    where: { organizationId, projectId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const field = await prisma.customField.create({
    data: {
      organizationId,
      projectId,
      name: input.name,
      type: input.type,
      description: input.description || null,
      required: input.required ?? false,
      options: JSON.stringify(options),
      issueTypes: JSON.stringify(input.issueTypes ?? []),
      position: (last?.position ?? -1) + 1,
    },
  });
  await recordAudit({
    organizationId,
    actor,
    action: "custom_field.created",
    targetType: "customField",
    targetId: field.id,
    details: { name: field.name, type: field.type, projectId },
  });
  return serializeCustomField(field, 0);
}

async function findField(organizationId: string, id: string, projectId?: string | null) {
  return prisma.customField.findFirst({
    where: {
      id,
      organizationId,
      ...(projectId === undefined ? {} : { projectId }),
    },
  });
}

/** Removes stored values for a field (all of them, or only some option ids). */
async function scrubValues(
  organizationId: string,
  fieldId: string,
  removedOptionIds?: string[],
) {
  const issues = await prisma.issue.findMany({
    where: { organizationId, customFields: { contains: `"${fieldId}"` } },
    select: { id: true, customFields: true },
  });
  let changed = 0;
  for (const issue of issues) {
    const values = parseCustomFieldValues(issue.customFields);
    if (!(fieldId in values)) continue;
    if (removedOptionIds) {
      const next = withoutOptions(values[fieldId], removedOptionIds);
      if (next === values[fieldId]) continue;
      if (next === null || next === undefined) delete values[fieldId];
      else values[fieldId] = next;
    } else {
      delete values[fieldId];
    }
    changed += 1;
    await prisma.issue.update({
      where: { id: issue.id },
      data: { customFields: JSON.stringify(values) },
    });
  }
  return changed;
}

export async function updateCustomField(
  organizationId: string,
  id: string,
  input: UpdateCustomFieldInput,
  actor: AuditActor,
  projectId?: string | null,
) {
  const current = await findField(organizationId, id, projectId);
  if (!current) return null;
  const existing = serializeCustomField(current);
  if (input.name !== undefined && input.name.toLowerCase() !== current.name.toLowerCase()) {
    await assertUniqueName(organizationId, input.name, id);
  }

  let removedIds: string[] = [];
  let options: CustomFieldOption[] | undefined;
  if (input.options !== undefined) {
    if (input.options.length > 0 && !["SELECT", "MULTI_SELECT", "CHECKBOXES", "RADIO"].includes(existing.type)) {
      throw new CustomFieldInputError("Only select, checkbox and radio fields have options");
    }
    const merged = mergeFieldOptions(existing.options, input.options);
    options = merged.options;
    removedIds = merged.removedIds;
    if (
      ["SELECT", "MULTI_SELECT", "CHECKBOXES", "RADIO"].includes(existing.type) &&
      !options.some((option) => !option.disabled)
    ) {
      throw new CustomFieldInputError("Keep at least one enabled option");
    }
  }

  const field = await prisma.customField.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(options !== undefined ? { options: JSON.stringify(options) } : {}),
      ...(input.issueTypes !== undefined ? { issueTypes: JSON.stringify(input.issueTypes) } : {}),
    },
  });
  if (removedIds.length) await scrubValues(organizationId, id, removedIds);
  await recordAudit({
    organizationId,
    actor,
    action: "custom_field.updated",
    targetType: "customField",
    targetId: id,
    details: { name: field.name, changes: Object.keys(input), removedOptions: removedIds.length },
  });
  const counts = await usageCounts(organizationId);
  return serializeCustomField(field, counts.get(id) ?? 0);
}

export async function deleteCustomField(
  organizationId: string,
  id: string,
  actor: AuditActor,
  projectId?: string | null,
) {
  const current = await findField(organizationId, id, projectId);
  if (!current) return null;
  const cleared = await scrubValues(organizationId, id);
  await prisma.customField.delete({ where: { id } });
  await recordAudit({
    organizationId,
    actor,
    action: "custom_field.deleted",
    targetType: "customField",
    targetId: id,
    details: { name: current.name, clearedIssues: cleared },
  });
  return { id, clearedIssues: cleared };
}

/** Sets positions within one scope (global or a project) from an ordered id list. */
export async function reorderCustomFields(
  organizationId: string,
  projectId: string | null,
  ids: string[],
) {
  const fields = await prisma.customField.findMany({
    where: { organizationId, projectId },
    select: { id: true },
  });
  const known = new Set(fields.map((field) => field.id));
  if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
    throw new CustomFieldInputError("The order must list every field exactly once");
  }
  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.customField.update({ where: { id }, data: { position } }),
    ),
  );
  return listCustomFieldsForScope(organizationId, projectId ? { projectId } : "global");
}

/* ------------------------------------------------------------------ */
/* Issue values                                                        */
/* ------------------------------------------------------------------ */

export type CustomFieldChange = {
  field: CustomFieldDefinition;
  value: CustomFieldValue | null;
  description: string;
};

export type ResolvedCustomFields =
  | { ok: true; values: CustomFieldValues; changes: CustomFieldChange[] }
  | { ok: false; error: string };

function describeChange(
  field: CustomFieldDefinition,
  value: CustomFieldValue | null,
  members: { id: string; name: string }[],
) {
  if (isEmptyFieldValue(value)) return `cleared ${field.name}`;
  if (field.type === "PARAGRAPH") return `updated ${field.name}`;
  const display = formatFieldValue(field, value, members);
  const short = display.length > 120 ? `${display.slice(0, 117)}...` : display;
  return `changed ${field.name} to ${short}`;
}

/**
 * Validates incoming values for one issue and merges them onto `current`.
 * Keys may be field ids or (case-insensitive) field names; null clears.
 * On create every applicable required field must end up with a value; on
 * update a required field cannot be cleared.
 */
export async function resolveCustomFieldValues(options: {
  organizationId: string;
  projectId: string;
  kind: string;
  current: CustomFieldValues;
  input: Record<string, unknown>;
  mode: "create" | "update";
}): Promise<ResolvedCustomFields> {
  const { organizationId, projectId, kind, current, input, mode } = options;
  const stored = await prisma.customField.findMany({
    where: { organizationId, OR: [{ projectId: null }, { projectId }] },
    orderBy: { position: "asc" },
  });
  const fields = stored.map((field) => serializeCustomField(field));
  const values: CustomFieldValues = { ...current };
  const changes: CustomFieldChange[] = [];
  const needsMembers = fields.some((field) => field.type === "USER");
  const members = needsMembers
    ? (
        await prisma.member.findMany({
          where: { organizationId },
          select: { id: true, user: { select: { name: true } } },
        })
      ).map((member) => ({ id: member.id, name: member.user.name }))
    : [];

  for (const [key, raw] of Object.entries(input)) {
    const field =
      fields.find((candidate) => candidate.id === key) ??
      fields.find((candidate) => candidate.name.toLowerCase() === key.trim().toLowerCase());
    if (!field) {
      return { ok: false, error: `The custom field '${key}' does not exist in this project` };
    }
    if (!fieldAppliesTo(field, projectId, kind)) {
      return {
        ok: false,
        error: `${field.name} is not available for ${typeName(kind)} work items`,
      };
    }
    const result = normalizeFieldValue(field, raw, current[field.id]);
    if (!result.ok) return result;
    let value = result.value;
    if (value !== null && field.type === "PARAGRAPH") {
      value = sanitizeDescriptionHtml(String(value));
    }
    if (value !== null && field.type === "USER" && !members.some((member) => member.id === value)) {
      return { ok: false, error: `${field.name}: choose a member of this workspace` };
    }
    if (value === null && field.required) {
      return { ok: false, error: `${field.name} is required` };
    }
    if (sameFieldValue(current[field.id], value)) continue;
    if (value === null) delete values[field.id];
    else values[field.id] = value;
    changes.push({ field, value, description: describeChange(field, value, members) });
  }

  if (mode === "create") {
    for (const field of applicableFields(fields, projectId, kind)) {
      if (field.required && isEmptyFieldValue(values[field.id])) {
        return { ok: false, error: `${field.name} is required` };
      }
    }
  }

  return { ok: true, values, changes };
}
