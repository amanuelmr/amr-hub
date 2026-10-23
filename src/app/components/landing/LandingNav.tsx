"use client";

import { useState } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowRight, ChevronDown, Search, X } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";

type MenuItem = { label: string; body: string; href: string };

const MENUS: { label: string; items: MenuItem[] }[] = [
  {
    label: "Features",
    items: [
      { label: "Boards", body: "Scrum and Kanban boards with swimlanes and WIP limits", href: "#product" },
      { label: "Backlog and sprints", body: "Rank, estimate and plan sprints", href: "#workflow" },
      { label: "Timeline", body: "Plan epics over time with dependencies", href: "#workflow" },
      { label: "JQL search and filters", body: "Find anything and share saved filters", href: "#more" },
      { label: "Automation", body: "When, if and then rules with a run log", href: "#more" },
      { label: "Dashboards and reports", body: "Burndown, velocity, CFD and gadgets", href: "#more" },
    ],
  },
  {
    label: "Solutions",
    items: [
      { label: "Software teams", body: "Sprints, releases and bug tracking", href: "#teams" },
      { label: "Product managers", body: "Roadmaps, goals and priorities", href: "#teams" },
      { label: "Support and ops", body: "Kanban flow, forms and SLAs by filter", href: "#teams" },
    ],
  },
  {
    label: "Templates",
    items: [
      { label: "Scrum", body: "Sprints from a ranked backlog", href: "/signup" },
      { label: "Kanban", body: "Continuous flow with WIP limits", href: "/signup" },
    ],
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

/** Jira-style site header: product menus, search, sign in and the main CTA. */
export function LandingNav() {
  const [showBanner, setShowBanner] = useState(true);

  return (
    <>
      <header className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <Brand />
          <nav className="lp-nav-links" aria-label="Main">
            {MENUS.map((menu) => (
              <DropdownMenu.Root key={menu.label} modal={false}>
                <DropdownMenu.Trigger className="lp-nav-trigger">
                  {menu.label}
                  <ChevronDown size={14} aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="lp-nav-menu" align="start" sideOffset={10}>
                    {menu.items.map((item) => (
                      <DropdownMenu.Item key={item.label} asChild>
                        <Link className="lp-nav-menu-item" href={item.href}>
                          <strong>{item.label}</strong>
                          <span>{item.body}</span>
                        </Link>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            ))}
            <a className="lp-nav-trigger" href="#latest">
              Guides
            </a>
            <a className="lp-nav-trigger" href="#pricing">
              Pricing
            </a>
          </nav>
          <div className="lp-nav-actions">
            <Link className="lp-nav-icon" href="/login" aria-label="Search (log in first)">
              <Search size={17} aria-hidden="true" />
            </Link>
            <ThemeToggle />
            <span className="lp-nav-divider" aria-hidden="true" />
            <Link className="lp-nav-login" href="/login">
              Sign in
            </Link>
            <Link className="primary-button lp-btn" href="/signup">
              Get it free
            </Link>
          </div>
        </div>
      </header>
      {showBanner && (
        <div className="lp-banner" role="region" aria-label="Announcement">
          <p>
            New on the board: a Filter panel, column menus and days in column.{" "}
            <a href="#latest">
              See what&apos;s new <ArrowRight size={13} aria-hidden="true" />
            </a>
          </p>
          <button type="button" aria-label="Dismiss announcement" onClick={() => setShowBanner(false)}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
