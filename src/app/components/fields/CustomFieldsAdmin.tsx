"use client";

import { AdminHeader } from "../admin/AdminShell";
import { useAdminRole } from "../admin/adminClient";
import { CustomFieldManager } from "./CustomFieldManager";

/** Workspace settings > Custom fields: global fields (owners edit, others view). */
export function CustomFieldsAdmin() {
  const { isOwner, isLoading } = useAdminRole();
  return (
    <>
      <AdminHeader
        title="Custom fields"
        description="Add fields to work items in every project. Project admins can add project-only fields in project settings."
      />
      {isLoading ? (
        <p className="admin-muted">Checking your permissions…</p>
      ) : (
        <>
          {!isOwner && (
            <p className="admin-muted">Only workspace owners can change global fields.</p>
          )}
          <CustomFieldManager scope="global" readOnly={!isOwner} />
        </>
      )}
    </>
  );
}
