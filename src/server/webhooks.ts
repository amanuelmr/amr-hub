import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import prisma from "../../prisma/client";
import { WEBHOOK_EVENT_LABELS } from "../app/components/admin/webhookEvents";
import { recordAudit } from "./audit";

export const WEBHOOK_EVENTS = [
  "issue_created",
  "issue_updated",
  "issue_deleted",
  "comment_created",
  "sprint_started",
  "sprint_closed",
  "version_released",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export { WEBHOOK_EVENT_LABELS };

export const WEBHOOK_TIMEOUT_MS = 5000;
export const SIGNATURE_HEADER = "X-AMR-Signature";

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Returns an error message, or null when the URL is an acceptable target. */
export function webhookUrlProblem(value: string, development = isDevelopment()) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid URL";
  }
  if (url.username || url.password) return "URLs with credentials are not allowed";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && development && LOCAL_HOSTS.has(url.hostname)) {
    return null;
  }
  return development
    ? "Use an https:// URL (http:// is only allowed for localhost)"
    : "Use an https:// URL";
}

const webhookEventsSchema = z
  .array(z.enum(WEBHOOK_EVENTS))
  .min(1, "Select at least one event")
  .transform((events) => [...new Set(events)]);

const webhookUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .superRefine((value, context) => {
    const problem = webhookUrlProblem(value);
    if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export const createWebhookSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    url: webhookUrlSchema,
    events: webhookEventsSchema,
    enabled: z.boolean().optional(),
  })
  .strict();

export const updateWebhookSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    url: webhookUrlSchema.optional(),
    events: webhookEventsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

function ipv4ToNumber(address: string) {
  return address
    .split(".")
    .reduce((total, part) => total * 256 + Number(part), 0);
}

function inIpv4Range(address: string, base: string, bits: number) {
  const size = 2 ** (32 - bits);
  const start = ipv4ToNumber(base);
  const value = ipv4ToNumber(address);
  return value >= start && value < start + size;
}

/** True for loopback, private, link-local and unique-local addresses (SSRF guard). */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    return (
      inIpv4Range(address, "10.0.0.0", 8) ||
      inIpv4Range(address, "172.16.0.0", 12) ||
      inIpv4Range(address, "192.168.0.0", 16) ||
      inIpv4Range(address, "127.0.0.0", 8) ||
      inIpv4Range(address, "169.254.0.0", 16) ||
      inIpv4Range(address, "0.0.0.0", 8) ||
      inIpv4Range(address, "100.64.0.0", 10)
    );
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped) return isPrivateAddress(mapped[1]);
    const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
    // fc00::/7 unique local, fe80::/10 link-local
    if ((firstGroup & 0xfe00) === 0xfc00) return true;
    if ((firstGroup & 0xffc0) === 0xfe80) return true;
    return false;
  }
  return true;
}

/** Resolves the host and rejects private-network targets outside development. */
export async function assertPublicTarget(rawUrl: string) {
  const problem = webhookUrlProblem(rawUrl);
  if (problem) throw new WebhookTargetError(problem);
  if (isDevelopment()) return;
  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new WebhookTargetError("The webhook host could not be resolved");
      });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new WebhookTargetError("Webhook URLs cannot point at private network addresses");
  }
}

export class WebhookTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookTargetError";
  }
}

export function signWebhookBody(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function parseWebhookEvents(value: string): WebhookEvent[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((event): event is WebhookEvent =>
          (WEBHOOK_EVENTS as readonly string[]).includes(event),
        )
      : [];
  } catch {
    return [];
  }
}

export type WebhookSummary = {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus: number | null;
  lastDeliveredAt: string | null;
  createdAt: string;
};

type StoredWebhook = Awaited<ReturnType<typeof prisma.webhook.findMany>>[number];

function serializeWebhook(webhook: StoredWebhook): WebhookSummary {
  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: parseWebhookEvents(webhook.events),
    enabled: webhook.enabled,
    lastStatus: webhook.lastStatus,
    lastDeliveredAt: webhook.lastDeliveredAt?.toISOString() ?? null,
    createdAt: webhook.createdAt.toISOString(),
  };
}

