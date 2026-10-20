"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { apiRequest } from "../../../IssueProvider";
import { useProjects } from "../../../ProjectProvider";
import { authClient } from "../../../../lib/auth-client";

export type ProjectPerson = {
  userId: string;
  memberId: string;
  name: string;
  email: string;
  role: string;
};

export function useWorkspaceRole() {
  const { data: activeMember } = authClient.useActiveMember();
  return {
    role: activeMember?.role ?? null,
    userId: activeMember?.userId ?? null,
    isViewer: activeMember?.role === "viewer",
    isOwner: activeMember?.role === "owner",
  };
}

/** The current user's permissions on a project (from the projects list). */
export function useProjectPermissions(projectId: string) {
  const { allProjects } = useProjects();
  const permissions = allProjects.find((project) => project.id === projectId)
    ?.permissions;
  return {
    canEdit: permissions?.canEdit ?? false,
    canAdmin: permissions?.canAdmin ?? false,
  };
}

export function useProjectPeople(projectId: string) {
  const [people, setPeople] = useState<ProjectPerson[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<ProjectPerson[]>(
      `/api/projects/${encodeURIComponent(projectId)}/members`,
      { signal: controller.signal },
    )
      .then(setPeople)
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);

  return people;
}

/** Loads a project sub-resource list and exposes a reload callback. */
export function useProjectResource<T>(projectId: string, resource: string) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/projects/${encodeURIComponent(projectId)}/${resource}`;

  const reload = useCallback(async () => {
    try {
      setItems(await apiRequest<T[]>(url));
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not be loaded",
      );
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<T[]>(url, { signal: controller.signal })
      .then((loaded) => {
        setItems(loaded);
        setError(null);
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not be loaded",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [url]);

  return { items, setItems, isLoading, error, reload };
}

export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pa-dialog-overlay" />
        <Dialog.Content
          className={wide ? "pa-dialog pa-dialog-wide" : "pa-dialog"}
          aria-describedby={undefined}
        >
          <header className="pa-dialog-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description>{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PersonAvatar({ name }: { name: string | null | undefined }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className="avatar avatar-small" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
