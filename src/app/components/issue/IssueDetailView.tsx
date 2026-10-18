"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Flag,
  GitBranchPlus,
  Link2,
  LoaderCircle,
  Maximize2,
  Paperclip,
  Pencil,
  RefreshCcw,
  Upload,
  X,
} from "lucide-react";
import { apiRequest, useIssues } from "../../IssueProvider";
import { useProjects } from "../../ProjectProvider";
import { authClient } from "../../../lib/auth-client";
import { KindIcon } from "../IssueVisuals";
import { RichTextEditor, type ImageUploader } from "../RichTextEditor";
import { DescriptionView } from "../DescriptionView";
import { WorkspaceLoading } from "../WorkspaceLoading";
import { stripHtml } from "../../data/richText";
import type { Issue, IssueResolution, IssueStatus } from "../../data/issues";
import { useIssueDetail, type IssueDetailController } from "./useIssueDetail";
import {
  StatusTransitionButton,
  VoteButton,
  WatchButton,
} from "./IssueStatusActions";
import { copyIssueLink, IssueSharePopover } from "./IssueSharePopover";
import { ImageLightbox, withImage, type LightboxImage } from "./ImageLightbox";
import { adjacentIssueId, resolveIssueOrder } from "./issueNav";
import { issueUrl } from "./useIssueDetail";
import { IssueMoreMenu } from "./IssueDialogs";
import { IssueDetailsPanel, IssueMetaFooter } from "./IssueDetailsPanel";
import {
  ChildIssuesSection,
  LinkedIssuesSection,
} from "./IssueRelationsSections";
import {
  INLINE_TYPES,
  IssueAttachments,
  useAttachmentUpload,
} from "./IssueAttachments";
import { IssueActivityTabs } from "./IssueActivityTabs";
import { LogWorkDialog } from "./IssueTimeTracking";
import { IssueHrefProvider, useIssueHref } from "./issueLinks";
import { selectedIssueHref } from "./selectedIssue";
import type { Worklog } from "./types";
import { isEpicLevel, isSubtaskLevel } from "../../data/workflow";

export type IssueViewVariant = "page" | "modal" | "panel";

function isEditableElement(element: Element) {
  const html = element as HTMLElement;
  return (
    html.tagName === "INPUT" ||
    html.tagName === "TEXTAREA" ||
    html.tagName === "SELECT" ||
    html.isContentEditable ||
    Boolean(element.closest("[contenteditable='true'], [role='listbox']"))
  );
}

function fullPageHref(issueId: string) {
  return `/issues/${encodeURIComponent(issueId)}`;
}

function TitleEditor({
  issue,
  readOnly,
  controller,
  draft,
  setDraft,
}: {
  issue: Issue;
  readOnly: boolean;
  controller: IssueDetailController;
  /** Lifted so the `e` shortcut can start editing. */
  draft: string | null;
  setDraft: (draft: string | null) => void;
}) {
  if (draft === null) {
    return readOnly ? (
      <h1 className="issue-title">{issue.title}</h1>
    ) : (
      <h1 className="issue-title">
        <button
          className="issue-title-button"
          type="button"
          title="Edit summary"
          onClick={() => setDraft(issue.title)}
        >
          {issue.title}
        </button>
      </h1>
    );
  }

  const save = async () => {
    const next = draft.trim();
    if (next === issue.title) {
      setDraft(null);
      return;
    }
    if (next.length < 4) {
      controller.setActionError("Use at least 4 characters for the summary.");
      return;
    }
    if (await controller.patch({ title: next })) setDraft(null);
  };

  return (
    <form
      className="detail-title-field issue-title-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        <span className="sr-only">Issue summary</span>
        <input
          value={draft}
          maxLength={255}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setDraft(null);
            }
          }}
        />
      </label>
      <button className="icon-button" type="submit" aria-label="Save summary">
        <Check size={15} aria-hidden="true" />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="Cancel editing summary"
        onClick={() => setDraft(null)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </form>
  );
}

