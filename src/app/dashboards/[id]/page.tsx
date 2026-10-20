"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Copy, MoreHorizontal, Pencil, Plus, Share2, Star, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FilterDetailsDialog } from "../../components/search/FilterDetailsDialog";
import { summarizeShares, useShareDirectory } from "../../components/search/ShareEditor";
import { apiRequest, useIssues } from "../../IssueProvider";
import { WorkspaceLoading } from "../../components/WorkspaceLoading";
import { GadgetCard } from "../../components/dashboard/GadgetCard";
import {
  GADGET_META,
  GADGET_ORDER,
  newGadget,
  type DashboardRecord,
  type Gadget,
} from "../../components/dashboard/gadgetMeta";

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading: isLoadingIssues } = useIssues();
  const [dashboard, setDashboard] = useState<DashboardRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftGadgets, setDraftGadgets] = useState<Gadget[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const shareDirectory = useShareDirectory();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<DashboardRecord>(`/api/dashboards/${encodeURIComponent(params.id)}`, {
      signal: controller.signal,
    })
      .then(setDashboard)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        const message = messageFrom(requestError, "Dashboard could not be loaded");
        if (message === "Dashboard not found") setNotFound(true);
        else setError(message);
      });
    return () => controller.abort();
  }, [params.id]);

  const startEditing = () => {
    if (!dashboard) return;
    setDraftName(dashboard.name);
    setDraftGadgets(dashboard.gadgets);
    setEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setEditing(false);
    setIsPickerOpen(false);
  };

  const save = async () => {
    if (!dashboard) return;
    const name = draftName.trim() || dashboard.name;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<DashboardRecord>(
        `/api/dashboards/${encodeURIComponent(dashboard.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name, gadgets: draftGadgets }),
        },
      );
      setDashboard(updated);
      setEditing(false);
      setIsPickerOpen(false);
    } catch (requestError) {
      setError(messageFrom(requestError, "Dashboard could not be saved"));
    } finally {
      setIsSaving(false);
    }
  };

  const dashboardPath = (suffix = "") =>
    `/api/dashboards/${encodeURIComponent(dashboard?.id ?? "")}${suffix}`;

  const toggleStar = async () => {
    if (!dashboard) return;
    try {
      setDashboard(
        await apiRequest<DashboardRecord>(dashboardPath("/star"), {
          method: dashboard.isStarred ? "DELETE" : "POST",
        }),
      );
    } catch (requestError) {
      setError(messageFrom(requestError, "Dashboard could not be starred"));
    }
  };

  const copy = async () => {
    try {
      const created = await apiRequest<DashboardRecord>(dashboardPath("/copy"), {
        method: "POST",
      });
      router.push(`/dashboards/${encodeURIComponent(created.id)}`);
    } catch (requestError) {
      setError(messageFrom(requestError, "Dashboard could not be copied"));
    }
  };

  const remove = async () => {
    if (!dashboard) return;
    try {
      await apiRequest(`/api/dashboards/${encodeURIComponent(dashboard.id)}`, {
        method: "DELETE",
      });
      router.push("/dashboards");
    } catch (requestError) {
      setError(messageFrom(requestError, "Dashboard could not be deleted"));
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraftGadgets((current) => {
      const from = current.findIndex((gadget) => gadget.id === active.id);
      const to = current.findIndex((gadget) => gadget.id === over.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  };

  if (notFound) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Dashboard not found</h2>
          <p>It may have been deleted, or it belongs to someone else.</p>
          <Link className="secondary-button" href="/dashboards">
            Back to dashboards
          </Link>
        </div>
      </div>
    );
  }

  if (!dashboard || isLoadingIssues) {
    return (
      <div className="page">
        {error ? (
          <p className="form-submit-error" role="alert">
            {error}
          </p>
        ) : (
          <WorkspaceLoading label="Loading dashboard" />
        )}
      </div>
    );
  }

  const gadgets = editing ? draftGadgets : dashboard.gadgets;

  return (
    <div className="page">
      <nav className="dashboards-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/dashboards">
          <ArrowLeft size={12} aria-hidden="true" />
          Dashboards
        </Link>
      </nav>
      <header className="jira-page-header dashboards-header">
        {editing ? (
          <label className="dashboards-rename">
            <span className="sr-only">Dashboard name</span>
            <input
              value={draftName}
              maxLength={80}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </label>
        ) : (
          <div className="dashboards-title">
            <h1 className="jira-page-title">{dashboard.name}</h1>
            <button
              type="button"
              className={dashboard.isStarred ? "filters-star active" : "filters-star"}
              aria-pressed={dashboard.isStarred}
              aria-label={dashboard.isStarred ? "Unstar dashboard" : "Star dashboard"}
              onClick={() => void toggleStar()}
            >
              <Star size={16} aria-hidden="true" />
            </button>
            <span className="dashboards-meta">
              {dashboard.ownerName} · {summarizeShares(dashboard.viewers, shareDirectory)}
            </span>
          </div>
        )}
        <div className="jira-page-actions">
          {editing ? (
            <>
              <button
                type="button"
                className="secondary-button jira-compact-button"
                onClick={() => setIsPickerOpen((current) => !current)}
                aria-expanded={isPickerOpen}
              >
                <Plus size={16} aria-hidden="true" />
                Add gadget
              </button>
              <button
                type="button"
                className="secondary-button jira-compact-button"
                onClick={cancelEditing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button jira-compact-button"
                onClick={save}
                disabled={isSaving}
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {dashboard.canEdit && (
                <>
                  <button
                    type="button"
                    className="secondary-button jira-compact-button"
                    onClick={() => setIsSharing(true)}
                  >
                    <Share2 size={16} aria-hidden="true" />
                    Share
                  </button>
                  <button
                    type="button"
                    className="secondary-button jira-compact-button"
                    onClick={startEditing}
                  >
                    <Pencil size={16} aria-hidden="true" />
                    Edit
                  </button>
                </>
              )}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="secondary-button jira-compact-button jira-icon-only"
                    aria-label="More dashboard actions"
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="planning-menu" align="end" sideOffset={4}>
                    {dashboard.canEdit && (
                      <DropdownMenu.Item className="planning-menu-item" onSelect={startEditing}>
                        <Plus size={14} aria-hidden="true" />
                        Add gadget
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item className="planning-menu-item" onSelect={() => void copy()}>
                      <Copy size={14} aria-hidden="true" />
                      Copy dashboard
                    </DropdownMenu.Item>
                    {dashboard.canManage && (
                      <>
                        <DropdownMenu.Separator className="planning-menu-separator" />
                        <DropdownMenu.Item
                          className="planning-menu-item danger"
                          onSelect={() => setIsConfirmingDelete(true)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Delete dashboard
                        </DropdownMenu.Item>
                      </>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </>
          )}
        </div>
      </header>

      {error && (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      )}

      {editing && isPickerOpen && (
        <section className="panel gadget-picker" aria-label="Add a gadget">
          <div className="panel-header">
            <div>
              <h2>Add a gadget</h2>
              <p>Gadgets are added to the end; drag to reorder.</p>
            </div>
          </div>
          <ul>
            {GADGET_ORDER.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => {
                    setDraftGadgets((current) =>
                      current.length >= 30 ? current : [...current, newGadget(type)],
                    );
                    setIsPickerOpen(false);
                  }}
                  disabled={draftGadgets.length >= 30}
                >
                  <strong>{GADGET_META[type].label}</strong>
                  <small>{GADGET_META[type].description}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gadgets.length === 0 ? (
        <div className="empty-state">
          <h2>No gadgets yet</h2>
          <p>
            {dashboard.canEdit
              ? "Edit this dashboard to add gadgets."
              : "The owner hasn't added any gadgets yet."}
          </p>
          {!editing && dashboard.canEdit && (
            <button type="button" className="primary-button" onClick={startEditing}>
              <Pencil size={16} aria-hidden="true" />
              Edit dashboard
            </button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={gadgets.map((gadget) => gadget.id)}
            strategy={rectSortingStrategy}
          >
            <div className="dashboards-grid">
              {gadgets.map((gadget) => (
                <GadgetCard
                  key={gadget.id}
                  gadget={gadget}
                  editing={editing}
                  onRemove={() =>
                    setDraftGadgets((current) =>
                      current.filter((candidate) => candidate.id !== gadget.id),
                    )
                  }
                  onConfigure={(config) =>
                    setDraftGadgets((current) =>
                      current.map((candidate) =>
                        candidate.id === gadget.id ? { ...candidate, config } : candidate,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {isSharing && (
        <FilterDetailsDialog
          title="Share dashboard"
          submitLabel="Save"
          noun="dashboard"
          initial={dashboard}
          onClose={() => setIsSharing(false)}
          onSubmit={async (input) => {
            setDashboard(
              await apiRequest<DashboardRecord>(dashboardPath(), {
                method: "PATCH",
                body: JSON.stringify(input),
              }),
            );
          }}
        />
      )}
      {isConfirmingDelete && (
        <ConfirmDialog
          title={`Delete ${dashboard.name}?`}
          body="The dashboard and its gadgets are removed for everyone it's shared with. This can't be undone."
          confirmLabel="Delete"
          onClose={() => setIsConfirmingDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
