"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  Download,
  KeyRound,
  ListPlus,
  ScrollText,
  Trash2,
  Upload,
  Webhook,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAdminRole } from "./adminClient";

const NAV = [
  { href: "/admin", label: "General", icon: Building2, ownerOnly: false },
  { href: "/admin/fields", label: "Custom fields", icon: ListPlus, ownerOnly: false },
  { href: "/admin/audit-log", label: "Audit log", icon: ScrollText, ownerOnly: true },
  { href: "/admin/api-tokens", label: "API tokens", icon: KeyRound, ownerOnly: false },
  { href: "/admin/api-docs", label: "REST API", icon: BookOpen, ownerOnly: false },
  { href: "/admin/webhooks", label: "Webhooks", icon: Webhook, ownerOnly: true },
  { href: "/admin/import", label: "Import", icon: Upload, ownerOnly: false },
  { href: "/admin/export", label: "Export", icon: Download, ownerOnly: false },
  { href: "/admin/trash", label: "Trash", icon: Trash2, ownerOnly: true },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isOwner } = useAdminRole();

  return (
    <div className="page admin-page">
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Workspace settings">
          <p className="admin-nav-title">Workspace settings</p>
          <ul>
            {NAV.filter((item) => !item.ownerOnly || isOwner).map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="admin-nav-link"
                    data-active={active ? "true" : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={15} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}

export function AdminHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-header">
      <div>
        <p className="eyebrow">Workspace settings</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions && <div className="admin-header-actions">{actions}</div>}
    </header>
  );
}

/** Renders children for owners; a friendly explanation for everyone else. */
export function OwnerOnly({ what, children }: { what: string; children: ReactNode }) {
  const { isOwner, isLoading } = useAdminRole();
  if (isLoading) return <p className="admin-muted">Checking your permissions…</p>;
  if (!isOwner) {
    return (
      <div className="admin-empty" role="note">
        <h2>Owner access required</h2>
        <p>Only workspace owners can {what}. Ask an owner if you need access.</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function AdminNotice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info" | "warning";
  children: ReactNode;
}) {
  return (
    <div className="admin-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
