import prisma from "../../prisma/client";

/** Known audit actions. Free-form strings are accepted too; these drive the filter UI. */
export const AUDIT_ACTIONS = [
  "project.created",
  "project.updated",
  "project.deleted",
  "project.trashed",
  "project.restored",
  "project.purged",
  "project.archived",
  "project.unarchived",
  "project.access_changed",
  "project.members_added",
  "project.member_role_changed",
  "project.member_removed",
  "issue.trashed",
  "issue.restored",
  "issue.purged",
  "issue.archived",
  "issue.unarchived",
  "member.role_changed",
  "member.removed",
  "invitation.created",
  "workflow.updated",
  "automation.created",
  "automation.updated",
  "automation.deleted",
  "api_token.created",
  "api_token.revoked",
  "webhook.created",
  "webhook.updated",
  "webhook.deleted",
  "import.completed",
  "export.downloaded",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActor = { id: string | null; name: string } | null;

export type AuditInput = {
  organizationId: string;
  actor: AuditActor;
  action: AuditAction | (string & {});
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
};

export type AuditEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  actorId: string | null;
  actorName: string;
  createdAt: string;
};

function safeStringify(details: Record<string, unknown> | undefined) {
  try {
    const text = JSON.stringify(details ?? {});
    // Keep rows small: details are a summary, not a payload archive.
    return text.length > 8000 ? JSON.stringify({ truncated: true }) : text;
  } catch {
    return "{}";
  }
}

/** Records an audit event. Never throws: auditing must not break the audited action. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: input.action.slice(0, 120),
        targetType: input.targetType.slice(0, 80),
        targetId: input.targetId ?? null,
        details: safeStringify(input.details),
        actorId: input.actor?.id ?? null,
        actorName: (input.actor?.name ?? "System").slice(0, 200),
      },
    });
  } catch (error) {
    console.error("Failed to record audit event", input.action, error);
  }
}

function parseDetails(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export type AuditQuery = {
  action?: string | null;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
};

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(organizationId: string, query: AuditQuery) {
  const pageSize = Math.min(Math.max(query.pageSize ?? AUDIT_PAGE_SIZE, 1), 200);
  const page = Math.max(query.page ?? 1, 1);
  const where = {
    organizationId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.findMany({
      where: { organizationId },
      distinct: ["action"],
      select: { action: true },
    }),
  ]);

  const knownActions = new Set<string>(AUDIT_ACTIONS);
  for (const row of actions) knownActions.add(row.action);

  return {
    entries: rows.map(
      (row): AuditEntry => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        details: parseDetails(row.details),
        actorId: row.actorId,
        actorName: row.actorName,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
    total,
    page,
    pageSize,
    actions: [...knownActions].sort(),
  };
}

/** Parses a `YYYY-MM-DD` filter bound; `endOfDay` makes the upper bound inclusive. */
export function parseAuditDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
