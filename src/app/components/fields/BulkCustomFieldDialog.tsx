"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  isEmptyFieldValue,
  type CustomFieldDefinition,
  type CustomFieldValue,
} from "../../data/customFields";
import type { WorkspaceMember } from "../../data/issues";
import { CustomFieldInput } from "./CustomFieldInput";

/** Bulk change: pick a value for one custom field (empty clears it). */
export function BulkCustomFieldDialog({
  field,
  count,
  members,
  onClose,
  onApply,
}: {
  field: CustomFieldDefinition | null;
  count: number;
  members: WorkspaceMember[];
  onClose: () => void;
  onApply: (field: CustomFieldDefinition, value: CustomFieldValue | null) => void;
}) {
  const [value, setValue] = useState<CustomFieldValue | null>(null);
  const clearing = isEmptyFieldValue(value);

  return (
    <Dialog.Root
      open={field !== null}
      onOpenChange={(open) => {
        if (!open) {
          setValue(null);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="save-view-dialog search-dialog cf-bulk-dialog">
          {field && (
            <>
              <Dialog.Title asChild>
                <h2>
                  Change {field.name} on {count} issue{count === 1 ? "" : "s"}
                </h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <p className="search-muted">
                  {field.description ||
                    "Issues where this field does not apply are skipped and reported."}
                </p>
              </Dialog.Description>
              <div className="form-field">
                <span>{field.name}</span>
                <CustomFieldInput
                  field={field}
                  value={value}
                  members={members}
                  onChange={setValue}
                />
              </div>
              {clearing && field.required && (
                <p className="field-error">{field.name} is required, so it cannot be cleared.</p>
              )}
              <footer>
                <Dialog.Close asChild>
                  <button className="secondary-button" type="button">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  className="primary-button"
                  type="button"
                  disabled={clearing && field.required}
                  onClick={() => {
                    onApply(field, value);
                    setValue(null);
                  }}
                >
                  {clearing ? "Clear value" : "Apply"}
                </button>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
