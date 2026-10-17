import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ClipboardList,
  Columns3,
  LayoutDashboard,
  Package,
  Paperclip,
  Rows3,
  Search,
  ShieldCheck,
  Target,
  Timer,
  UsersRound,
  Webhook,
  Workflow,
} from "lucide-react";
import { ThemeToggle } from "./components/ThemeToggle";
import { FeatureTabs } from "./components/landing/FeatureTabs";
import { AppWindow, BoardMock } from "./components/landing/mocks";

export const metadata: Metadata = {
  title: {
    absolute: "AMR Hub | Plan, track and ship work as a team",
  },
  description:
    "AMR Hub is a Jira-style work management app: boards, backlogs and sprints, timelines, JQL search, automation, dashboards and reports for software teams.",
};

const FEATURES = [
  {
    icon: Workflow,
    title: "Custom workflows & work types",
    body: "Define statuses, transitions and your own work types alongside epics, stories, tasks, bugs and subtasks.",
  },
  {
    icon: Search,
    title: "JQL search, saved filters & bulk change",
    body: "Find anything with a query language you already know, save it as a filter, and update many items at once.",
  },
  {
    icon: Bot,
    title: "Automation rules",
    body: "Trigger actions when work is created, updated, commented on or changes status, so routine updates happen on their own.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboards with gadgets",
    body: "Assigned to me, filter results, pie charts, created vs resolved, sprint health, activity streams and more.",
  },
  {
    icon: Target,
    title: "Goals",
    body: "Set goals, link the work that delivers them and post progress updates so everyone sees where things stand.",
  },
  {
    icon: ClipboardList,
    title: "Forms",
    body: "Collect requests through forms that create work items in the right project with the right fields.",
  },
  {
    icon: Package,
    title: "Releases & components",
    body: "Group work into versions, track what ships in each release, and organise a project by component.",
  },
  {
    icon: Timer,
    title: "Time tracking & work logs",
    body: "Estimate, log time against work items and compare original estimates with time spent.",
  },
  {
    icon: Paperclip,
    title: "Subtasks, links, attachments, watchers & votes",
    body: "Break work down, link related items, attach files, and follow or vote on what matters to you.",
  },
  {
    icon: UsersRound,
    title: "Teams & people",
    body: "Organise members into teams, see who is working on what, and assign work to the right people.",
  },
  {
    icon: Webhook,
    title: "API, webhooks, import/export & audit log",
    body: "REST API v1 with personal tokens, outbound webhooks, CSV import and export, and a workspace audit log.",
  },
  {
    icon: ShieldCheck,
    title: "Security built in",
    body: "Two-factor (TOTP), passkeys, recovery codes, session management, and owner, member and viewer roles.",
  },
];

const STEPS = [
  {
    title: "Create your workspace",
    body: "Sign up and invite teammates by email. Each workspace keeps its projects, members and data separate.",
  },
  {
    title: "Create a project",
    body: "Pick the Scrum or Kanban template, give the project a key, and your board and workflow are ready.",
  },
  {
    title: "Plan in the backlog & run sprints",
    body: "Rank and estimate work, pull it into a sprint, and move it across the board as the team delivers.",
  },
  {
    title: "Track with reports and dashboards",
    body: "Follow burndown and velocity, build dashboards from gadgets, and keep stakeholders up to date.",
  },
];

const TEMPLATES = [
  {
    icon: Rows3,
    name: "Scrum",
    body: "Plan work in sprints from a prioritized backlog. Best for teams shipping on a regular cadence.",
    includes: ["Backlog with sprint planning", "Burndown, burnup and velocity", "Sprint start and completion"],
  },
  {
    icon: Columns3,
    name: "Kanban",
    body: "Visualize a continuous flow of work on a board with WIP limits. Best for support and ops teams.",
    includes: ["Continuous-flow board", "WIP limits per column", "Cumulative flow and control chart"],
  },
];

const FAQS = [
  {
    q: "Is AMR Hub free to start?",
    a: "Yes. Create a workspace from the sign-up page and start a project straight away.",
  },
  {
    q: "Does AMR Hub include AI features?",
    a: "No. There is no AI assistant or generated content. Automation is rule-based: you choose the trigger, conditions and actions.",
  },
  {
    q: "Can I import my work from Jira?",
    a: "Yes. Export a CSV from Jira, then go to Workspace settings → Import. Common Jira export headers are mapped to fields automatically. You can export to CSV the same way.",
  },
  {
    q: "Is there an API?",
    a: "Yes. A REST API (v1) covers projects and work items, authenticated with API tokens you create in Workspace settings. Webhooks notify your systems when work changes.",
  },
  {
    q: "What roles are available?",
    a: "Workspace members are owners, members or viewers. Owners manage the workspace and its settings, members create and edit work, and viewers have read-only access.",
  },
  {
    q: "How is my account protected?",
    a: "Sign in with a password or a passkey, add two-factor authentication with an authenticator app, keep recovery codes, and review or revoke active sessions at any time.",
  },
];

