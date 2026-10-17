"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiRequest } from "./IssueProvider";
import { useProjects } from "./ProjectProvider";
import {
  DEFAULT_WORKFLOW,
  defaultTypeStyle,
  orderStatuses,
  statusCategory,
  statusName,
  typeLevel,
  typeName,
  type ProjectWorkflow,
  type StatusCategory,
  type TypeLevel,
  type WorkTypeConfig,
  type WorkflowStatusConfig,
} from "./data/workflow";

export type StatusMeta = {
  key: string;
  name: string;
  category: StatusCategory;
  color: string | null;
};

export type TypeMeta = {
  key: string;
  name: string;
  level: TypeLevel;
  icon: string;
  color: string;
  description: string | null;
};

type WorkflowContextValue = {
  workflows: Record<string, ProjectWorkflow>;
  isLoading: boolean;
  /** The project's workflow, or Jira's default when unknown/loading. */
  getWorkflow: (projectId: string | null | undefined) => ProjectWorkflow;
  statusMeta: (projectId: string | null | undefined, key: string) => StatusMeta;
  typeMeta: (projectId: string | null | undefined, key: string) => TypeMeta;
  /** Distinct statuses across every project (org-wide filters). */
  allStatuses: WorkflowStatusConfig[];
  /** Distinct work types across every project (org-wide filters). */
  allTypes: WorkTypeConfig[];
  refreshWorkflows: () => Promise<void>;
  /** Stores a workflow returned by a mutation endpoint. */
  setProjectWorkflow: (projectId: string, workflow: ProjectWorkflow) => void;
};

function findStatus(
  workflows: Record<string, ProjectWorkflow>,
  projectId: string | null | undefined,
  key: string,
) {
  const own = projectId ? workflows[projectId] : undefined;
  const hit = own?.statuses.find((status) => status.key === key);
  if (hit) return hit;
  for (const workflow of Object.values(workflows)) {
    const match = workflow.statuses.find((status) => status.key === key);
    if (match) return match;
  }
  return DEFAULT_WORKFLOW.statuses.find((status) => status.key === key);
}

function findType(
  workflows: Record<string, ProjectWorkflow>,
  projectId: string | null | undefined,
  key: string,
) {
  const own = projectId ? workflows[projectId] : undefined;
  const hit = own?.types.find((type) => type.key === key);
  if (hit) return hit;
  for (const workflow of Object.values(workflows)) {
    const match = workflow.types.find((type) => type.key === key);
    if (match) return match;
  }
  return DEFAULT_WORKFLOW.types.find((type) => type.key === key);
}

export function buildStatusMeta(
  workflows: Record<string, ProjectWorkflow>,
  projectId: string | null | undefined,
  key: string,
): StatusMeta {
  const found = findStatus(workflows, projectId, key);
  return {
    key,
    name: found?.name ?? statusName(key),
    category: found?.category ?? statusCategory(key),
    color: found?.color ?? null,
  };
}

export function buildTypeMeta(
  workflows: Record<string, ProjectWorkflow>,
  projectId: string | null | undefined,
  key: string,
): TypeMeta {
  const found = findType(workflows, projectId, key);
  const style = defaultTypeStyle(key);
  return {
    key,
    name: found?.name ?? typeName(key),
    level: found?.level ?? typeLevel(key),
    icon: found?.icon ?? style.icon,
    color: found?.color ?? style.color,
    description: found?.description ?? null,
  };
}

const fallbackContext: WorkflowContextValue = {
  workflows: {},
  isLoading: false,
  getWorkflow: () => DEFAULT_WORKFLOW,
  statusMeta: (projectId, key) => buildStatusMeta({}, projectId, key),
  typeMeta: (projectId, key) => buildTypeMeta({}, projectId, key),
  allStatuses: DEFAULT_WORKFLOW.statuses,
  allTypes: DEFAULT_WORKFLOW.types,
  refreshWorkflows: async () => {},
  setProjectWorkflow: () => {},
};

const WorkflowContext = createContext<WorkflowContextValue>(fallbackContext);

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const { projects } = useProjects();
  const [workflows, setWorkflows] = useState<Record<string, ProjectWorkflow>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const inFlight = useRef<Promise<void> | null>(null);

  const refreshWorkflows = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      try {
        setWorkflows(
          await apiRequest<Record<string, ProjectWorkflow>>("/api/workflows"),
        );
      } catch {
        // Keep the last known workflows; badges fall back to built-ins.
      } finally {
        setIsLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = request;
    return request;
  }, []);

  // Load once, and again whenever a project appears that we have not seen.
  const projectIds = projects.map((project) => project.id).join("|");
  useEffect(() => {
    const missing = projectIds
      .split("|")
      .filter(Boolean)
      .some((id) => !(id in workflows));
    if (isLoading || missing) void refreshWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds, refreshWorkflows]);

  const setProjectWorkflow = useCallback(
    (projectId: string, workflow: ProjectWorkflow) => {
      setWorkflows((current) => ({ ...current, [projectId]: workflow }));
    },
    [],
  );

  const value = useMemo<WorkflowContextValue>(() => {
    const statusByKey = new Map<string, WorkflowStatusConfig>();
    const typeByKey = new Map<string, WorkTypeConfig>();
    for (const workflow of [DEFAULT_WORKFLOW, ...Object.values(workflows)]) {
      for (const status of workflow.statuses) {
        if (!statusByKey.has(status.key)) statusByKey.set(status.key, status);
      }
      for (const type of workflow.types) {
        if (!typeByKey.has(type.key)) typeByKey.set(type.key, type);
      }
    }
    return {
      workflows,
      isLoading,
      getWorkflow: (projectId) =>
        (projectId ? workflows[projectId] : undefined) ?? DEFAULT_WORKFLOW,
      statusMeta: (projectId, key) => buildStatusMeta(workflows, projectId, key),
      typeMeta: (projectId, key) => buildTypeMeta(workflows, projectId, key),
      allStatuses: orderStatuses([...statusByKey.values()]),
      allTypes: [...typeByKey.values()].sort(
        (a, b) => b.level - a.level || a.position - b.position,
      ),
      refreshWorkflows,
      setProjectWorkflow,
    };
  }, [workflows, isLoading, refreshWorkflows, setProjectWorkflow]);

  return (
    <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
  );
}

export function useWorkflows() {
  return useContext(WorkflowContext);
}

/** Ordered statuses, transitions and work types for one project. */
export function useWorkflow(projectId: string | null | undefined) {
  const { getWorkflow } = useWorkflows();
  return getWorkflow(projectId);
}

export function useStatusMeta(projectId: string | null | undefined, key: string) {
  return useWorkflows().statusMeta(projectId, key);
}

export function useTypeMeta(projectId: string | null | undefined, key: string) {
  return useWorkflows().typeMeta(projectId, key);
}
