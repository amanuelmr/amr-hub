/** Per-viewer dashboard layout: which gadgets are collapsed to their title. */
export type DashboardView = { minimized: string[] };

export const DEFAULT_DASHBOARD_VIEW: DashboardView = { minimized: [] };

export function parseDashboardView(raw: string | null): DashboardView {
  if (!raw) return DEFAULT_DASHBOARD_VIEW;
  try {
    const value = JSON.parse(raw) as Partial<DashboardView>;
    return {
      minimized: Array.isArray(value.minimized)
        ? value.minimized.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return DEFAULT_DASHBOARD_VIEW;
  }
}

export function toggleMinimized(view: DashboardView, gadgetId: string): DashboardView {
  return {
    minimized: view.minimized.includes(gadgetId)
      ? view.minimized.filter((id) => id !== gadgetId)
      : [...view.minimized, gadgetId],
  };
}

/** Seconds each gadget stays on screen in the wallboard slideshow. */
export const SLIDE_INTERVALS = [10, 15, 30, 60] as const;

/** The next slide in either direction, wrapping around. */
export function stepSlide(index: number, total: number, direction: 1 | -1) {
  if (total <= 0) return 0;
  return (index + direction + total) % total;
}
