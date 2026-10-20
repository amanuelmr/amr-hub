"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useIssues } from "../IssueProvider";
import { useProjects } from "../ProjectProvider";
import { useCreateIssueModal } from "../CreateIssueModalProvider";
import { authClient } from "../../lib/auth-client";
import { OPEN_SHORTCUTS_EVENT, openCommandPalette } from "./CommandPalette";
import { goToDestination, isTypingTarget, issueIdFromPath } from "./shortcutKeys";

const SEQUENCE_TIMEOUT_MS = 1200;

type Shortcut = { keys: string[]; label: string };

export const SHORTCUT_GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["/"], label: "Search issues and commands" },
      { keys: ["⌘", "K"], label: "Open command palette" },
      { keys: ["c"], label: "Create issue" },
    ],
  },
  {
    title: "Go to",
    shortcuts: [
      { keys: ["g", "w"], label: "Your work" },
      { keys: ["g", "o"], label: "Overview" },
      { keys: ["g", "d"], label: "Dashboards" },
      { keys: ["g", "p"], label: "Projects" },
      { keys: ["g", "i"], label: "Issues (search)" },
      { keys: ["g", "f"], label: "Filters" },
      { keys: ["g", "b"], label: "Board of current project" },
      { keys: ["g", "l"], label: "Backlog of current project" },
      { keys: ["g", "s"], label: "Summary of current project" },
    ],
  },
  {
    title: "Issue view",
    shortcuts: [
      { keys: ["e"], label: "Edit the summary" },
      { keys: ["i"], label: "Assign the issue to me" },
      { keys: ["a"], label: "Assign to me / unassign" },
      { keys: ["m"], label: "Add a comment" },
      { keys: ["w"], label: "Watch / stop watching" },
      { keys: ["s"], label: "Share (copies the link)" },
      { keys: ["."], label: "Open the more actions menu" },
      { keys: ["j"], label: "Next issue in the list or board" },
      { keys: ["k"], label: "Previous issue in the list or board" },
      { keys: ["Esc"], label: "Close the issue" },
    ],
  },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { updateIssue } = useIssues();
  const { activeProjectId } = useProjects();
  const { open: openCreateIssueModal } = useCreateIssueModal();
  const { data: activeMember } = authClient.useActiveMember();
  const isViewer = activeMember?.role === "viewer";
  const memberId = activeMember?.id ?? null;
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const openHelp = () => setIsHelpOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, openHelp);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector(".command-palette")) return;
      // Jira ignores global shortcuts while any dialog is open.
      if (document.querySelector("[role='dialog'], [role='alertdialog']")) return;

      const key = event.key;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const href = goToDestination(key, activeProjectId);
        if (href) {
          event.preventDefault();
          router.push(href);
        }
        return;
      }

      if (key === "?") {
        event.preventDefault();
        setIsHelpOpen(true);
      } else if (key === "/") {
        event.preventDefault();
        openCommandPalette();
      } else if (key === "g") {
        pendingG.current = window.setTimeout(() => {
          pendingG.current = null;
        }, SEQUENCE_TIMEOUT_MS);
      } else if (key === "c" && !isViewer) {
        event.preventDefault();
        openCreateIssueModal(activeProjectId);
      } else if (key === "i" && !isViewer && memberId) {
        const issueId = issueIdFromPath(pathname);
        if (!issueId) return;
        event.preventDefault();
        void updateIssue(issueId, { assigneeId: memberId }).then((updated) =>
          setToast(updated ? `Assigned ${issueId} to you` : `Could not assign ${issueId}`),
        );
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      if (pendingG.current !== null) window.clearTimeout(pendingG.current);
    };
  }, [activeProjectId, isViewer, memberId, openCreateIssueModal, pathname, router, updateIssue]);

  return (
    <>
      <Dialog.Root open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content className="save-view-dialog search-dialog shortcuts-dialog">
            <header>
              <div>
                <Dialog.Title asChild>
                  <h2>Keyboard shortcuts</h2>
                </Dialog.Title>
                <Dialog.Description asChild>
                  <p>Shortcuts are ignored while you type in a field.</p>
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="icon-button" type="button" aria-label="Close shortcuts">
                  <X size={16} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>
            <div className="shortcuts-grid">
              {SHORTCUT_GROUPS.map((group) => (
                <section key={group.title}>
                  <h3>{group.title}</h3>
                  <dl>
                    {group.shortcuts.map((shortcut) => (
                      <div key={shortcut.label}>
                        <dt>{shortcut.label}</dt>
                        <dd>
                          {shortcut.keys.map((key, index) => (
                            <span key={`${key}-${index}`}>
                              {index > 0 && shortcut.keys[0] === "g" && (
                                <span className="shortcut-then">then</span>
                              )}
                              <kbd>{key}</kbd>
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {toast && (
        <div className="shortcut-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
