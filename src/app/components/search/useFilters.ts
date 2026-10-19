"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../IssueProvider";
import type { FilterShare, FilterSummary } from "../../data/filters";

export type FilterInput = {
  name: string;
  description: string | null;
  jql: string;
  viewers: FilterShare[];
  editors: FilterShare[];
};

/** Saved filters shared with the viewer, plus every filter action. */
export function useFilters() {
  const [filters, setFilters] = useState<FilterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setFilters(await apiRequest<FilterSummary[]>("/api/filters"));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Filters could not be loaded");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiRequest<FilterSummary[]>("/api/filters")
      .then((loaded) => !cancelled && setFilters(loaded))
      .catch(
        (loadError) =>
          !cancelled &&
          setError(loadError instanceof Error ? loadError.message : "Filters could not be loaded"),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const replace = (filter: FilterSummary) =>
    setFilters((current) => {
      const list = current ?? [];
      return list.some((item) => item.id === filter.id)
        ? list.map((item) => (item.id === filter.id ? filter : item))
        : [...list, filter].sort((a, b) => a.name.localeCompare(b.name));
    });

  const path = (id: string, suffix = "") => `/api/filters/${encodeURIComponent(id)}${suffix}`;

  const create = useCallback(async (input: FilterInput) => {
    const filter = await apiRequest<FilterSummary>("/api/filters", {
      method: "POST",
      body: JSON.stringify(input),
    });
    replace(filter);
    return filter;
  }, []);

  const update = useCallback(async (id: string, input: Partial<FilterInput>) => {
    const filter = await apiRequest<FilterSummary>(path(id), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    replace(filter);
    return filter;
  }, []);

  const remove = useCallback(async (id: string) => {
    await apiRequest<unknown>(path(id), { method: "DELETE" });
    setFilters((current) => current?.filter((filter) => filter.id !== id) ?? null);
  }, []);

  const setStar = useCallback(async (id: string, starred: boolean) => {
    replace(
      await apiRequest<FilterSummary>(path(id, "/star"), {
        method: starred ? "POST" : "DELETE",
      }),
    );
  }, []);

  const copy = useCallback(async (id: string) => {
    const filter = await apiRequest<FilterSummary>(path(id, "/copy"), { method: "POST" });
    replace(filter);
    return filter;
  }, []);

  const changeOwner = useCallback(async (id: string, userId: string) => {
    replace(
      await apiRequest<FilterSummary>(path(id, "/owner"), {
        method: "PATCH",
        body: JSON.stringify({ userId }),
      }),
    );
  }, []);

  return { filters, error, refresh, create, update, remove, setStar, copy, changeOwner };
}
