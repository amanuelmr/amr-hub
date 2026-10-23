import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChartLine,
  ClipboardList,
  Columns3,
  Inbox,
  KeyRound,
  Rocket,
  Search,
  Target,
  Workflow,
} from "lucide-react";
import { LandingNav } from "./components/landing/LandingNav";
import { ProductDemo } from "./components/landing/ProductDemo";
import { TypingPrompt } from "./components/landing/TypingPrompt";
import { Carousel } from "./components/landing/Carousel";
import { AppWindow, BoardMock, MockAvatar, ReportsMock } from "./components/landing/mocks";

export const metadata: Metadata = {
  title: {
    absolute: "AMR Hub | Plan, track and ship work as a team",
  },
  description:
    "Free work management for software teams: boards, backlogs and sprints, timelines, JQL search, automation, dashboards and reports.",
};

/* Section content. The layout follows Jira's product page; the words are ours. */

const WORKS_WITH = ["Jira CSV import", "REST API", "Webhooks", "Email", "Passkeys"];

const FLOW = [
  {
    icon: Inbox,
    title: "Capture",
    body: "Collect requests through forms, import from Jira, or create work from anywhere with C.",
  },
  {
    icon: ClipboardList,
    title: "Plan",
    body: "Rank the backlog, estimate, and pull the top of it into a sprint with a goal.",
  },
  {
    icon: Columns3,
    title: "Track",
    body: "Move cards across the board, filter by anyone, and see what's stuck at a glance.",
  },
  {
    icon: Rocket,
    title: "Ship",
    body: "Release a version, publish the notes, and review the sprint report together.",
  },
];

const MORE = [
  {
    tone: "cyan",
    title: "Search the way you think",
    body: "JQL with autocomplete, saved filters you can share, and email subscriptions.",
    link: "Try JQL",
    visual: "jql",
  },
  {
    tone: "ink",
    title: "Let rules do the busywork",
    body: "When, if and then automation with smart values, schedules and a run log.",
    link: "See automation",
    visual: "rules",
  },
  {
    tone: "lime",
    title: "Dashboards that keep up",
    body: "Gadgets for burndown, created vs resolved, workload and your own filters.",
    link: "Build a dashboard",
    visual: "gadgets",
  },
];

const STATS = [
  { value: "Free", body: "for every team, with no seat limit and no credit card" },
  { value: "12", body: "built-in reports, from burndown to control charts" },
  { value: "2", body: "templates to start from: Scrum and Kanban" },
];

const TEAMS = [
  {
    tone: "cyan",
    initials: "EN",
    team: "Engineering teams",
    body: "Run two-week sprints, track bugs with priorities and environments, and ship releases with notes generated from the work in them.",
  },
  {
    tone: "lime",
    initials: "PM",
    team: "Product managers",
    body: "Plan epics on the timeline, link work to goals, and share dashboards so stakeholders stop asking for status updates.",
  },
  {
    tone: "orange",
    initials: "OP",
    team: "Support and ops",
    body: "Take requests through forms, work them on a Kanban board with WIP limits, and watch cycle time on the control chart.",
  },
  {
    tone: "pink",
    initials: "AG",
    team: "Agencies",
    body: "Give each client a project with its own access, keep private work private, and share a read-only dashboard.",
  },
];

const LATEST = [
  { tone: "cyan", tag: "Release", title: "A Filter panel, column menus and days in column on the board", cta: "Try it" },
  { tone: "ink", tag: "Release", title: "Share filters and dashboards with viewers and editors", cta: "Try it" },
  { tone: "orange", tag: "Guide", title: "Move from Jira in three steps with a CSV export", cta: "Read the guide" },
  { tone: "lime", tag: "Guide", title: "JQL cheat sheet: ten queries every team uses", cta: "Read the guide" },
  { tone: "pink", tag: "Guide", title: "Five automation rules to set up on day one", cta: "Read the guide" },
];

const SUITE = [
  { icon: Columns3, label: "Projects" },
  { icon: Target, label: "Goals" },
  { icon: ChartLine, label: "Dashboards" },
  { icon: Workflow, label: "Automation" },
];

