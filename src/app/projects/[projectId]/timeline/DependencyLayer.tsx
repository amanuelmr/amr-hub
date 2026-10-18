"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import type { Dependency } from "../../../../server/dependencies";
type Span = { start: string; end: string };

type Arrow = {
  key: string;
  path: string;
  conflict: boolean;
  label: string;
};

/** A blocker that ends after the blocked item starts is a scheduling conflict. */
export function isDependencyConflict(blocker: Span, blocked: Span) {
  return blocker.end > blocked.start;
}

function arrowPath(x1: number, y1: number, x2: number, y2: number) {
  const reach = Math.max(18, Math.min(60, Math.abs(x2 - x1) / 2));
  return `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`;
}

/**
 * Jira Plans-style dependency arrows: an SVG layer over the timeline grid
 * that connects the end of each blocker's bar to the start of the work it
 * blocks. Bars are measured after layout, so zoom, scroll and drag previews
 * stay in sync without duplicating the bar geometry maths.
 */
export function DependencyLayer({
  gridRef,
  dependencies,
  spans,
  version,
}: {
  gridRef: RefObject<HTMLDivElement | null>;
  dependencies: Dependency[];
  spans: Map<string, Span>;
  /** Changes whenever bars may have moved (rows, zoom, drag preview). */
  version: string;
}) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const origin = grid.getBoundingClientRect();
      const barRect = (id: string) => {
        const bar = grid.querySelector<HTMLElement>(
          `[data-bar-id="${CSS.escape(id)}"]`,
        );
        return bar?.getBoundingClientRect() ?? null;
      };
      const next: Arrow[] = [];
      for (const dependency of dependencies) {
        const from = barRect(dependency.blockerId);
        const to = barRect(dependency.blockedId);
        const fromSpan = spans.get(dependency.blockerId);
        const toSpan = spans.get(dependency.blockedId);
        if (!from || !to || !fromSpan || !toSpan) continue;
        next.push({
          key: `${dependency.blockerId}->${dependency.blockedId}`,
          path: arrowPath(
            from.right - origin.left,
            from.top + from.height / 2 - origin.top,
            to.left - origin.left,
            to.top + to.height / 2 - origin.top,
          ),
          conflict: isDependencyConflict(fromSpan, toSpan),
          label: `${dependency.blockerId} blocks ${dependency.blockedId}`,
        });
      }
      setArrows(next);
      setSize({ width: grid.scrollWidth, height: grid.scrollHeight });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [gridRef, dependencies, spans, version]);

  if (arrows.length === 0) return null;

  return (
    <svg
      className="timeline-dependencies"
      width={size.width}
      height={size.height}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="timeline-dep-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" className="timeline-dep-head" />
        </marker>
        <marker
          id="timeline-dep-arrow-conflict"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" className="timeline-dep-head conflict" />
        </marker>
      </defs>
      {arrows.map((arrow) => (
        <path
          key={arrow.key}
          d={arrow.path}
          className={arrow.conflict ? "timeline-dep conflict" : "timeline-dep"}
          markerEnd={`url(#${arrow.conflict ? "timeline-dep-arrow-conflict" : "timeline-dep-arrow"})`}
        >
          <title>{arrow.conflict ? `${arrow.label} (dates overlap)` : arrow.label}</title>
        </path>
      ))}
    </svg>
  );
}
