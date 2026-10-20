"use client";

import { applicableFields, type CustomFieldValue } from "../../data/customFields";
import type { Issue, IssueUpdates, WorkspaceMember } from "../../data/issues";
import { CustomFieldInput } from "./CustomFieldInput";
import { useCustomFields } from "./customFieldStore";

/**
 * The custom fields that apply to an issue (its project and work type), as
 * rows in the Details panel with inline editors. Empty values show "None".
 */
export function IssueCustomFields({
  issue,
  members,
  readOnly,
  onUpdate,
}: {
  issue: Issue;
  members: WorkspaceMember[];
  readOnly: boolean;
  onUpdate: (updates: IssueUpdates) => void;
}) {
  const { fields } = useCustomFields();
  const visible = applicableFields(fields, issue.projectId, issue.kind);
  if (visible.length === 0) return null;

  const values = issue.customFields ?? {};
  const commit = (fieldId: string, value: CustomFieldValue | null) =>
    onUpdate({ customFields: { [fieldId]: value } });

  return (
    <div className="cf-details-group" role="group" aria-label="Custom fields">
      <p className="cf-details-heading">Custom fields</p>
      {visible.map((field) => (
        <div className="issue-property cf-property" key={field.id}>
          <span title={field.description ?? undefined}>
            {field.name}
            {field.required && (
              <span className="create-issue-required" aria-label="required">
                {" "}*
              </span>
            )}
          </span>
          <div>
            <CustomFieldInput
              key={`${field.id}-${JSON.stringify(values[field.id] ?? null)}`}
              field={field}
              value={values[field.id]}
              members={members}
              disabled={readOnly}
              inline
              onChange={(value) => commit(field.id, value)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