function MoreVisual({ kind }: { kind: string }) {
  if (kind === "jql") {
    return (
      <div className="lp-more-jql" aria-hidden="true">
        <p>
          <span className="lp-jql-field">assignee</span> = <span className="lp-jql-fn">currentUser()</span>{" "}
          <span className="lp-jql-kw">AND</span> <span className="lp-jql-field">status</span> != Done
        </p>
        <ul>
          <li>currentUser()</li>
          <li>EMPTY</li>
          <li>membersOf()</li>
        </ul>
        <span className="lp-more-jql-count">
          <Search size={12} /> 3 work items
        </span>
      </div>
    );
  }
  if (kind === "rules") {
    return (
      <ol className="lp-more-rules" aria-hidden="true">
        <li>
          <b className="lp-rule-when">When</b> moved to Done
        </li>
        <li>
          <b className="lp-rule-if">If</b> type is Bug
        </li>
        <li>
          <b className="lp-rule-then">Then</b> notify reporter
        </li>
      </ol>
    );
  }
  return (
    <div className="lp-more-gadgets" aria-hidden="true">
      <span style={{ height: "70%" }} />
      <span style={{ height: "52%" }} />
      <span style={{ height: "40%" }} />
      <span style={{ height: "28%" }} />
      <span style={{ height: "12%" }} />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <LandingNav />

      <main id="main">
        {/* Hero: headline on the left, sign-up on the right. */}
        <section className="lp-hero">
          <div className="lp-container lp-hero-inner">
            <div className="lp-hero-copy">
              <h1>Turn plans into shipped work</h1>
              <p className="lp-lede">
                AMR Hub gives software teams one place to plan sprints, track every work item
                and see what shipped, from the first idea to the release notes.
              </p>
            </div>
            <form className="lp-hero-form" action="/signup" method="get">
              <label htmlFor="hero-email">Work email</label>
              <input
                id="hero-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
              <p className="lp-hero-form-note">Use your work email so teammates can find you.</p>
              <button className="primary-button lp-btn lp-btn-lg" type="submit">
                Sign up
              </button>
              <p className="lp-hero-form-or">Or continue with</p>
              <Link className="secondary-button lp-btn lp-btn-lg" href="/login">
                <KeyRound size={16} aria-hidden="true" /> A passkey
              </Link>
            </form>
          </div>
          <div className="lp-container" id="product">
            <ProductDemo />
          </div>
        </section>

        {/* Proof strip. */}
        <section className="lp-proof" aria-label="What's included">
          <div className="lp-container">
            <p>Everything a software team needs, free for every team</p>
            <ul className="lp-proof-list">
              <li>Scrum</li>
              <li>Kanban</li>
              <li>JQL</li>
              <li>Timeline</li>
              <li>Automation</li>
              <li>Dashboards</li>
              <li>REST API</li>
            </ul>
          </div>
        </section>

        {/* Dark band: terminal, works with, four steps. */}
        <section className="lp-dark" id="workflow" aria-labelledby="flow-title">
          <div className="lp-container">
            <h2 id="flow-title" className="sr-only">
              How work moves through AMR Hub
            </h2>
            <TypingPrompt title="AMR Hub for software teams" />
            <div className="lp-works-with">
              <span>Works with</span>
              <ul>
                {WORKS_WITH.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <ul className="lp-flow">
              {FLOW.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <Icon size={28} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Keep the team in the know: heading, button, big screen. */}
        <section className="lp-section" aria-labelledby="know-title">
          <div className="lp-container">
            <h2 id="know-title" className="lp-h2">
              Keep your whole team in the know
            </h2>
            <p className="lp-section-lede">
              Engineering, product, design and support plan in one shared place, track progress
              on the same board and move faster together.
            </p>
            <Link className="lp-pill-button" href="/signup">
              Get started for free <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <div className="lp-know-visual">
              <AppWindow label="An AMR Hub board shared by several teams">
                <BoardMock />
              </AppWindow>
              <span className="lp-tag-cursor lp-tag-design" aria-hidden="true">
                Design
              </span>
              <span className="lp-tag-cursor lp-tag-support" aria-hidden="true">
                Support
              </span>
              <span className="lp-tag-cursor lp-tag-eng" aria-hidden="true">
                Engineering
              </span>
            </div>
          </div>
        </section>

        {/* More than project management: three tall cards. */}
        <section className="lp-section" id="more" aria-labelledby="more-title">
          <div className="lp-container">
            <h2 id="more-title" className="lp-h2">
              More than a board
            </h2>
            <ul className="lp-more">
              {MORE.map((item) => (
                <li key={item.title}>
                  <div className={`lp-more-visual lp-tone-${item.tone}`}>
                    <MoreVisual kind={item.visual} />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <Link href="/signup">
                    {item.link} <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Built for teams: stats panel and a carousel. */}
        <section className="lp-section" id="teams" aria-labelledby="teams-title">
          <div className="lp-container">
            <h2 id="teams-title" className="lp-h2">
              Built for teams big and small
            </h2>
            <p className="lp-section-lede">Every kind of team can run its work in AMR Hub.</p>
            <ul className="lp-stats" id="pricing">
              {STATS.map((stat) => (
                <li key={stat.value}>
                  <strong>{stat.value}</strong>
                  <span>{stat.body}</span>
                </li>
              ))}
            </ul>
            <Carousel label="team stories">
              {TEAMS.map((item) => (
                <article className={`lp-team-card lp-tone-${item.tone}`} key={item.team} role="listitem">
                  <div className="lp-team-face" aria-hidden="true">
                    <MockAvatar initials={item.initials} tone={0} />
                  </div>
                  <div className="lp-team-body">
                    <strong>{item.team}</strong>
                    <p>{item.body}</p>
                    <Link href="/signup">
                      Start with a template <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </Carousel>
          </div>
        </section>

        {/* Discover the latest: a row of coloured cards. */}
        <section className="lp-section lp-section-alt" id="latest" aria-labelledby="latest-title">
          <div className="lp-container">
            <h2 id="latest-title" className="lp-h2">
              Discover the latest for AMR Hub
            </h2>
            <p className="lp-section-lede">New features and guides for getting more from your board.</p>
            <Carousel label="updates">
              {LATEST.map((item) => (
                <article className={`lp-latest-card lp-tone-${item.tone}`} key={item.title} role="listitem">
                  <div className="lp-latest-art" aria-hidden="true">
                    <span>{item.tag === "Release" ? "New" : "How to"}</span>
                  </div>
                  <div className="lp-latest-body">
                    <span className="lp-latest-tag">{item.tag}</span>
                    <h3>{item.title}</h3>
                    <Link href="/signup">
                      {item.cta} <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </Carousel>
          </div>
        </section>

        {/* The wider workspace: copy on the left, big visual on the right. */}
        <section className="lp-section" aria-labelledby="suite-title">
          <div className="lp-container lp-suite">
            <div className="lp-suite-copy">
              <p className="lp-suite-kicker">
                <strong>AMR Hub</strong> workspace
              </p>
              <ul className="lp-suite-apps">
                {SUITE.map(({ icon: Icon, label }) => (
                  <li key={label}>
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
              <h2 id="suite-title" className="lp-h2">
                One workspace for the whole cycle
              </h2>
              <p className="lp-section-lede">
                Set goals, plan projects, run sprints and report on results without switching
                tools or copying updates between them.
              </p>
              <Link className="lp-text-link" href="/signup">
                Explore the workspace <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <div className="lp-suite-visual">
              <AppWindow label="AMR Hub reports for a sprint" active="Reports">
                <ReportsMock />
              </AppWindow>
              <span className="lp-tag-cursor lp-tag-eng" aria-hidden="true">
                Maya
              </span>
              <span className="lp-tag-cursor lp-tag-design" aria-hidden="true">
                Jon
              </span>
            </div>
          </div>
        </section>

        {/* Final call to action. */}
        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-container lp-final-inner">
            <span className="lp-final-mark" aria-hidden="true">
              A
            </span>
            <h2 id="final-title">The work system for software teams</h2>
            <p>Get started for free, no credit card required.</p>
            <Link className="primary-button lp-btn lp-btn-lg" href="/signup">
              Get it free
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <Link className="lp-brand" href="/" aria-label="AMR Hub home">
              <span className="lp-brand-mark" aria-hidden="true">
                A
              </span>
              <span>AMR Hub</span>
            </Link>
            <p>Free work management for software teams.</p>
          </div>
          <nav className="lp-footer-col" aria-label="Product">
            <strong>Product</strong>
            <a href="#product">Board</a>
            <a href="#workflow">Backlog and sprints</a>
            <a href="#more">Search and automation</a>
            <a href="#teams">Teams</a>
          </nav>
          <nav className="lp-footer-col" aria-label="Resources">
            <strong>Resources</strong>
            <a href="#latest">What&apos;s new</a>
            <a href="#latest">Guides</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <nav className="lp-footer-col" aria-label="Account">
            <strong>Account</strong>
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Sign up</Link>
          </nav>
        </div>
        <div className="lp-container lp-footer-base">
          <span>© {new Date().getFullYear()} AMR Hub</span>
        </div>
      </footer>
    </div>
  );
}
