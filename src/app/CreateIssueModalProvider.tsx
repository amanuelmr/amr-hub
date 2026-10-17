"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  CreateIssueModal,
  CreatedIssueToast,
} from "./components/CreateIssueModal";
import type { CreateIssueDefaults } from "./components/CreateIssueForm";

type CreateIssueModalContextValue = {
  open: (projectId?: string | null, defaults?: CreateIssueDefaults) => void;
  close: () => void;
};

const CreateIssueModalContext =
  createContext<CreateIssueModalContextValue | null>(null);

export function CreateIssueModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    isOpen: boolean;
    projectId: string | null;
    defaults?: CreateIssueDefaults;
  }>({ isOpen: false, projectId: null });

  const open = useCallback(
    (projectId?: string | null, defaults?: CreateIssueDefaults) => {
      setState({ isOpen: true, projectId: projectId ?? null, defaults });
    },
    [],
  );

  const [createdId, setCreatedId] = useState<string | null>(null);
  const dismissToast = useCallback(() => setCreatedId(null), []);

  const close = useCallback(() => {
    setState((current) => ({ ...current, isOpen: false }));
  }, []);

  return (
    <CreateIssueModalContext.Provider value={{ open, close }}>
      {children}
      {state.isOpen && (
        <CreateIssueModal
          projectId={state.projectId}
          defaults={state.defaults}
          onClose={close}
          onCreated={(issue) => setCreatedId(issue.id)}
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
