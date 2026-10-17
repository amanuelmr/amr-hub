"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { IssueProvider } from "./IssueProvider";
import { ProjectProvider } from "./ProjectProvider";
import { WorkflowProvider } from "./WorkflowProvider";
import { NotificationProvider } from "./NotificationProvider";
import { CreateIssueModalProvider } from "./CreateIssueModalProvider";
import { CommandPalette } from "./components/CommandPalette";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { IssueOverlay } from "./components/issue/IssueOverlay";
import NavBar from "./NavBar";

const AUTH_ROUTES = [
  "/forgot-password",
  "/reset-password",
  "/login",
  "/onboarding",
  "/signup",
  "/setup",
  "/invite",
  "/two-factor",
];

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingRoute = pathname === "/";
  const isOnAuthRoute = isAuthRoute(pathname);

  if (isLandingRoute) {
    return <div className="landing-content">{children}</div>;
  }

  if (isOnAuthRoute) {
    return <main className="auth-content">{children}</main>;
  }

  return (
    <ProjectProvider>
      <WorkflowProvider>
        <NotificationProvider>
          <IssueProvider>
            <CreateIssueModalProvider>
              <div className="app-shell shell-frame">
                <NavBar />
                <main className="app-content">{children}</main>
                <CommandPalette />
                <KeyboardShortcuts />
                <Suspense fallback={null}>
                  <IssueOverlay />
                </Suspense>
              </div>
            </CreateIssueModalProvider>
          </IssueProvider>
        </NotificationProvider>
      </WorkflowProvider>
    </ProjectProvider>
  );
}
