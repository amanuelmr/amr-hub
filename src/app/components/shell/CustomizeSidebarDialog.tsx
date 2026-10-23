"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowUp, Eye, EyeOff, X } from "lucide-react";
import {
  DEFAULT_SIDEBAR_PREFS,
  SIDEBAR_ITEMS,
  type SidebarItemKey,
  type SidebarPrefs,
} from "./useSidebarPrefs";

const LABELS = Object.fromEntries(SIDEBAR_ITEMS.map((item) => [item.key, item.label])) as Record<
  SidebarItemKey,
  string
>;

/** Choose which sidebar items show and in what order. */
export function CustomizeSidebarDialog({
  prefs,
  onSave,
  onClose,
}: {
  prefs: SidebarPrefs;
  onSave: (next: SidebarPrefs) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(prefs);

  const move = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const order = [...current.order];
      const swap = index + direction;
      if (swap < 0 || swap >= order.length) return current;
      [order[index], order[swap]] = [order[swap], order[index]];
      return { ...current, order };
    });

  const toggle = (key: SidebarItemKey) =>
    setDraft((current) => ({
      ...current,
      hidden: current.hidden.includes(key)
        ? current.hidden.filter((hidden) => hidden !== key)
        : [...current.hidden, key],
    }));

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="planning-dialog-overlay" />
        <Dialog.Content className="save-view-dialog planning-dialog customize-sidebar-dialog">
          <header>
            <Dialog.Title asChild>
              <h2>Customize your sidebar</h2>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description>
            Show, hide and reorder what appears in your sidebar. &quot;For you&quot; always stays at
            the top. This only changes your own sidebar.
          </Dialog.Description>
          <ol className="customize-sidebar-list">
            {draft.order.map((key, index) => {
              const hidden = draft.hidden.includes(key);
              return (
                <li key={key} className={hidden ? "is-hidden" : undefined}>
                  <span className="customize-sidebar-name">{LABELS[key]}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={hidden ? `Show ${LABELS[key]}` : `Hide ${LABELS[key]}`}
                    aria-pressed={!hidden}
                    title={hidden ? "Show in sidebar" : "Hide from sidebar"}
                    onClick={() => toggle(key)}
                  >
                    {hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${LABELS[key]} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${LABELS[key]} down`}
                    disabled={index === draft.order.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
          <footer className="filter-details-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setDraft(DEFAULT_SIDEBAR_PREFS)}
            >
              Reset to default
            </button>
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
            >
              Save
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
