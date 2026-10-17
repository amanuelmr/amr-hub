"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "amr-hub:recent-projects";
const MAX_RECENT = 6;

function read(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Jira's "Recent" flyout lists projects the user visited lately. There is no
 * server history for project visits, so the order is remembered per browser.
 */
export function useRecentProjectIds(currentProjectId: string | null) {
  const [ids, setIds] = useState<string[]>([]);

  const record = useCallback((projectId: string) => {
    const next = [projectId, ...read().filter((id) => id !== projectId)].slice(0, MAX_RECENT);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the list just stays in memory.
    }
    return next;
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      setIds(currentProjectId ? record(currentProjectId) : read());
    });
  }, [currentProjectId, record]);

  return ids;
}
