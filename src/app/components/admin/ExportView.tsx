"use client";

import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminHeader, AdminNotice } from "./AdminShell";
import { adminRequest } from "./adminClient";

type ProjectOption = { id: string; key: string; name: string; issueCount?: number };

export function ExportView() {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"csv" | "json" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    adminRequest<ProjectOption[]>("/api/projects")
      .then(setProjects)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const download = async (format: "csv" | "json") => {
    setBusy(format);
    setError(null);
    setDone(null);
    try {
      const params = new URLSearchParams({ format });
      if (projectId) params.set("projectId", projectId);
      const response = await fetch(`/api/admin/export?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "The export could not be generated");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `amr-hub-export.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDone(`Downloaded ${fileName}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const selected = projects?.find((project) => project.id === projectId);

  return (
    <>
      <AdminHeader
        title="Export"
        description="Download work items for backup, reporting or migration. CSV includes every standard field; JSON also includes comments and work logs."
      />
      <div className="admin-stack">
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        {done && <AdminNotice tone="success">{done}</AdminNotice>}
        <section className="admin-card admin-form">
          <label className="form-field">
            <span>What to export</span>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={!projects}
            >
              <option value="">All projects</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.key})
                </option>
              ))}
            </select>
          </label>
          <p className="admin-muted">
            {selected
              ? `Exports ${selected.issueCount ?? "all"} work items from ${selected.name}.`
              : "Exports every work item you can see in this workspace. Items in the trash are skipped."}
          </p>
          <div className="admin-export-options">
            <button
              type="button"
              className="admin-export-option"
              onClick={() => download("csv")}
              disabled={busy !== null}
            >
              <FileSpreadsheet size={22} aria-hidden="true" />
              <span>
                <strong>CSV</strong>
                <span className="admin-muted">
                  Opens in spreadsheets. Re-importable with Import issues from CSV.
                </span>
              </span>
              <Download size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="admin-export-option"
              onClick={() => download("json")}
              disabled={busy !== null}
            >
              <FileJson size={22} aria-hidden="true" />
              <span>
                <strong>JSON</strong>
                <span className="admin-muted">
                  Full fidelity: projects, sprints, versions, issues, comments and work logs.
                </span>
              </span>
              <Download size={16} aria-hidden="true" />
            </button>
          </div>
          {busy && <p className="admin-muted" role="status">Preparing {busy.toUpperCase()} export…</p>}
        </section>
      </div>
    </>
  );
}
