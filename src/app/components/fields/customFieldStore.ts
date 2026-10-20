"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { CustomFieldDefinition } from "../../data/customFields";
import type { WorkspaceMember } from "../../data/issues";
import { registerJqlCustomFields } from "../../data/jql";

/*
 * Browser-wide cache of the workspace's custom field definitions (and the
 * member list user-picker values need). Loaded once on first use and reloaded
 * after field settings change. Also feeds client-side JQL and the column
 * registry so the navigator understands custom fields.
 */

type Snapshot = {
  fields: CustomFieldDefinition[];
  members: WorkspaceMember[];
  status: "idle" | "loading" | "ready" | "error";
};

let snapshot: Snapshot = { fields: [], members: [], status: "idle" };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: Snapshot) {
  snapshot = next;
  registerJqlCustomFields(next.fields);
  for (const listener of listeners) listener();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

export function loadCustomFields(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight) return inflight;
  if (!force && snapshot.status === "ready") return Promise.resolve();
  if (snapshot.status === "idle") emit({ ...snapshot, status: "loading" });
  inflight = Promise.all([
    fetchJson<CustomFieldDefinition[]>("/api/custom-fields"),
    fetchJson<WorkspaceMember[]>("/api/members").catch(() => snapshot.members),
  ])
    .then(([fields, members]) => emit({ fields, members, status: "ready" }))
    .catch(() => emit({ ...snapshot, status: snapshot.fields.length ? "ready" : "error" }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Re-fetch after creating, editing, reordering or deleting fields. */
export function reloadCustomFields() {
  return loadCustomFields(true);
}

export function subscribeCustomFields(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCustomFieldSnapshot() {
  return snapshot;
}

const serverSnapshot: Snapshot = { fields: [], members: [], status: "idle" };

/** All workspace custom fields; triggers the first load. */
export function useCustomFields() {
  const current = useSyncExternalStore(
    subscribeCustomFields,
    getCustomFieldSnapshot,
    () => serverSnapshot,
  );
  useEffect(() => {
    void loadCustomFields();
  }, []);
  return current;
}
