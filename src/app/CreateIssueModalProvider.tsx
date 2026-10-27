"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  CreateDraftDock,
  CreateIssueModal,
  CreatedIssueToast,
} from "./components/CreateIssueModal";
import type { CreateIssueDefaults } from "./components/CreateIssueForm";
import { draftLabel, type CreateDraft } from "./components/createFields";
import { stripHtml } from "./data/richText";

type CreateIssueModalContextValue = {
  open: (projectId?: string | null, defaults?: CreateIssueDefaults) => void;
  close: () => void;
};

const CreateIssueModalContext =
  createContext<CreateIssueModalContextValue | null>(null);

type ModalState = {
  isOpen: boolean;
  /** Docked at the bottom of the page with the draft kept. */
  isMinimized: boolean;
  projectId: string | null;
  defaults?: CreateIssueDefaults;
};

export function CreateIssueModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ModalState>({
    isOpen: false,
    isMinimized: false,
    projectId: null,
  });
  // The draft lives in a ref so typing doesn't re-render the whole app.
  const draftRef = useRef<CreateDraft | null>(null);
  const [dockLabel, setDockLabel] = useState("");
  const [dockHasContent, setDockHasContent] = useState(false);
  // Snapshot handed back to the form when a minimized dialog expands.
  const [restoredDraft, setRestoredDraft] = useState<CreateDraft | null>(null);

  const open = useCallback(
    (projectId?: string | null, defaults?: CreateIssueDefaults) => {
      setState((current) =>
        // Opening Create again brings back a minimized draft instead of
        // throwing away what was typed.
        current.isMinimized
          ? { ...current, isOpen: true, isMinimized: false }
          : { isOpen: true, isMinimized: false, projectId: projectId ?? null, defaults },
      );
    },
    [],
  );

  const [createdId, setCreatedId] = useState<string | null>(null);
  const dismissToast = useCallback(() => setCreatedId(null), []);

  const close = useCallback(() => {
    draftRef.current = null;
    setRestoredDraft(null);
    setState((current) => ({ ...current, isOpen: false, isMinimized: false }));
  }, []);

  const minimize = useCallback(() => {
    const draft = draftRef.current;
    setDockLabel(draftLabel(draft));
    setDockHasContent(
      Boolean(draft && (draft.title.trim() || stripHtml(draft.description).trim())),
    );
    setRestoredDraft(draft);
    setState((current) => ({ ...current, isOpen: false, isMinimized: true }));
  }, []);

  const expand = useCallback(() => {
    setState((current) => ({ ...current, isOpen: true, isMinimized: false }));
  }, []);

  const saveDraft = useCallback((draft: CreateDraft) => {
    draftRef.current = draft;
  }, []);

  return (
    <CreateIssueModalContext.Provider value={{ open, close }}>
      {children}
      {state.isOpen && (
        <CreateIssueModal
          projectId={state.projectId}
          defaults={state.defaults}
          initialDraft={restoredDraft}
          onDraftChange={saveDraft}
          onMinimize={minimize}
          onClose={close}
          onCreated={(issue) => {
            draftRef.current = null;
            setRestoredDraft(null);
            setCreatedId(issue.id);
          }}
        />
      )}
      {state.isMinimized && (
        <CreateDraftDock
          label={dockLabel}
          hasContent={dockHasContent}
          onExpand={expand}
          onDiscard={close}
        />
      )}
      <CreatedIssueToast issueId={createdId} onDismiss={dismissToast} />
    </CreateIssueModalContext.Provider>
  );
}

export function useCreateIssueModal() {
  const context = useContext(CreateIssueModalContext);

  if (!context) {
    throw new Error(
      "useCreateIssueModal must be used within a CreateIssueModalProvider",
    );
  }

  return context;
}
