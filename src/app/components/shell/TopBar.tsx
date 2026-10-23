"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleHelp, Menu, PanelLeft, Plus, Search, Settings } from "lucide-react";
import { OPEN_SHORTCUTS_EVENT, openCommandPalette } from "../CommandPalette";
import { NotificationInbox } from "../NotificationInbox";
import { ThemeToggle } from "../ThemeToggle";
import { HelpPanel } from "./HelpPanel";
import { ProfileMenu } from "./ProfileMenu";

export function openShortcutsHelp() {
  window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
}

export function TopBar({
  isSidebarCollapsed,
  onToggleSidebar,
  isDrawerOpen,
  onToggleDrawer,
  canCreate,
  onCreate,
}: {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  return (
    <header className="shell-topbar">
      {isHelpOpen && (
        <HelpPanel onClose={() => setIsHelpOpen(false)} onOpenShortcuts={openShortcutsHelp} />
      )}
      <div className="shell-topbar-start">
        <button
          type="button"
          className="shell-icon-button shell-sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!isSidebarCollapsed}
          title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeft size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="shell-icon-button shell-drawer-toggle"
          onClick={onToggleDrawer}
          aria-label={isDrawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={isDrawerOpen}
          aria-controls="shell-sidebar"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <Link href="/your-work" className="shell-brand" aria-label="AMR Hub home">
          <span className="brand-mark">A</span>
          <strong>AMR Hub</strong>
        </Link>
      </div>

      <div className="shell-topbar-center">
        <button
          type="button"
          className="shell-search"
          onClick={openCommandPalette}
          aria-label="Search"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search size={15} aria-hidden="true" />
          <span className="shell-search-label">Search</span>
          <kbd>⌘K</kbd>
        </button>
        {canCreate && (
          <button
            type="button"
            className="shell-create"
            onClick={onCreate}
            aria-label="Create"
            aria-keyshortcuts="C"
            title="Create  [C]"
          >
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
            <span className="shell-create-label">Create</span>
          </button>
        )}
      </div>

      <div className="shell-topbar-end">
        <span className="shell-topbar-notifications">
          <NotificationInbox align="end" />
        </span>
        <button
          type="button"
          className="shell-icon-button shell-hide-mobile"
          onClick={() => setIsHelpOpen((open) => !open)}
          aria-label="Help"
          aria-expanded={isHelpOpen}
          title="Help"
        >
          <CircleHelp size={17} aria-hidden="true" />
        </button>
        <Link
          href="/account"
          className="shell-icon-button shell-hide-mobile"
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={17} aria-hidden="true" />
        </Link>
        <span className="shell-hide-mobile shell-topbar-theme">
          <ThemeToggle />
        </span>
        <ProfileMenu />
      </div>
    </header>
  );
}
