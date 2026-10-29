/*
 * Decorative HTML/CSS mock-ups of the real AMR Hub views, used on the public
 * landing page. They are presentational only: every mock is wrapped in an
 * element with role="img" and an aria-label, so assistive tech reads one
 * description instead of the fake data inside.
 */
import type { ReactNode } from "react";
import {
  Bell,
  Bookmark,
  Bug,
  CircleHelp,
  Filter,
  House,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  SquareCheck,
  Target,
  Users,
  Zap,
} from "lucide-react";

export type MockKind = "story" | "task" | "bug" | "epic";

const KIND_ICON = {
  story: Bookmark,
  task: SquareCheck,
  bug: Bug,
  epic: Zap,
} as const;

export function MockTypeIcon({ kind }: { kind: MockKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={`lp-type lp-type-${kind}`}>
      <Icon size={11} strokeWidth={2.4} />
    </span>
  );
}

export function MockAvatar({ initials, tone = 0 }: { initials: string; tone?: number }) {
  return <span className={`lp-avatar lp-avatar-${tone % 4}`}>{initials}</span>;
}

/* ------------------------------------------------------------------ */
/* App window frame: top bar + sidebar of the actual workspace shell   */
/* ------------------------------------------------------------------ */

export function AppWindow({
  label,
  active = "Board",
  children,
}: {
  label: string;
  active?: string;
  children: ReactNode;
}) {
  return (
    <div className="lp-window" role="img" aria-label={label}>
      <div className="lp-window-chrome" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="lp-window-topbar" aria-hidden="true">
        <span className="lp-window-brand">
          <span className="lp-window-mark">A</span>AMR Hub
        </span>
        <span className="lp-window-search">
          <Search size={12} /> Search
        </span>
        <span className="lp-window-create">
          <Plus size={12} /> Create
        </span>
        <span className="lp-window-icons">
          <Bell size={13} />
          <CircleHelp size={13} />
          <Settings size={13} />
        </span>
      </div>
      <div className="lp-window-body" aria-hidden="true">
        <div className="lp-window-sidebar">
          <span className="lp-side-item">
            <House size={12} /> For you
          </span>
          <span className="lp-side-label">Projects</span>
          <span className="lp-side-item lp-side-project is-active">
            <span className="lp-side-dot" /> Website
          </span>
          <span className="lp-side-item lp-side-project">
            <span className="lp-side-dot lp-side-dot-alt" /> Mobile app
          </span>
          <span className="lp-side-item">
            <Filter size={12} /> Filters
          </span>
          <span className="lp-side-item">
            <LayoutDashboard size={12} /> Dashboards
          </span>
          <span className="lp-side-item">
            <Target size={12} /> Goals
          </span>
          <span className="lp-side-item">
            <Users size={12} /> Teams
          </span>
        </div>
        <div className="lp-window-main">
          <div className="lp-window-head">
            <span className="lp-window-crumb">Projects / Website</span>
            <div className="lp-window-tabs">
              {["Summary", "Backlog", "Board", "Timeline", "List", "Calendar", "Reports"].map(
                (tab) => (
                  <span key={tab} className={tab === active ? "is-active" : undefined}>
                    {tab}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="lp-window-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

type MockCard = {
  key: string;
  title: string;
  kind: MockKind;
  points: number;
  who: string;
  tone: number;
};

const BOARD_COLUMNS: { name: string; cards: MockCard[] }[] = [
  {
    name: "To do",
    cards: [
      { key: "WEB-42", title: "Add saved filter to sidebar", kind: "story", points: 3, who: "MK", tone: 0 },
      { key: "WEB-47", title: "Write release notes for 2.4", kind: "task", points: 1, who: "JO", tone: 1 },
    ],
  },
  {
    name: "In progress",
    cards: [
      { key: "WEB-38", title: "Checkout stalls after promo code", kind: "bug", points: 5, who: "SA", tone: 2 },
      { key: "WEB-40", title: "Onboarding checklist", kind: "story", points: 3, who: "MK", tone: 0 },
    ],
  },
  {
    name: "In review",
    cards: [
      { key: "WEB-35", title: "Rate-limit the public API", kind: "task", points: 2, who: "DL", tone: 3 },
    ],
  },
  {
    name: "Done",
    cards: [
      { key: "WEB-31", title: "Passkey sign-in", kind: "story", points: 8, who: "JO", tone: 1 },
      { key: "WEB-33", title: "Fix due-date timezone", kind: "bug", points: 2, who: "SA", tone: 2 },
    ],
  },
];

export function BoardMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lp-board${compact ? " lp-board-compact" : ""}`}>
      {BOARD_COLUMNS.map((column) => (
        <div className="lp-board-col" key={column.name}>
          <div className="lp-board-col-head">
            <span>{column.name}</span>
            <span className="lp-count">{column.cards.length}</span>
          </div>
          {column.cards.map((card) => (
            <div className="lp-card" key={card.key}>
              <span className="lp-card-title">{card.title}</span>
              <span className="lp-card-meta">
                <MockTypeIcon kind={card.kind} />
                <span className={`lp-card-key${column.name === "Done" ? " is-done" : ""}`}>
                  {card.key}
                </span>
                <span className="lp-points">{card.points}</span>
                <MockAvatar initials={card.who} tone={card.tone} />
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Backlog & sprints                                                   */
/* ------------------------------------------------------------------ */

const SPRINT_ROWS: MockCard[] = [
  { key: "WEB-38", title: "Checkout stalls after promo code", kind: "bug", points: 5, who: "SA", tone: 2 },
  { key: "WEB-40", title: "Onboarding checklist", kind: "story", points: 3, who: "MK", tone: 0 },
  { key: "WEB-35", title: "Rate-limit the public API", kind: "task", points: 2, who: "DL", tone: 3 },
];

const BACKLOG_ROWS: MockCard[] = [
  { key: "WEB-51", title: "Bulk change: move to sprint", kind: "story", points: 5, who: "JO", tone: 1 },
  { key: "WEB-52", title: "Webhook retries", kind: "task", points: 3, who: "DL", tone: 3 },
];

function BacklogRows({ rows }: { rows: MockCard[] }) {
  return (
    <div className="lp-rows">
      {rows.map((row) => (
        <div className="lp-row" key={row.key}>
          <MockTypeIcon kind={row.kind} />
          <span className="lp-card-key">{row.key}</span>
          <span className="lp-row-title">{row.title}</span>
          <span className="lp-points">{row.points}</span>
          <MockAvatar initials={row.who} tone={row.tone} />
        </div>
      ))}
    </div>
  );
}

export function BacklogMock() {
  return (
    <div className="lp-backlog">
      <div className="lp-sprint">
        <div className="lp-sprint-head">
          <strong>WEB Sprint 4</strong>
          <span className="lp-muted">Oct 13 – Oct 27 · 10 points</span>
          <span className="lp-chip lp-chip-lime">Complete sprint</span>
        </div>
        <BacklogRows rows={SPRINT_ROWS} />
      </div>
      <div className="lp-sprint">
        <div className="lp-sprint-head">
          <strong>Backlog</strong>
          <span className="lp-muted">2 work items</span>
          <span className="lp-chip">Create sprint</span>
        </div>
        <BacklogRows rows={BACKLOG_ROWS} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

const TIMELINE_ROWS = [
  { key: "WEB-12", title: "Self-serve onboarding", start: 0, span: 5, tone: "violet" },
  { key: "WEB-18", title: "Payments v2", start: 3, span: 6, tone: "cyan" },
  { key: "WEB-24", title: "Public API", start: 6, span: 5, tone: "orange" },
  { key: "WEB-29", title: "Account security", start: 1, span: 4, tone: "lime" },
];

export function TimelineMock() {
  return (
    <div className="lp-timeline">
      <div className="lp-timeline-scale">
        <span />
        {["Sep", "Oct", "Nov", "Dec"].map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
      {TIMELINE_ROWS.map((row) => (
        <div className="lp-timeline-row" key={row.key}>
          <span className="lp-timeline-label">
            <MockTypeIcon kind="epic" />
            <span>{row.title}</span>
          </span>
          <span className="lp-timeline-track">
            <span
              className={`lp-timeline-bar lp-tone-${row.tone}`}
              style={{ left: `${(row.start / 12) * 100}%`, width: `${(row.span / 12) * 100}%` }}
            />
          </span>
        </div>
      ))}
      <span className="lp-timeline-today" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

const LIST_ROWS = [
  { key: "WEB-38", title: "Checkout stalls after promo code", kind: "bug", status: "In progress", priority: "Urgent", who: "SA", tone: 2 },
  { key: "WEB-40", title: "Onboarding checklist", kind: "story", status: "In progress", priority: "High", who: "MK", tone: 0 },
  { key: "WEB-35", title: "Rate-limit the public API", kind: "task", status: "In review", priority: "Medium", who: "DL", tone: 3 },
  { key: "WEB-42", title: "Add saved filter to sidebar", kind: "story", status: "To do", priority: "Low", who: "MK", tone: 0 },
  { key: "WEB-31", title: "Passkey sign-in", kind: "story", status: "Done", priority: "High", who: "JO", tone: 1 },
] as const;

export function ListMock() {
  return (
    <div className="lp-list">
      <div className="lp-jql">
        <span className="lp-jql-tag">Query</span>
        <code>project = WEB AND status != Done ORDER BY priority DESC</code>
      </div>
      <div className="lp-table">
        <div className="lp-table-row lp-table-head">
          <span>Key</span>
          <span>Summary</span>
          <span>Status</span>
          <span className="lp-hide-sm">Priority</span>
          <span>Assignee</span>
        </div>
        {LIST_ROWS.map((row) => (
          <div className="lp-table-row" key={row.key}>
            <span className="lp-table-key">
              <MockTypeIcon kind={row.kind} />
              {row.key}
            </span>
            <span className="lp-row-title">{row.title}</span>
            <span>
              <span className={`lp-status lp-status-${row.status.replace(/\s+/g, "-").toLowerCase()}`}>
                {row.status}
              </span>
            </span>
            <span className="lp-hide-sm lp-muted">{row.priority}</span>
            <span>
              <MockAvatar initials={row.who} tone={row.tone} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export function ReportsMock() {
  return (
    <div className="lp-reports">
      <div className="lp-report-card lp-report-wide">
        <div className="lp-report-title">
          <strong>Burndown chart</strong>
          <span className="lp-muted">WEB Sprint 4</span>
        </div>
        <svg viewBox="0 0 300 120" className="lp-chart" preserveAspectRatio="none">
          {[20, 50, 80].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} className="lp-chart-grid" />
          ))}
          <line x1="0" y1="10" x2="300" y2="110" className="lp-chart-guide" />
          <polyline
            points="0,10 40,10 60,28 100,34 130,52 170,58 200,70 230,86"
            className="lp-chart-line"
          />
        </svg>
        <div className="lp-legend">
          <span><i className="lp-legend-line" /> Remaining</span>
          <span><i className="lp-legend-dash" /> Guideline</span>
        </div>
      </div>
      <div className="lp-report-card">
        <div className="lp-report-title">
          <strong>Velocity</strong>
        </div>
        <div className="lp-bars">
          {[
            [18, 16],
            [22, 21],
            [20, 14],
            [24, 23],
          ].map(([commit, done], index) => (
            <span className="lp-bar-pair" key={index}>
              <span className="lp-bar lp-bar-commit" style={{ height: `${commit * 3.4}%` }} />
              <span className="lp-bar lp-bar-done" style={{ height: `${done * 3.4}%` }} />
            </span>
          ))}
        </div>
      </div>
      <div className="lp-report-card">
        <div className="lp-report-title">
          <strong>Cumulative flow</strong>
        </div>
        <svg viewBox="0 0 120 80" className="lp-chart lp-chart-small" preserveAspectRatio="none">
          <polygon points="0,80 0,60 40,52 80,40 120,30 120,80" className="lp-area-done" />
          <polygon points="0,60 40,52 80,40 120,30 120,18 80,26 40,38 0,46" className="lp-area-progress" />
          <polygon points="0,46 40,38 80,26 120,18 120,6 80,12 40,22 0,30" className="lp-area-todo" />
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

const CALENDAR_ITEMS: Record<number, { key: string; kind: MockKind }[]> = {
  3: [{ key: "WEB-31", kind: "story" }],
  8: [{ key: "WEB-35", kind: "task" }],
  14: [
    { key: "WEB-38", kind: "bug" },
    { key: "WEB-40", kind: "story" },
  ],
  21: [{ key: "WEB-42", kind: "story" }],
  27: [{ key: "WEB-47", kind: "task" }],
};

export function CalendarMock() {
  const days = Array.from({ length: 35 }, (_, index) => index - 2);
  return (
    <div className="lp-calendar">
      <div className="lp-calendar-head">
        <strong>October</strong>
        <span className="lp-chip">Today</span>
      </div>
      <div className="lp-calendar-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day} className="lp-calendar-dow">
            {day}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day >= 1 && day <= 31;
          return (
            <span
              key={day}
              className={`lp-calendar-day${inMonth ? "" : " is-out"}${day === 17 ? " is-today" : ""}`}
            >
              <span className="lp-calendar-num">{inMonth ? day : ""}</span>
              {inMonth &&
                CALENDAR_ITEMS[day]?.map((item) => (
                  <span className="lp-calendar-item" key={item.key}>
                    <MockTypeIcon kind={item.kind} />
                    <span>{item.key}</span>
                  </span>
                ))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
