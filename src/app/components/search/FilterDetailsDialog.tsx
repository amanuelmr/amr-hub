"use client";

import { FormEvent, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { FilterShare } from "../../data/filters";
import { ShareEditor, useShareDirectory } from "./ShareEditor";
import type { FilterInput } from "./useFilters";

/**
 * Jira's "Save filter" / "Edit filter details" dialog: name, description,
 * and who can view or edit the filter.
 */
export function FilterDetailsDialog({
  title,
  submitLabel,
  initial,
  jqlPreview,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial: { name: string; description: string | null; viewers: FilterShare[]; editors: FilterShare[] };
  /** Shown read-only so people know what they are saving. */
  jqlPreview?: string;
  onClose: () => void;
  onSubmit: (input: Omit<FilterInput, "jql">) => Promise<void>;
}) {
  const directory = useShareDirectory();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [viewers, setViewers] = useState(initial.viewers);
  const [editors, setEditors] = useState(initial.editors);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Give the filter a name of at least 2 characters.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        viewers,
        editors,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The filter could not be saved");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="save-view-dialog planning-dialog filter-details-dialog">
          <header>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">
            Name the filter and choose who can view and edit it.
          </Dialog.Description>
          <form onSubmit={submit} className="filter-details-form">
            <label className="form-field">
              <span>Name *</span>
              <input
                value={name}
                maxLength={255}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Description</span>
              <textarea
                value={description}
                rows={2}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <ShareEditor
              label="Viewers"
              shares={viewers}
              onChange={setViewers}
              directory={directory}
              emptyText="Private: only you can see this filter."
            />
            <ShareEditor
              label="Editors"
              shares={editors}
              onChange={setEditors}
              directory={directory}
              emptyText="Only you can edit this filter."
            />
            {jqlPreview !== undefined && (
              <div className="search-jql-preview">
                <span>JQL</span>
                <code>{jqlPreview || "ORDER BY created DESC"}</code>
              </div>
            )}
            {error && (
              <p className="form-submit-error" role="alert">
                {error}
              </p>
            )}
            <footer className="filter-details-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : submitLabel}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