type Actor = { id: string; name: string; organizationId: string };

export async function listWebhooks(organizationId: string) {
  const webhooks = await prisma.webhook.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return webhooks.map(serializeWebhook);
}

export async function createWebhook(
  input: z.infer<typeof createWebhookSchema>,
  actor: Actor,
) {
  await assertPublicTarget(input.url);
  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      name: input.name,
      url: input.url,
      events: JSON.stringify(input.events),
      enabled: input.enabled ?? true,
      secret,
      organizationId: actor.organizationId,
    },
  });
  await recordAudit({
    organizationId: actor.organizationId,
    actor,
    action: "webhook.created",
    targetType: "webhook",
    targetId: webhook.id,
    details: { name: webhook.name, url: webhook.url, events: input.events },
  });
  return { webhook: serializeWebhook(webhook), secret };
}

export async function updateWebhook(
  id: string,
  input: z.infer<typeof updateWebhookSchema>,
  actor: Actor,
) {
  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!existing) return null;
  if (input.url) await assertPublicTarget(input.url);
  const webhook = await prisma.webhook.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: JSON.stringify(input.events) } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  await recordAudit({
    organizationId: actor.organizationId,
    actor,
    action: "webhook.updated",
    targetType: "webhook",
    targetId: webhook.id,
    details: { name: webhook.name, changes: Object.keys(input) },
  });
  return serializeWebhook(webhook);
}

export async function deleteWebhook(id: string, actor: Actor) {
  const existing = await prisma.webhook.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!existing) return false;
  await prisma.webhook.delete({ where: { id } });
  await recordAudit({
    organizationId: actor.organizationId,
    actor,
    action: "webhook.deleted",
    targetType: "webhook",
    targetId: id,
    details: { name: existing.name, url: existing.url },
  });
  return true;
}

export type DeliveryResult = { ok: boolean; status: number; error?: string };

/** Delivers one payload to one webhook and records the outcome. Never throws. */
export async function deliverWebhook(
  webhook: { id: string; url: string; secret: string },
  event: WebhookEvent | "ping",
  organizationId: string,
  payload: unknown,
): Promise<DeliveryResult> {
  let result: DeliveryResult;
  try {
    await assertPublicTarget(webhook.url);
    const body = JSON.stringify({
      event,
      deliveryId: randomUUID(),
      timestamp: new Date().toISOString(),
      organizationId,
      data: payload,
    });
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "AMR-Hub-Webhooks/1.0",
        "X-AMR-Event": event,
        [SIGNATURE_HEADER]: signWebhookBody(body, webhook.secret),
      },
      body,
      // Redirects could bounce the request into a private network.
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    result = { ok: response.status >= 200 && response.status < 300, status: response.status };
  } catch (error) {
    const message =
      error instanceof WebhookTargetError
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? `No response within ${WEBHOOK_TIMEOUT_MS / 1000}s`
          : "The endpoint could not be reached";
    result = { ok: false, status: 0, error: message };
  }

  await prisma.webhook
    .update({
      where: { id: webhook.id },
      data: { lastStatus: result.status, lastDeliveredAt: new Date() },
    })
    .catch(() => undefined);
  return result;
}

/**
 * Fire-and-forget: delivers `payload` to every enabled webhook in the org that
 * subscribes to `event`. Returns immediately and never throws.
 */
export function dispatchWebhook(
  organizationId: string,
  event: WebhookEvent,
  payload: unknown,
): void {
  void (async () => {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: { organizationId, enabled: true },
        select: { id: true, url: true, secret: true, events: true },
      });
      await Promise.all(
        webhooks
          .filter((webhook) => parseWebhookEvents(webhook.events).includes(event))
          .map((webhook) => deliverWebhook(webhook, event, organizationId, payload)),
      );
    } catch (error) {
      console.error("Webhook dispatch failed", event, error);
    }
  })();
}

export async function sendTestWebhook(id: string, organizationId: string, actorName: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id, organizationId } });
  if (!webhook) return null;
  return deliverWebhook(webhook, "ping", organizationId, {
    message: "Test delivery from AMR Hub",
    triggeredBy: actorName,
    events: parseWebhookEvents(webhook.events),
  });
}