function Brand() {
  return (
    <Link className="lp-brand" href="/" aria-label="AMR Hub home">
      <span className="lp-brand-mark" aria-hidden="true">
        A
      </span>
      <span>AMR Hub</span>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <Brand />
          <nav className="lp-nav-links" aria-label="Page sections">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#templates">Templates</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-actions">
            <ThemeToggle />
            <Link className="lp-nav-login" href="/login">
              Log in
            </Link>
            <Link className="primary-button lp-btn" href="/signup">
              Get it free
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero">
          <div className="lp-container lp-hero-inner">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">Work management for software teams</p>
              <h1>Plan, track and ship great work together</h1>
              <p className="lp-lede">
                AMR Hub brings your backlog, sprints, boards and reports into one workspace,
                so the whole team can see what is planned, what is moving and what has shipped.
              </p>
              <div className="lp-cta-row">
                <Link className="primary-button lp-btn lp-btn-lg" href="/signup">
                  Get it free <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link className="secondary-button lp-btn lp-btn-lg" href="/login">
                  Log in
                </Link>
              </div>
              <p className="lp-hero-note">Scrum and Kanban templates · JQL search · REST API</p>
            </div>
            <div className="lp-hero-visual">
              <AppWindow label="Illustration of an AMR Hub board with To do, In progress, In review and Done columns">
                <BoardMock compact />
              </AppWindow>
            </div>
          </div>
        </section>

        <section className="lp-section" id="views" aria-labelledby="views-title">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow">One project, every view</p>
              <h2 id="views-title">Move work forward in the view that fits</h2>
              <p>
                Every project comes with a board, backlog, timeline, list, calendar and reports,
                all working from the same work items.
              </p>
            </div>
            <FeatureTabs />
          </div>
        </section>

        <section className="lp-section lp-section-alt" id="features" aria-labelledby="features-title">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow">Features</p>
              <h2 id="features-title">Everything a team needs to run its work</h2>
              <p>From the first idea in the backlog to the release notes, without bolting on extra tools.</p>
            </div>
            <ul className="lp-feature-grid">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li className="lp-feature" key={title}>
                  <span className="lp-feature-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section" id="how-it-works" aria-labelledby="how-title">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow">How it works</p>
              <h2 id="how-title">From sign-up to your first sprint</h2>
            </div>
            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <li className="lp-step" key={step.title}>
                  <span className="lp-step-num" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section-alt" id="templates" aria-labelledby="templates-title">
          <div className="lp-container">
            <div className="lp-section-head">
              <p className="lp-eyebrow">Templates</p>
              <h2 id="templates-title">Start with a template</h2>
              <p>Choose how your team works. You can switch between Scrum and Kanban later in project settings.</p>
            </div>
            <div className="lp-templates">
              {TEMPLATES.map(({ icon: Icon, name, body, includes }) => (
                <article className="lp-template" key={name}>
                  <div className="lp-template-head">
                    <span className="lp-feature-icon" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <h3>{name}</h3>
                  </div>
                  <p>{body}</p>
                  <ul className="lp-checks">
                    {includes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <Link
                    className="secondary-button lp-btn"
                    href="/signup"
                    aria-label={`Use the ${name} template`}
                  >
                    Use template <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section" id="faq" aria-labelledby="faq-title">
          <div className="lp-container lp-faq-wrap">
            <div className="lp-section-head">
              <p className="lp-eyebrow">FAQ</p>
              <h2 id="faq-title">Frequently asked questions</h2>
            </div>
            <div className="lp-faq">
              {FAQS.map((item) => (
                <details className="lp-faq-item" key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-container lp-final-inner">
            <h2 id="final-title">Get your team on the same board</h2>
            <p>Create a workspace, pick a template and plan your first sprint today.</p>
            <div className="lp-cta-row">
              <Link className="primary-button lp-btn lp-btn-lg" href="/signup">
                Get it free <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="secondary-button lp-btn lp-btn-lg" href="/login">
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-brand">
            <Brand />
            <p>Plan, track and ship work as a team.</p>
          </div>
          <nav className="lp-footer-col" aria-label="Product">
            <strong>Product</strong>
            <a href="#views">Views</a>
            <a href="#features">Features</a>
            <a href="#templates">Templates</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav className="lp-footer-col" aria-label="Account">
            <strong>Account</strong>
            <Link href="/login">Log in</Link>
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
