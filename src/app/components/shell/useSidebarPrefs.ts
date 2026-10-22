"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/** Sidebar items a person can reorder or hide. "For you" always stays first. */
export const SIDEBAR_ITEMS = [
  { key: "recent", label: "Recent" },
  { key: "starred", label: "Starred" },
  { key: "projects", label: "Projects" },
  { key: "filters", label: "Filters" },
  { key: "dashboards", label: "Dashboards" },
  { key: "roadmap", label: "Roadmap" },
  { key: "goals", label: "Goals" },
  { key: "people", label: "People" },
  { key: "teams", label: "Teams" },
  { key: "overview", label: "Overview" },
  { key: "issues", label: "Issues" },
  { key: "settings", label: "Workspace settings" },
] as const;

export type SidebarItemKey = (typeof SIDEBAR_ITEMS)[number]["key"];

export type SidebarPrefs = { order: SidebarItemKey[]; hidden: SidebarItemKey[] };

const KEYS = SIDEBAR_ITEMS.map((item) => item.key);
const STORAGE_KEY = "amr.sidebar";

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = { order: KEYS, hidden: [] };

const isKey = (value: unknown): value is SidebarItemKey =>
  typeof value === "string" && (KEYS as string[]).includes(value);

/** Keeps saved order valid: unknown keys dropped, new items appended. */
export function parseSidebarPrefs(raw: string | null): SidebarPrefs {
  if (!raw) return DEFAULT_SIDEBAR_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<SidebarPrefs>;
    const order = Array.isArray(value.order) ? [...new Set(value.order.filter(isKey))] : [];
    return {
      order: [...order, ...KEYS.filter((key) => !order.includes(key))],
      hidden: Array.isArray(value.hidden) ? value.hidden.filter(isKey) : [],
    };
  } catch {
    return DEFAULT_SIDEBAR_PREFS;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useSidebarPrefs() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const prefs = useMemo(() => parseSidebarPrefs(raw), [raw]);

  const save = useCallback((next: SidebarPrefs) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable; the sidebar keeps its default layout.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { prefs, save };
}
