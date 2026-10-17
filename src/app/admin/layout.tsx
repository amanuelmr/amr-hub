import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "../components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Workspace settings",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
