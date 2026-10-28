"use client";

import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** A horizontal card row with previous and next buttons. */
export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) =>
    track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="lp-carousel">
      <div className="lp-carousel-controls">
        <button type="button" aria-label={`Previous ${label}`} onClick={() => scroll(-1)}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Next ${label}`} onClick={() => scroll(1)}>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="lp-carousel-track" ref={track} role="list" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
