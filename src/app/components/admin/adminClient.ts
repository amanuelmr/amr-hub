"use client";

import { authClient } from "../../../lib/auth-client";

export class AdminRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string[] | undefined> = {},
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

/** JSON fetch for the admin APIs; throws AdminRequestError with the server's message. */
export async function adminRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fields = (data?.fields ?? {}) as Record<string, string[] | undefined>;
    const firstField = Object.values(fields).find((messages) => messages?.length)?.[0];
    throw new AdminRequestError(
      firstField ?? data?.error ?? `Request failed (${response.status})`,
      response.status,
      fields,
    );
  }
  return data as T;
}

export function useAdminRole() {
  const { data: activeMember, isPending } = authClient.useActiveMember();
  return {
    isLoading: isPending,
    role: activeMember?.role ?? null,
    userId: activeMember?.userId ?? null,
    isOwner: activeMember?.role === "owner",
    isViewer: activeMember?.role === "viewer",
  };
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDateTime(value: string | null | undefined) {
  return value ? dateTime.format(new Date(value)) : "—";
}

export function formatDate(value: string | null | undefined) {
  return value ? dateOnly.format(new Date(value)) : "—";
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "Never";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
