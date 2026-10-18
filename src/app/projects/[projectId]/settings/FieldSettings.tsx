"use client";

import Link from "next/link";
import { CustomFieldManager } from "../../../components/fields/CustomFieldManager";

/** Project settings > Fields: the project's own custom fields. */
export function FieldSettings({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  return (
    <div className="cf-project-settings">
      <CustomFieldManager scope={{ projectId }} readOnly={readOnly} />
      <p className="pa-muted cf-global-hint">
        Fields used across every project are managed in{" "}
        <Link href="/admin/fields">workspace settings</Link>.
      </p>
    </div>
  );
}
