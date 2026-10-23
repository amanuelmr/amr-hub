"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Per-viewer view settings kept in this browser. `parse` turns the stored
 * string (or null) into a complete value, so bad or old data falls back to
 * defaults instead of breaking the page.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredPrefs<T>(key: string, parse: (raw: string | null) => T) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = useMemo(() => parse(raw), [parse, raw]);

  const update = useCallback(
    (change: (current: T) => T) => {
      const next = change(parse(read(key)));
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage can be unavailable; the view keeps its defaults.
      }
      listeners.forEach((listener) => listener());
    },
    [key, parse],
  );

  return { value, update };
}

/** Reads a JSON object, or {} when missing or invalid. */
export function readJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
