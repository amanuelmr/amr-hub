"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "../lib/auth-client";
import { useProjects } from "./ProjectProvider";
import { useCreateIssueModal } from "./CreateIssueModalProvider";
import { useSidebarCollapsed } from "./useSidebarCollapsed";
import { TopBar } from "./components/shell/TopBar";
import { Sidebar } from "./components/shell/Sidebar";

/**
 * Jira-style app frame: a full-width top bar (search, Create, notifications,
 * help, settings, profile) above a collapsible left sidebar. Below 760px the
 * sidebar becomes a slide-over drawer opened from the top bar.
 */
export default function NavBar() {
  const pathname = usePathname();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const { activeProjectId } = useProjects();
  const { isCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const { open: openCreateIssueModal } = useCreateIssueModal();

  // The drawer is tied to the route it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const isDrawerOpen = drawerPath === pathname;

  return (
    <>
      <TopBar
        isSidebarCollapsed={isCollapsed}
        onToggleSidebar={toggleCollapsed}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setDrawerPath(isDrawerOpen ? null : pathname)}
        canCreate={!isViewer}
        onCreate={() => openCreateIssueModal(activeProjectId)}
      />
      <Sidebar
        isCollapsed={isCollapsed}
        isDrawerOpen={isDrawerOpen}
        onCloseDrawer={() => setDrawerPath(null)}
      />
    </>
  );
}
