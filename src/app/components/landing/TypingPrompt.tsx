"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const PHRASES = [
  "plan the next sprint",
  "assignee = currentUser() AND status != Done",
  "move WEB-33 to In review",
  "show the burndown",
  "release 2.4",
];

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** The dark band's terminal: phrases type and erase themselves in a loop. */
export function TypingPrompt({ title }: { title: string }) {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  const [phrase, setPhrase] = useState(0);
  const [length, setLength] = useState(0);
  const [erasing, setErasing] = useState(false);
  const text = PHRASES[phrase];

  useEffect(() => {
    if (reducedMotion) return;
    let delay = erasing ? 22 : 55;
    if (!erasing && length === text.length) delay = 1600;
    if (erasing && length === 0) delay = 300;
    const timer = window.setTimeout(() => {
      if (!erasing && length === text.length) setErasing(true);
      else if (erasing && length === 0) {
        setErasing(false);
        setPhrase((current) => (current + 1) % PHRASES.length);
      } else setLength((current) => current + (erasing ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [erasing, length, reducedMotion, text.length]);

  return (
    <div className="lp-terminal">
      <p className="lp-terminal-title">{title}</p>
      <p className="lp-terminal-line" aria-label={`For example: ${PHRASES.join(", ")}`}>
        <span aria-hidden="true">&gt; </span>
        <span aria-hidden="true">{reducedMotion ? PHRASES[0] : text.slice(0, length)}</span>
        <span className="lp-terminal-cursor" aria-hidden="true" />
      </p>
    </div>
  );
}
