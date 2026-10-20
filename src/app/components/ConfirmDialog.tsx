"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/** An in-app confirmation (never window.confirm). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = true,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [isWorking, setIsWorking] = useState(false);
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
          <Dialog.Description>{body}</Dialog.Description>
          <footer className="filter-details-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className={danger ? "danger-button" : "primary-button"}
              type="button"
              disabled={isWorking}
              onClick={async () => {
                setIsWorking(true);
                try {
                  await onConfirm();
                } finally {
                  setIsWorking(false);
                }
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
