import type { Metadata } from "next";
import { AuditLogView } from "../../components/admin/AuditLogView";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLogPage() {
  return <AuditLogView />;
}