function DescriptionSection({
  issue,
  readOnly,
  controller,
  onUploadImages,
}: {
  issue: Issue;
  readOnly: boolean;
  controller: IssueDetailController;
  onUploadImages?: ImageUploader;
}) {
  const { members } = useIssues();
  const [draft, setDraft] = useState<string | null>(null);
  const hasDescription = stripHtml(issue.description).length > 0;
  const draftLength = draft === null ? 0 : stripHtml(draft).length;
  // Jira allows an empty description; a written one must be meaningful.
  const canSave = draft !== null && (draftLength === 0 || draftLength >= 12);

  return (
    <section className="issue-section issue-description">
      <div className="issue-section-header">
        <h2>Description</h2>
        {!readOnly && draft === null && hasDescription && (
          <button
            className="icon-button"
            type="button"
            aria-label="Edit description"
            title="Edit description"
            onClick={() => setDraft(issue.description)}
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {draft !== null ? (
        <div className="detail-description-field">
          <RichTextEditor
            value={draft}
            onChange={setDraft}
            members={members}
            autoFocus
            onUploadImages={onUploadImages}
            placeholder="Add a description… Type @ to mention someone. Paste or drop images."
          />
          {draftLength > 0 && draftLength < 12 && (
            <p className="field-meta">
              Add a little more detail (at least 12 characters), or leave it
              empty.
            </p>
          )}
          <div className="issue-comment-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!canSave}
              onClick={async () => {
                if (await controller.patch({ description: draft })) {
                  setDraft(null);
                }
              }}
            >
              Save
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : hasDescription ? (
        <div
          className={`issue-description-view${readOnly ? "" : " is-editable"}`}
          onClick={(event) => {
            if (readOnly) return;
            if ((event.target as Element).closest("a, img, input")) return;
            setDraft(issue.description);
          }}
        >
          <DescriptionView value={issue.description} />
        </div>
      ) : readOnly ? (
        <p className="issue-field-empty">None</p>
      ) : (
        <button
          className="issue-description-placeholder"
          type="button"
          onClick={() => setDraft("")}
        >
          Add a description…
        </button>
      )}
    </section>
  );
}

function Breadcrumb({
  issue,
  compact,
}: {
  issue: Issue;
  compact: boolean;
}) {
  const { issues } = useIssues();
  const { projects } = useProjects();
  const project = projects.find((candidate) => candidate.id === issue.projectId);
  const parentInList = issue.parent
    ? issues.find((candidate) => candidate.id === issue.parent?.id)
    : null;
  const grandparent = parentInList?.parent ?? null;
  const parentHref = useIssueHref();

  return (
    <nav className="issue-breadcrumb" aria-label="Breadcrumb">
      {!compact && (
        <>
          <Link href="/projects">Projects</Link>
          <span aria-hidden="true">/</span>
          <Link href={project ? `/projects/${project.id}` : "/issues"}>
            {project?.name ?? "Issues"}
          </Link>
          <span aria-hidden="true">/</span>
        </>
      )}
      {grandparent && !compact && (
        <>
          <Link href={parentHref(grandparent.id)}>
            <KindIcon kind={grandparent.kind} projectId={issue.projectId} />
            {grandparent.id}
          </Link>
          <span aria-hidden="true">/</span>
        </>
      )}
      {issue.parent && (
        <>
          <Link href={parentHref(issue.parent.id)}>
            <KindIcon kind={issue.parent.kind} projectId={issue.projectId} />
            {issue.parent.id}
          </Link>
          <span aria-hidden="true">/</span>
        </>
      )}
      <span className="issue-breadcrumb-current">
        <KindIcon kind={issue.kind} projectId={issue.projectId} />
        {issue.id}
      </span>
      {issue.flagged && (
        <span className="issue-flag-badge">
          <Flag size={12} aria-hidden="true" />
          Flagged
        </span>
      )}
    </nav>
  );
}

export function IssueDetailView({
  issue,
  controller,
  variant = "page",
  onClose,
}: {
  issue: Issue;
  controller: IssueDetailController;
  variant?: IssueViewVariant;
  onClose?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { issues, labels, cycles, members, removeIssue } = useIssues();
  const { projects } = useProjects();
  const { data: session } = authClient.useSession();
  const { data: activeMember } = authClient.useActiveMember();
  const role = activeMember?.role ?? "viewer";
  const readOnly = role === "viewer";
  const isOwner = role === "owner";
  const currentUserId = session?.user.id ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [childComposerOpen, setChildComposerOpen] = useState(false);
  const [linkComposerOpen, setLinkComposerOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [worklogDialog, setWorklogDialog] = useState<{
    worklog: Worklog | null;
  } | null>(null);
  const { upload, isUploading } = useAttachmentUpload(issue, controller);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const memberId = activeMember?.id ?? null;

  /** Pasted/dropped editor images become issue attachments. */
  const uploadImages: ImageUploader = useCallback(
    async (files) => {
      const created = await upload(files, { throwOnError: true });
      return created
        .filter((attachment) => INLINE_TYPES.includes(attachment.mimeType))
        .map((attachment) => ({ src: attachment.url, alt: attachment.name }));
    },
    [upload],
  );

  const imageAttachments: LightboxImage[] = controller.attachments
    .filter((attachment) => INLINE_TYPES.includes(attachment.mimeType))
    .map((attachment) => ({ src: attachment.url, name: attachment.name }));

  const openLightbox = (image: LightboxImage) => {
    const inline = [
      ...(rootRef.current?.querySelectorAll<HTMLImageElement>(
        ".rich-text-view img",
      ) ?? []),
    ].map((element) => ({
      src: element.getAttribute("src") ?? "",
      name: element.getAttribute("alt") || "Image",
    }));
    const all = [...imageAttachments];
    for (const candidate of inline) {
      if (candidate.src && !all.some((item) => item.src === candidate.src)) {
        all.push(candidate);
      }
    }
    setLightbox(withImage(all, image));
  };

  useEffect(() => {
    if (!shortcutToast) return;
    const timeout = window.setTimeout(() => setShortcutToast(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [shortcutToast]);

  const { remoteUpdate, dismissRemoteUpdate } = controller;
  useEffect(() => {
    if (!remoteUpdate) return;
    const timeout = window.setTimeout(dismissRemoteUpdate, 5000);
    return () => window.clearTimeout(timeout);
  }, [remoteUpdate, dismissRemoteUpdate]);

  const inPlace = variant !== "page";
  const issueHref = useCallback(
    (issueId: string) =>
      inPlace
        ? selectedIssueHref(pathname, searchParams, issueId)
        : fullPageHref(issueId),
    [inPlace, pathname, searchParams],
  );

  const project = projects.find((candidate) => candidate.id === issue.projectId);
  const canDelete =
    !readOnly && (isOwner || issue.creator?.id === currentUserId);
  const isPanel = variant === "panel";

  const transition = (status: IssueStatus, resolution?: IssueResolution) =>
    void controller.patch(resolution ? { status, resolution } : { status });

  const scrollToSection = (id: string) =>
    window.setTimeout(
      () =>
        rootRef.current
          ?.querySelector(`#${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );

  const openChildComposer = () => {
    setChildComposerOpen(true);
    scrollToSection("issue-children");
  };

  const openLinkComposer = () => {
    setLinkComposerOpen(true);
    scrollToSection("issue-links");
  };

  const navigateTo = (issueId: string) => {
    if (inPlace) {
      router.replace(selectedIssueHref(pathname, searchParams, issueId), {
        scroll: false,
      });
    } else {
      router.replace(fullPageHref(issueId));
    }
  };

  const handleDeleted = () => {
    removeIssue(issue.id);
    if (!inPlace) {
      router.push(project ? `/projects/${project.id}` : "/issues");
    } else if (onClose) {
      onClose();
    } else {
      router.replace(selectedIssueHref(pathname, searchParams, null), {
        scroll: false,
      });
    }
  };

  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const dropHandlers = readOnly
    ? {}
    : {
        onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          if (!isDragging) setIsDragging(true);
        },
        onDragLeave: (event: React.DragEvent<HTMLDivElement>) => {
          const next = event.relatedTarget as Node | null;
          if (!next || !event.currentTarget.contains(next)) {
            setIsDragging(false);
          }
        },
        onDrop: (event: React.DragEvent<HTMLDivElement>) => {
          setIsDragging(false);
          // The rich-text editor already took dropped images inline.
          if (!hasFiles(event) || event.defaultPrevented) return;
          event.preventDefault();
          void upload(event.dataTransfer.files);
        },
      };

  const toggleWatch = async () => {
    if (!currentUserId) return;
    const watching = (issue.watcherIds ?? []).includes(currentUserId);
    const response = await controller.run(() =>
      apiRequest<{ issue: Issue }>(issueUrl(issue.id, "/watchers"), {
        method: watching ? "DELETE" : "POST",
        body: JSON.stringify({}),
      }),
    );
    if (response) {
      controller.applyIssue(response.issue);
      setShortcutToast(
        watching ? "You stopped watching this issue" : "You're watching this issue",
      );
    }
  };

  const assignToMe = async (toggle: boolean) => {
    if (!memberId) return;
    const mine = issue.assignee?.id === memberId;
    if (mine && !toggle) {
      setShortcutToast(`${issue.id} is already assigned to you`);
      return;
    }
    const next = mine ? null : memberId;
    if (await controller.patch({ assigneeId: next })) {
      setShortcutToast(next ? `Assigned ${issue.id} to you` : `Unassigned ${issue.id}`);
    }
  };

  const goToAdjacent = (delta: 1 | -1) => {
    const nextId = adjacentIssueId(resolveIssueOrder(issue.id), issue.id, delta);
    if (nextId) navigateTo(nextId);
    else setShortcutToast(delta === 1 ? "This is the last issue" : "This is the first issue");
  };

  // Jira issue-view shortcuts (see the ? dialog). Capture phase so the global
  // handler (which also binds `i` on /issues/KEY) sees them as handled.
  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    shortcutRef.current = (event: KeyboardEvent) => {
      const handlers: Record<string, () => void> = {
        j: () => goToAdjacent(1),
        k: () => goToAdjacent(-1),
        s: () => {
          void copyIssueLink(issue.id);
          setShareOpen(true);
        },
        ".": () => setMoreMenuOpen(true),
        ...(readOnly
          ? {}
          : {
              e: () => setTitleDraft(issue.title),
              i: () => void assignToMe(false),
              a: () => void assignToMe(true),
              w: () => void toggleWatch(),
            }),
      };
      const handler = handlers[event.key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
  });
  useEffect(() => {
    let lastG = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const root = rootRef.current;
      if (!root) return;
      const target = event.target instanceof Element ? event.target : document.body;
      if (isEditableElement(target)) return;
      // Only the topmost issue view reacts (not one under a modal/popover).
      const ownDialog = root.closest("[role='dialog']");
      if (target.closest("[role='dialog'], [role='menu']") !== ownDialog) return;
      if (!ownDialog && document.querySelector("[data-issue-modal]")) return;
      if (document.querySelector(".command-palette")) return;
      // `g` starts a global "go to" sequence; leave its second key alone.
      if (event.key === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 1200) {
        lastG = 0;
        return;
      }
      shortcutRef.current(event);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const actions = (
    <div className="issue-view-actions">
      <WatchButton
        issue={issue}
        currentUserId={currentUserId}
        members={members}
        canManageOthers={!readOnly}
        controller={controller}
      />
      <VoteButton
        issue={issue}
        currentUserId={currentUserId}
        controller={controller}
      />
      <IssueSharePopover
        issueId={issue.id}
        members={members}
        currentMemberId={memberId}
        compact={inPlace}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
      <IssueMoreMenu
        issue={issue}
        canEdit={!readOnly}
        canDelete={canDelete}
        controller={controller}
        onNavigate={navigateTo}
        onDeleted={handleDeleted}
        menuOpen={moreMenuOpen}
        onMenuOpenChange={setMoreMenuOpen}
      />
      {inPlace && (
        <Link
          className="icon-button issue-view-icon"
          href={fullPageHref(issue.id)}
          aria-label="Open in full page"
          title="Open in full page"
        >
          <Maximize2 size={15} aria-hidden="true" />
        </Link>
      )}
      {inPlace && onClose && (
        <button
          className="icon-button issue-view-icon"
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const quickAdd = !readOnly && (
    <div className="issue-quick-add">
      <button
        className="secondary-button issue-toolbar-button"
        type="button"
        title="Attach"
        onClick={() => fileInputRef.current?.click()}
      >
        <Paperclip size={15} aria-hidden="true" />
        <span>Attach</span>
      </button>
      {!isSubtaskLevel(issue.kind) && (
        <button
          className="secondary-button issue-toolbar-button"
          type="button"
          title={isEpicLevel(issue.kind) ? "Add child issue" : "Add subtask"}
          onClick={openChildComposer}
        >
          <GitBranchPlus size={15} aria-hidden="true" />
          <span>{isEpicLevel(issue.kind) ? "Add child issue" : "Add subtask"}</span>
        </button>
      )}
      <button
        className="secondary-button issue-toolbar-button"
        type="button"
        title="Link issue"
        onClick={openLinkComposer}
      >
        <Link2 size={15} aria-hidden="true" />
        <span>Link issue</span>
      </button>
      {isUploading && (
        <span className="field-meta issue-uploading" role="status">
          <LoaderCircle size={13} aria-hidden="true" />
          Uploading…
        </span>
      )}
    </div>
  );

  const errorBanner = controller.actionError && (
    <p className="form-submit-error issue-view-error" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {controller.actionError}
      <button
        className="text-button"
        type="button"
        onClick={() => controller.setActionError(null)}
      >
        Dismiss
      </button>
    </p>
  );

  const heading = (
    <>
      <TitleEditor
        issue={issue}
        readOnly={readOnly}
        controller={controller}
        draft={titleDraft}
        setDraft={setTitleDraft}
      />
      {quickAdd}
      {errorBanner}
    </>
  );

  const description = (
    <DescriptionSection
      key={issue.description}
      issue={issue}
      readOnly={readOnly}
      controller={controller}
      onUploadImages={readOnly ? undefined : uploadImages}
    />
  );

  const relations = (
    <>
      <IssueAttachments
        attachments={controller.attachments}
        readOnly={readOnly}
        currentUserId={currentUserId}
        isOwner={isOwner}
        onAttach={() => fileInputRef.current?.click()}
        onPreview={(attachment) =>
          openLightbox({ src: attachment.url, name: attachment.name })
        }
        controller={controller}
      />
      <ChildIssuesSection
        issue={issue}
        readOnly={readOnly}
        composerOpen={childComposerOpen}
        setComposerOpen={setChildComposerOpen}
        controller={controller}
      />
      <LinkedIssuesSection
        issue={issue}
        allIssues={issues}
        readOnly={readOnly}
        composerOpen={linkComposerOpen}
        setComposerOpen={setLinkComposerOpen}
        controller={controller}
      />
    </>
  );

  const activity = (
    <IssueActivityTabs
      issue={issue}
      worklogs={controller.worklogs}
      members={members}
      currentUserId={currentUserId}
      currentUserName={session?.user.name ?? null}
      readOnly={readOnly}
      isOwner={isOwner}
      controller={controller}
      onEditWorklog={(worklog) => setWorklogDialog({ worklog })}
      onUploadImages={readOnly ? undefined : uploadImages}
    />
  );

  const status = (
    <div className="issue-view-status">
      <StatusTransitionButton
        issue={issue}
        disabled={readOnly}
        onTransition={transition}
      />
    </div>
  );

  const details = (
    <IssueDetailsPanel
      issue={issue}
      allIssues={issues}
      labels={labels}
      cycles={cycles}
      members={members}
      currentMemberId={activeMember?.id ?? null}
      readOnly={readOnly}
      controller={controller}
      onLogWork={() => setWorklogDialog({ worklog: null })}
    />
  );

  const body = isPanel ? (
    <div className="issue-view-stack">
      {heading}
      {status}
      {details}
      <IssueMetaFooter issue={issue} />
      {description}
      {relations}
      {activity}
    </div>
  ) : (
    <div className="issue-view-columns">
      <div className="issue-view-main">
        {heading}
        {description}
        {relations}
        {activity}
      </div>
      <div className="issue-view-side">
        {status}
        {details}
        <IssueMetaFooter issue={issue} />
      </div>
    </div>
  );

  const className = [
    "issue-view",
    `issue-view--${variant}`,
    variant === "page" ? "page detail-page" : "",
    isDragging ? "is-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <IssueHrefProvider value={issueHref}>
      <div
        className={className}
        ref={rootRef}
        {...dropHandlers}
        onClickCapture={(event) => {
          const target = event.target as Element;
          if (target.tagName !== "IMG" || !target.closest(".rich-text-view")) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          openLightbox({
            src: target.getAttribute("src") ?? "",
            name: target.getAttribute("alt") || "Image",
          });
        }}
      >
        <div className="issue-view-topbar">
          <Breadcrumb issue={issue} compact={isPanel} />
          {actions}
        </div>
        {variant === "page" ? (
          body
        ) : (
          <div className="issue-view-scroll">{body}</div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = "";
          }}
        />

        {isDragging && (
          <div className="issue-drop-overlay" aria-hidden="true">
            <Upload size={22} />
            <span>Drop files to attach</span>
          </div>
        )}

        {lightbox && (
          <ImageLightbox
            images={lightbox.images}
            index={lightbox.index}
            onIndexChange={(index) =>
              setLightbox((current) => (current ? { ...current, index } : null))
            }
            onClose={() => setLightbox(null)}
          />
        )}

        {(remoteUpdate || shortcutToast) && (
          <div className="issue-live-toast" role="status" aria-live="polite">
            {remoteUpdate ? (
              <>
                <RefreshCcw size={13} aria-hidden="true" />
                <span>
                  Updated by {remoteUpdate.actorName ?? "a teammate"}
                </span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Dismiss"
                  onClick={dismissRemoteUpdate}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </>
            ) : (
              <span>{shortcutToast}</span>
            )}
          </div>
        )}

        {worklogDialog && (
          <LogWorkDialog
            issue={issue}
            worklog={worklogDialog.worklog}
            controller={controller}
            onClose={() => setWorklogDialog(null)}
          />
        )}
      </div>
    </IssueHrefProvider>
  );
}

function IssueUnavailable({
  issueId,
  variant,
  message,
  onClose,
}: {
  issueId: string;
  variant: IssueViewVariant;
  message?: string;
  onClose?: () => void;
}) {
  const title = message ? "Issue could not be loaded" : "Issue not found";
  const detail =
    message ??
    "This issue may have been removed or belongs to a different workspace.";

  if (variant === "page") {
    return (
      <div className="page detail-page">
        <Link className="back-link" href="/issues">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to issues
        </Link>
        <section className="detail-empty">
          <span>{issueId || "Unknown issue"}</span>
          <h1>{title}</h1>
          <p>{detail}</p>
          <Link className="primary-button" href="/issues">
            View all issues
          </Link>
        </section>
      </div>
    );
  }

  return (
    <IssueFrame issueId={issueId} variant={variant} onClose={onClose}>
      <div className="issue-view-state">
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </IssueFrame>
  );
}

/** Minimal modal/panel chrome for loading and missing states. */
function IssueFrame({
  issueId,
  variant,
  onClose,
  children,
}: {
  issueId: string;
  variant: IssueViewVariant;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`issue-view issue-view--${variant}`}>
      <div className="issue-view-topbar">
        <nav className="issue-breadcrumb" aria-label="Breadcrumb">
          <span className="issue-breadcrumb-current">{issueId}</span>
        </nav>
        {onClose && (
          <div className="issue-view-actions">
            <button
              className="icon-button issue-view-icon"
              type="button"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="issue-view-scroll">{children}</div>
    </div>
  );
}

function IssueDetailLoader({
  issueId,
  variant,
  onClose,
}: {
  issueId: string;
  variant: IssueViewVariant;
  onClose?: () => void;
}) {
  const controller = useIssueDetail(issueId);
  const { state } = controller;

  if (state.status === "loading") {
    if (variant === "page") return <WorkspaceLoading label="issue" />;
    return (
      <IssueFrame issueId={issueId} variant={variant} onClose={onClose}>
        <div className="workspace-loading" role="status" aria-live="polite">
          <LoaderCircle size={20} aria-hidden="true" />
          <span>Loading issue</span>
        </div>
      </IssueFrame>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <IssueUnavailable
        issueId={issueId}
        variant={variant}
        message={state.status === "error" ? state.message : undefined}
        onClose={onClose}
      />
    );
  }
  return (
    <IssueDetailView
      issue={state.issue}
      controller={controller}
      variant={variant}
      onClose={onClose}
    />
  );
}

/**
 * The one entry point other areas use: loads the issue and renders the Jira
 * issue view as a full page, a modal body, or a narrow side panel.
 */
export function IssueDetailContainer({
  issueId,
  variant,
  onClose,
}: {
  issueId: string;
  variant: IssueViewVariant;
  onClose?: () => void;
}) {
  return (
    <IssueDetailLoader
      key={issueId}
      issueId={issueId}
      variant={variant}
      onClose={onClose}
    />
  );
}
