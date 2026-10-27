"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, LayoutGrid, Pause, Play, Presentation, X } from "lucide-react";
import { GadgetBody } from "./Gadgets";
import { gadgetTitle, type Gadget } from "./gadgetMeta";
import { SLIDE_INTERVALS, stepSlide } from "./dashboardView";

/** One gadget shown at full size, from its Maximize button. */
export function MaximizedGadget({ gadget, onClose }: { gadget: Gadget; onClose: () => void }) {
  const title = gadgetTitle(gadget);
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="gadget-maximized" aria-describedby={undefined}>
          <header className="gadget-maximized-header">
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Restore size" title="Restore">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <div className="gadget-maximized-body">
            <GadgetBody gadget={gadget} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Wallboard: the dashboard on a big screen, as a grid or a slideshow that
 * rotates through gadgets. Esc or the close button leaves it.
 */
export function Wallboard({
  name,
  gadgets,
  onExit,
}: {
  name: string;
  gadgets: Gadget[];
  onExit: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"grid" | "slideshow">("grid");
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState<(typeof SLIDE_INTERVALS)[number]>(15);
  const [isPaused, setIsPaused] = useState(false);
  const slide = gadgets[Math.min(index, gadgets.length - 1)];

  // Fill the screen when the browser allows it; leaving full screen exits.
  useEffect(() => {
    const root = rootRef.current;
    if (root?.requestFullscreen) void root.requestFullscreen().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) onExit();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onExit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
      if (mode !== "slideshow") return;
      if (event.key === "ArrowRight") setIndex((current) => stepSlide(current, gadgets.length, 1));
      if (event.key === "ArrowLeft") setIndex((current) => stepSlide(current, gadgets.length, -1));
      if (event.key === " ") {
        event.preventDefault();
        setIsPaused((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, gadgets.length, onExit]);

  useEffect(() => {
    if (mode !== "slideshow" || isPaused || gadgets.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => stepSlide(current, gadgets.length, 1)),
      seconds * 1000,
    );
    return () => window.clearInterval(timer);
  }, [mode, isPaused, seconds, gadgets.length]);

  return (
    <div ref={rootRef} className="wallboard" role="dialog" aria-modal="true" aria-label={`${name} wallboard`}>
      <header className="wallboard-bar">
        <h1>{name}</h1>
        {mode === "slideshow" && slide && (
          <span className="wallboard-position">
            {index + 1} / {gadgets.length} · {gadgetTitle(slide)}
          </span>
        )}
        <div className="wallboard-controls">
          {mode === "slideshow" && (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Previous gadget"
                onClick={() => setIndex((current) => stepSlide(current, gadgets.length, -1))}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={isPaused ? "Play slideshow" : "Pause slideshow"}
                onClick={() => setIsPaused((current) => !current)}
              >
                {isPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Next gadget"
                onClick={() => setIndex((current) => stepSlide(current, gadgets.length, 1))}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <label className="wallboard-interval">
                <span className="sr-only">Seconds per gadget</span>
                <select
                  value={seconds}
                  onChange={(event) =>
                    setSeconds(Number(event.target.value) as (typeof SLIDE_INTERVALS)[number])
                  }
                >
                  {SLIDE_INTERVALS.map((value) => (
                    <option key={value} value={value}>
                      Every {value}s
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button
            type="button"
            className="secondary-button jira-compact-button"
            onClick={() => setMode((current) => (current === "grid" ? "slideshow" : "grid"))}
          >
            {mode === "grid" ? (
              <>
                <Presentation size={15} aria-hidden="true" /> Slideshow
              </>
            ) : (
              <>
                <LayoutGrid size={15} aria-hidden="true" /> Grid
              </>
            )}
          </button>
          <button type="button" className="icon-button" aria-label="Exit wallboard" onClick={onExit}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {gadgets.length === 0 ? (
        <p className="wallboard-empty">This dashboard has no gadgets yet.</p>
      ) : mode === "grid" ? (
        <div className="wallboard-grid">
          {gadgets.map((gadget) => (
            <section key={gadget.id} className="panel wallboard-gadget" aria-label={gadgetTitle(gadget)}>
              <h2>{gadgetTitle(gadget)}</h2>
              <div className="gadget-body">
                <GadgetBody gadget={gadget} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        slide && (
          <section key={slide.id} className="panel wallboard-slide" aria-live="polite">
            <h2>{gadgetTitle(slide)}</h2>
            <div className="gadget-body">
              <GadgetBody gadget={slide} />
            </div>
          </section>
        )
      )}
    </div>
  );
}
