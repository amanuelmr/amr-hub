"use client";

import { useEffect, useState, useSyncExternalStore, type DragEvent } from "react";
import {
  Columns3,
  GanttChart,
  List,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Rows3,
  Share2,
  Zap,
} from "lucide-react";
import { MockAvatar, MockTypeIcon, type MockKind } from "./mocks";

type Card = {
  key: string;
  title: string;
  label: string;
  kind: MockKind;
  who: string;
  tone: number;
  column: number;
};

const COLUMNS = ["To do", "In progress", "In review", "Done"];

const START: Card[] = [
  { key: "WEB-27", title: "Real-time order status for shoppers", label: "checkout", kind: "story", who: "MK", tone: 0, column: 0 },
  { key: "WEB-29", title: "Promo codes at checkout", label: "payments", kind: "task", who: "JO", tone: 1, column: 0 },
  { key: "WEB-31", title: "Guest checkout", label: "checkout", kind: "story", who: "SA", tone: 2, column: 1 },
  { key: "WEB-33", title: "Card number crashes on paste", label: "bug-bash", kind: "bug", who: "DL", tone: 3, column: 1 },
  { key: "WEB-35", title: "Delivery dates at checkout", label: "shipping", kind: "task", who: "MK", tone: 0, column: 2 },
  { key: "WEB-24", title: "Design confirmation page", label: "design", kind: "story", who: "JO", tone: 1, column: 3 },
];

/** The moves the demo plays, in order: [card, to column, who moves it]. */
const SCRIPT: [string, number, "Maya" | "Jon"][] = [
  ["WEB-35", 3, "Maya"],
  ["WEB-33", 2, "Jon"],
  ["WEB-27", 1, "Maya"],
  ["WEB-33", 3, "Jon"],
  ["WEB-29", 1, "Maya"],
  ["WEB-31", 2, "Jon"],
];

const STEP_MS = 2600;

const TABS = [
  { label: "Timeline", icon: GanttChart },
  { label: "Backlog", icon: Rows3 },
  { label: "Board", icon: Columns3 },
  { label: "List", icon: List },
];

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

/**
 * The large product demo under the hero: a project board where cards move on
 * their own while two teammates' cursors follow the work. Visitors can drag
 * cards, and pause or play the demo from the corner button.
 */
export function ProductDemo() {
  const reducedMotion = usePrefersReducedMotion();
  const [cards, setCards] = useState(START);
  const [step, setStep] = useState(0);
  // null follows the visitor's motion setting until they press play or pause.
  const [playChoice, setPlayChoice] = useState<boolean | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<number | null>(null);
  const playing = playChoice ?? !reducedMotion;

  const [lastKey, , mover] = SCRIPT[(step + SCRIPT.length - 1) % SCRIPT.length];
  const moved = step > 0 ? cards.find((card) => card.key === lastKey) : undefined;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const [key, column] = SCRIPT[step % SCRIPT.length];
      setCards((current) => {
        // When the script loops, start again from the opening board.
        const base = step > 0 && step % SCRIPT.length === 0 ? START : current;
        return base.map((card) => (card.key === key ? { ...card, column } : card));
      });
      setStep((current) => current + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const drop = (event: DragEvent<HTMLDivElement>, column: number) => {
    event.preventDefault();
    const key = event.dataTransfer.getData("text/plain") || dragKey;
    setCards((current) =>
      current.map((card) => (card.key === key ? { ...card, column } : card)),
    );
    setDragKey(null);
    setOverColumn(null);
  };

  const cursor = (name: "Maya" | "Jon", column: number, top: string) => (
    <span
      className={`lp-live-cursor lp-live-cursor-${name.toLowerCase()}`}
      style={{ left: `calc(${(column + 0.55) * 25}% - 6px)`, top }}
      aria-hidden="true"
    >
      <MousePointer2 size={18} />
      <span>{name}</span>
    </span>
  );

  return (
    <div className="lp-showcase">
      <div className="lp-app">
        <div className="lp-app-head">
          <span className="lp-app-project">
            <span className="lp-app-icon" aria-hidden="true">
              W
            </span>
            Web App
          </span>
          <span className="lp-app-actions" aria-hidden="true">
            <Share2 size={14} />
            <Zap size={14} />
          </span>
        </div>
        <div className="lp-app-tabs" aria-hidden="true">
          {TABS.map(({ label, icon: Icon }) => (
            <span key={label} className={label === "Board" ? "is-active" : undefined}>
              <Icon size={13} />
              {label}
            </span>
          ))}
          <span>
            <Plus size={13} />
          </span>
        </div>
        <div className="lp-app-board" role="group" aria-label="Demo board. Drag cards between columns.">
          {COLUMNS.map((name, column) => {
            const inColumn = cards.filter((card) => card.column === column);
            return (
              <div
                key={name}
                className={overColumn === column ? "lp-app-col is-over" : "lp-app-col"}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverColumn(column);
                }}
                onDragLeave={() => setOverColumn((current) => (current === column ? null : current))}
                onDrop={(event) => drop(event, column)}
              >
                <div className="lp-app-col-head">
                  <span>{name}</span>
                  <span className="lp-count">{inColumn.length}</span>
                </div>
                {inColumn.map((card) => (
                  <div
                    key={card.key}
                    className={[
                      "lp-app-card",
                      moved?.key === card.key && playing ? "is-moved" : "",
                      dragKey === card.key ? "is-dragging" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", card.key);
                      event.dataTransfer.effectAllowed = "move";
                      setDragKey(card.key);
                      setPlayChoice(false);
                    }}
                    onDragEnd={() => {
                      setDragKey(null);
                      setOverColumn(null);
                    }}
                  >
                    <span className="lp-app-card-title">{card.title}</span>
                    <span className="lp-app-card-label">{card.label}</span>
                    <span className="lp-app-card-meta">
                      <MockTypeIcon kind={card.kind} />
                      <span className={`lp-card-key${column === 3 ? " is-done" : ""}`}>{card.key}</span>
                      <MockAvatar initials={card.who} tone={card.tone} />
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          {playing && moved && cursor(mover, moved.column, "34%")}
          {playing && cursor(mover === "Maya" ? "Jon" : "Maya", (step + 1) % 4, "66%")}
        </div>
      </div>
      <button
        type="button"
        className="lp-showcase-toggle"
        aria-pressed={!playing}
        aria-label={playing ? "Pause the board demo" : "Play the board demo"}
        onClick={() => setPlayChoice(!playing)}
      >
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
    </div>
  );
}
