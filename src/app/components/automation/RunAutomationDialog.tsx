"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Play, X, Zap } from "lucide-react";
import { apiRequest } from "../../IssueProvider";
import type {
  AutomationRule,
  AutomationRunStatus,
} from "../../../server/automationRules";
import { RunStatusBadge } from "./AutomationAuditLog";

type RunResult = {
  status: AutomationRunStatus;
  message: string;
  issueId: string | null;
};

/**
 * The issue view's "Run automation" dialog: lists the project's enabled
 * "Manually triggered" rules and runs one on the issue.
 *
 * Usage in the issue "…" menu:
 *   <DropdownMenu.Item onSelect={() => setDialog("automation")}>Run automation</DropdownMenu.Item>
 *   <RunAutomationDialog open={dialog === "automation"} onOpenChange={...}
 *     projectId={issue.projectId} issueId={issue.id} onRan={() => controller.refresh()} />
 */
export function RunAutomationDialog({
  open,
  onOpenChange,
  projectId,
  issueId,
  onRan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  issueId: string;
  onRan?: (results: RunResult[]) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pa-dialog-overlay" />
        <Dialog.Content
          className="pa-dialog au-run-dialog"
          aria-describedby={undefined}
        >
          <header className="pa-dialog-header">
            <div>
              <Dialog.Title>Run automation</Dialog.Title>
              <Dialog.Description>
                Manually triggered rules for {issueId}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <RunAutomationBody
            projectId={projectId}
            issueId={issueId}
            onRan={onRan}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Mounted only while the dialog is open, so every open starts fresh. */
function RunAutomationBody({
  projectId,
  issueId,
  onRan,
}: {
  projectId: string;
  issueId: string;
  onRan?: (results: RunResult[]) => void;
}) {
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunResult>>({});

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<AutomationRule[]>(
      `/api/projects/${encodeURIComponent(projectId)}/automation?trigger=MANUAL`,
      { signal: controller.signal },
    )
      .then((loaded) => setRules(loaded.filter((rule) => rule.enabled)))
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        setRules([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Rules could not be loaded",
        );
      });
    return () => controller.abort();
  }, [projectId]);

  const run = async (rule: AutomationRule) => {
    setRunningId(rule.id);
    setError(null);
    try {
      const response = await apiRequest<{ runs: RunResult[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/automation/${encodeURIComponent(rule.id)}/run`,
        { method: "POST", body: JSON.stringify({ issueId }) },
      );
      const result = response.runs[0];
      if (result) setResults((current) => ({ ...current, [rule.id]: result }));
      onRan?.(response.runs);
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Rule could not be run",
      );
    } finally {
      setRunningId(null);
    }
  };

  return (
    <>
      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}
      {rules === null ? (
        <p className="pa-muted">Loading rules…</p>
      ) : rules.length === 0 ? (
        <div className="au-empty">
          <Zap size={18} aria-hidden="true" />
          <p className="pa-muted">
            No manual rules yet. Create a rule with the “Manually triggered”
            trigger in Project settings → Automation.
          </p>
        </div>
      ) : (
        <ul className="au-run-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <div>
                <strong>{rule.name}</strong>
                {results[rule.id] && (
                  <p className="au-run-result">
                    <RunStatusBadge status={results[rule.id].status} />{" "}
                    {results[rule.id].message}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={runningId !== null}
                onClick={() => run(rule)}
              >
                <Play size={13} aria-hidden="true" />
                {runningId === rule.id ? "Running..." : "Run"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
