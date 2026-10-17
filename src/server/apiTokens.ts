import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import prisma from "../../prisma/client";
import { recordAudit } from "./audit";

export const API_TOKEN_PREFIX = "amr_";
export const API_TOKEN_EXPIRY_OPTIONS = ["30", "90", "365", "never"] as const;
export type ApiTokenExpiry = (typeof API_TOKEN_EXPIRY_OPTIONS)[number];

export const createApiTokenSchema = z
  .object({
    name: z.string().trim().min(1, "Give the token a name").max(80),
    expiry: z.enum(API_TOKEN_EXPIRY_OPTIONS),
  })
  .strict();

/** A fresh token: "amr_" + 32 random bytes as base64url. */
export function generateApiToken() {
  return `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function looksLikeApiToken(value: string) {
  return /^amr_[A-Za-z0-9_-]{43}$/.test(value);
}

export function expiryDate(expiry: ApiTokenExpiry, now = new Date()) {
  if (expiry === "never") return null;
  return new Date(now.getTime() + Number(expiry) * 24 * 60 * 60 * 1000);
}

/** Pulls the token out of an `Authorization: Bearer amr_...` header. */
export function bearerToken(header: string | null) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

export type ApiTokenSummary = {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  expired: boolean;
  owner: { id: string; name: string; email: string };
};

export async function listApiTokens(
  organizationId: string,
  options: { userId: string; includeAll: boolean },
): Promise<ApiTokenSummary[]> {
  const tokens = await prisma.apiToken.findMany({
    where: {
      organizationId,
      ...(options.includeAll ? {} : { userId: options.userId }),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  return tokens.map((token) => ({
    id: token.id,
    name: token.name,
    createdAt: token.createdAt.toISOString(),
    expiresAt: token.expiresAt?.toISOString() ?? null,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expired: token.expiresAt ? token.expiresAt.getTime() <= now : false,
    owner: token.user,
  }));
}

export async function createApiToken(
  input: z.infer<typeof createApiTokenSchema>,
  actor: { id: string; name: string; organizationId: string },
) {
  const token = generateApiToken();
  const created = await prisma.apiToken.create({
    data: {
      name: input.name,
      tokenHash: hashApiToken(token),
      expiresAt: expiryDate(input.expiry),
      userId: actor.id,
      organizationId: actor.organizationId,
    },
  });
  await recordAudit({
    organizationId: actor.organizationId,
    actor,
    action: "api_token.created",
    targetType: "api_token",
    targetId: created.id,
    details: { name: created.name, expiresAt: created.expiresAt?.toISOString() ?? null },
  });
  return {
    token,
    id: created.id,
    name: created.name,
    expiresAt: created.expiresAt?.toISOString() ?? null,
  };
}

/** Owners can revoke any token in the org; everyone else only their own. */
export async function revokeApiToken(
  id: string,
  actor: { id: string; name: string; organizationId: string },
  isOwner: boolean,
) {
  const token = await prisma.apiToken.findFirst({
    where: {
      id,
      organizationId: actor.organizationId,
      ...(isOwner ? {} : { userId: actor.id }),
    },
  });
  if (!token) return false;
  await prisma.apiToken.delete({ where: { id: token.id } });
  await recordAudit({
    organizationId: actor.organizationId,
    actor,
    action: "api_token.revoked",
    targetType: "api_token",
    targetId: token.id,
    details: { name: token.name, ownerId: token.userId },
  });
  return true;
}

export type ApiTokenPrincipal = {
  tokenId: string;
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; key: string; slug: string };
  role: string;
};

/**
 * Resolves a raw bearer token to the user + org it acts for. Returns null for
 * unknown/expired tokens or when the user is no longer a member of the org.
 */
export async function resolveApiToken(raw: string): Promise<ApiTokenPrincipal | null> {
  if (!looksLikeApiToken(raw)) return null;
  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(raw) },
    include: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, key: true, slug: true } },
    },
  });
  if (!token) return null;
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

  const membership = await prisma.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: token.organizationId,
        userId: token.userId,
      },
    },
    select: { role: true },
  });
  if (!membership) return null;

  // Throttle lastUsedAt writes to once a minute per token.
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    tokenId: token.id,
    user: token.user,
    organization: token.organization,
    role: membership.role,
  };
}
