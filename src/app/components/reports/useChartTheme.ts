"use client";

import { useEffect, useState } from "react";
import { statusCategory } from "../../data/workflow";

export type ChartTheme = {
  ink: string;
  muted: string;
  grid: string;
  surface: string;
  /** Fixed-order categorical hues; never cycle past the end (fold into "Other"). */
  series: string[];
  /** Built-in status colors; use statusColor() for any (custom) status. */
  status: Record<string, string>;
  good: string;
  warning: string;
  critical: string;
  font: string;
};

const FALLBACK: ChartTheme = {
  ink: "#17182a",
  muted: "#66625d",
  grid: "#d8cfb8",
  surface: "#fffdf4",
  series: [
    "#197f88",
    "#e88631",
    "#987dff",
    "#668d22",
    "#e94f75",
    "#b75c19",
    "#ff7898",
    "#8c867a",
  ],
  status: {
    BACKLOG: "#b9af98",
    OPEN: "#8c867a",
    IN_PROGRESS: "#39c6d0",
    IN_REVIEW: "#987dff",
    DONE: "#8fbe35",
  },
  good: "#8fbe35",
  warning: "#e88631",
  critical: "#e94f75",
  font: "SFMono-Regular, Consolas, monospace",
};

function isDark() {
  const attribute = document.documentElement.getAttribute("data-theme");
  if (attribute === "dark") return true;
  if (attribute === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readTheme(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const dark = isDark();
  const blue = token(dark ? "--blue-500" : "--blue-600", FALLBACK.series[0]);

  return {
    ink: token("--ink", FALLBACK.ink),
    muted: token("--gray-500", FALLBACK.muted),
    grid: token(dark ? "--gray-200" : "--gray-200", FALLBACK.grid),
    surface: token("--surface", FALLBACK.surface),
    series: [
      blue,
      token("--amber-500", FALLBACK.series[1]),
      token("--console-violet", FALLBACK.series[2]),
      token(dark ? "--green-400" : "--green-600", FALLBACK.series[3]),
      token("--red-500", FALLBACK.series[4]),
      token(dark ? "--console-orange" : "--amber-600", FALLBACK.series[5]),
      token("--console-pink", FALLBACK.series[6]),
      token("--gray-400", FALLBACK.series[7]),
    ],
    status: {
      BACKLOG: token("--gray-300", FALLBACK.status.BACKLOG),
      OPEN: token("--gray-400", FALLBACK.status.OPEN),
      IN_PROGRESS: token("--blue-500", FALLBACK.status.IN_PROGRESS),
      IN_REVIEW: token("--console-violet", FALLBACK.status.IN_REVIEW),
      DONE: token("--green-500", FALLBACK.status.DONE),
    },
    good: token("--green-500", FALLBACK.good),
    warning: token("--amber-500", FALLBACK.warning),
    critical: token("--red-500", FALLBACK.critical),
    font: token("--font-mono", FALLBACK.font),
  };
}

/** Chart colors from the live theme tokens; re-reads when light/dark flips. */
export function useChartTheme() {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    const update = () => setTheme(readTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  return theme;
}

/** Chart color for a status: configured color, built-in color, or its category's. */
export function statusColor(
  theme: ChartTheme,
  key: string,
  configured?: string | null,
) {
  if (configured) return configured;
  if (theme.status[key]) return theme.status[key];
  const category = statusCategory(key);
  return category === "DONE"
    ? theme.status.DONE
    : category === "IN_PROGRESS"
      ? theme.status.IN_PROGRESS
      : theme.status.OPEN;
}

export function seriesColor(theme: ChartTheme, index: number) {
  return theme.series[Math.min(index, theme.series.length - 1)];
}
