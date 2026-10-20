"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck, Upload } from "lucide-react";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  buildImportRows,
  distinctValues,
  guessColumnMapping,
  guessValue,
  orderRowsForImport,
  parseCsv,
  validateImportRow,
  type ColumnMapping,
  type ColumnTarget,
  type ImportFieldKey,
  type ImportOption,
  type ValueField,
  type ValueMappings,
} from "../../../server/csvImportCore";
import { AdminHeader, AdminNotice } from "./AdminShell";
import type { CustomFieldDefinition } from "../../data/customFields";
import { adminRequest, useAdminRole } from "./adminClient";

type ProjectContext = {
  project: { id: string; key: string; name: string };
  statuses: ImportOption[];
  kinds: ImportOption[];
  priorities: ImportOption[];
  sprints: Array<{ id: string; name: string }>;
  versions: Array<{ id: string; name: string }>;
  customFields: CustomFieldDefinition[];
  defaults: { status: string; kind: string; priority: string };
};

type ImportContext = {
  projects: Array<{ id: string; key: string; name: string }>;
  members: Array<{ id: string; name: string; email: string }>;
  project: ProjectContext | null;
};

type ImportResult = {
  created: number;
  failed: number;
  results: Array<{
    rowNumber: number;
    key: string | null;
    summary: string;
    errors: string[];
    warnings: string[];
  }>;
};

const STEPS = ["Upload", "Project", "Map fields", "Preview", "Import"] as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const VALUE_FIELDS: Array<{ field: ValueField; label: string; options: keyof ProjectContext }> = [
  { field: "kind", label: "Issue type", options: "kinds" },
  { field: "status", label: "Status", options: "statuses" },
  { field: "priority", label: "Priority", options: "priorities" },
];
const EMPTY_VALUE_MAPPINGS: ValueMappings = { status: {}, kind: {}, priority: {} };

export function ImportWizard() {
  const { isViewer } = useAdminRole();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [context, setContext] = useState<ImportContext | null>(null);
  const [projectId, setProjectId] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [valueMappings, setValueMappings] = useState<ValueMappings>(EMPTY_VALUE_MAPPINGS);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const headers = useMemo(() => table?.[0] ?? [], [table]);
  const dataRows = useMemo(() => table?.slice(1) ?? [], [table]);
  const project = context?.project?.project.id === projectId ? context.project : null;

  useEffect(() => {
    adminRequest<ImportContext>("/api/admin/import/context")
      .then(setContext)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const loadProject = async (id: string) => {
    setProjectId(id);
    if (!id) return;
    try {
      const loaded = await adminRequest<ImportContext>(
        `/api/admin/import/context?projectId=${encodeURIComponent(id)}`,
      );
      setContext(loaded);
      // Columns left unmapped may match this project's custom fields.
      const fields = loaded.project?.customFields ?? [];
      if (fields.length > 0 && headers.length > 0) {
        const guessed = guessColumnMapping(headers, fields);
        setMapping((current) =>
          current.map((target, index) => {
            const suggestion = guessed[index];
            if (target || !suggestion?.startsWith("cf:")) return target;
            return current.includes(suggestion) ? target : suggestion;
          }),
        );
      }
      setError(null);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const readFile = async (file: File) => {
    setError(null);
    setResult(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("The file is larger than 5 MB. Split it into smaller files.");
      return;
    }
    const parsed = parseCsv(await file.text());
    setFileName(file.name);
    setParseErrors(parsed.errors);
    if (parsed.rows.length < 2) {
      setTable(null);
      setError("The file needs a header row and at least one row of data.");
      return;
    }
    if (parsed.rows.length - 1 > MAX_IMPORT_ROWS) {
      setTable(null);
      setError(
        `The file has ${parsed.rows.length - 1} rows. Import at most ${MAX_IMPORT_ROWS} rows at a time.`,
      );
      return;
    }
    setTable(parsed.rows);
    setMapping(guessColumnMapping(parsed.rows[0], project?.customFields ?? []));
    setValueMappings(EMPTY_VALUE_MAPPINGS);
  };

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const columnsFor = (field: ImportFieldKey) =>
    mapping.flatMap((value, index) => (value === field ? [index] : []));

  // Distinct raw values per value field, with the current (or guessed) target.
  const valueRows = useMemo(() => {
    if (!project) return [];
    return VALUE_FIELDS.map(({ field, label, options }) => {
      const columns = mapping.flatMap((value, index) => (value === field ? [index] : []));
      const values = distinctValues(dataRows, columns).slice(0, 100);
      const optionList = project[options] as ImportOption[];
      return {
        field,
        label,
        options: optionList,
        defaultName:
          optionList.find((option) => option.key === project.defaults[field])?.name ??
          project.defaults[field],
        values: values.map((raw) => ({
          raw,
          target: valueMappings[field][raw] ?? guessValue(field, raw, optionList),
        })),
      };
    }).filter((entry) => entry.values.length > 0);
  }, [project, mapping, dataRows, valueMappings]);

  const effectiveValueMappings = useMemo(() => {
    const mappings: ValueMappings = { status: {}, kind: {}, priority: {} };
    for (const entry of valueRows) {
      for (const value of entry.values) mappings[entry.field][value.raw] = value.target;
    }
    return mappings;
  }, [valueRows]);

  const validated = useMemo(() => {
    if (!project || !table) return [];
    const rows = buildImportRows(dataRows, mapping, effectiveValueMappings).map((row) =>
      validateImportRow(row, {
        statuses: project.statuses,
        kinds: project.kinds,
        priorities: project.priorities,
        members: context?.members ?? [],
        sprints: project.sprints,
        customFields: project.customFields,
        defaults: project.defaults,
      }),
    );
    orderRowsForImport(rows);
    return rows;
  }, [project, table, dataRows, mapping, effectiveValueMappings, context?.members]);

  const errorCount = validated.filter((row) => row.errors.length > 0).length;
  const warningCount = validated.filter((row) => row.warnings.length > 0).length;
  const summaryMapped = mapping.includes("summary");

  const runImport = async () => {
    if (!project) return;
    setImporting(true);
    setError(null);
    try {
      const rows = buildImportRows(dataRows, mapping, effectiveValueMappings);
      setResult(
        await adminRequest<ImportResult>("/api/admin/import", {
          method: "POST",
          body: JSON.stringify({ projectId: project.project.id, rows }),
        }),
      );
      setStep(4);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(0);
    setTable(null);
    setFileName(null);
    setResult(null);
    setMapping([]);
    setValueMappings(EMPTY_VALUE_MAPPINGS);
    setParseErrors([]);
  };

  const canContinue =
    (step === 0 && Boolean(table)) ||
    (step === 1 && Boolean(project)) ||
    (step === 2 && summaryMapped) ||
    step === 3;

  if (isViewer) {
    return (
      <>
        <AdminHeader title="Import issues from CSV" description="Bring work in from Jira or a spreadsheet." />
        <div className="admin-empty">
          <h2>Viewers can’t import</h2>
          <p>Ask a workspace owner or member to import work items for you.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Import issues from CSV"
        description="Bring work in from Jira, another tracker or a spreadsheet. Map your columns to fields, check a preview, then create the issues."
      />
      <ol className="admin-steps" aria-label="Import progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            data-state={index === step ? "current" : index < step ? "done" : undefined}
            aria-current={index === step ? "step" : undefined}
          >
            <span className="admin-step-index">{index + 1}</span>
            <span className="admin-step-label">{label}</span>
          </li>
        ))}
      </ol>

      <div className="admin-stack">
        {error && <AdminNotice tone="error">{error}</AdminNotice>}

        {step === 0 && (
          <section className="admin-card">
            <label
              className="admin-dropzone"
              data-dragging={dragging ? "true" : undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <Upload size={22} aria-hidden="true" />
              <strong>{fileName ?? "Choose a CSV file or drop it here"}</strong>
              <span className="admin-muted">
                UTF-8, comma, semicolon or tab separated, first row as headers. Up to {MAX_IMPORT_ROWS} rows.
              </span>
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFileInput} className="sr-only" />
            </label>
            {parseErrors.map((message) => (
              <AdminNotice key={message} tone="warning">
                {message}. Check the file; the last row may be incomplete.
              </AdminNotice>
            ))}
            {table && (
              <p className="admin-muted">
                Found {headers.length} columns and {dataRows.length} rows in {fileName}.
              </p>
            )}
          </section>
        )}

        {step === 1 && (
          <section className="admin-card admin-form">
            <label className="form-field">
              <span>Import into project</span>
              <select value={projectId} onChange={(event) => void loadProject(event.target.value)}>
                <option value="">Select a project</option>
                {context?.projects.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.key})
                  </option>
                ))}
              </select>
            </label>
            {context && context.projects.length === 0 && (
              <p className="admin-muted">
                There are no projects yet. <Link href="/projects/new">Create a project</Link> first.
              </p>
            )}
            {project && (
              <p className="admin-muted">
                New issues get keys like {project.project.key}-123. Missing fix versions are created;
                missing labels are added to the workspace.
              </p>
            )}
          </section>
        )}

        {step === 2 && project && (
          <>
            <section className="admin-card">
              <h2>Map columns to fields</h2>
              <p className="admin-muted">
                We matched columns by their header. Columns set to “Don’t import” are ignored.
                Several columns can map to Labels.
              </p>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">CSV column</th>
                      <th scope="col">Example</th>
                      <th scope="col">Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((header, index) => (
                      <tr key={`${header}-${index}`}>
                        <td>
                          <strong>{header || `Column ${index + 1}`}</strong>
                        </td>
                        <td className="admin-muted admin-truncate">
                          {dataRows.find((row) => row[index]?.trim())?.[index] ?? "—"}
                        </td>
                        <td>
                          <select
                            className="admin-select"
                            aria-label={`Field for ${header}`}
                            value={mapping[index] ?? ""}
                            onChange={(event) =>
                              setMapping((current) => {
                                const next = [...current];
                                next[index] = event.target.value as ColumnTarget;
                                return next;
                              })
                            }
                          >
                            <option value="">Don’t import</option>
                            {IMPORT_FIELDS.map((field) => {
                              const takenElsewhere =
                                field.key !== "labels" &&
                                mapping.some((value, other) => other !== index && value === field.key);
                              return (
                                <option key={field.key} value={field.key} disabled={takenElsewhere}>
                                  {field.label}
                                  {"required" in field ? " *" : ""}
                                </option>
                              );
                            })}
                            {project && project.customFields.length > 0 && (
                              <optgroup label="Custom fields">
                                {project.customFields.map((field) => {
                                  const target: ColumnTarget = `cf:${field.id}`;
                                  return (
                                    <option
                                      key={field.id}
                                      value={target}
                                      disabled={mapping.some(
                                        (value, other) => other !== index && value === target,
                                      )}
                                    >
                                      {field.name}
                                      {field.required ? " *" : ""}
                                    </option>
                                  );
                                })}
                              </optgroup>
                            )}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!summaryMapped && (
                <AdminNotice tone="warning">Map a column to Summary to continue.</AdminNotice>
              )}
              {columnsFor("parentKey").length > 0 && columnsFor("issueId").length === 0 && (
                <p className="admin-muted">
                  Tip: map an “Issue id” column to link parents that are created in this same file.
                </p>
              )}
            </section>

            {valueRows.map((entry) => (
              <section key={entry.field} className="admin-card">
                <h2>{entry.label} values</h2>
                <p className="admin-muted">
                  Unmapped values use the project default ({entry.defaultName}).
                </p>
                <div className="admin-value-grid">
                  {entry.values.map((value) => (
                    <label key={value.raw} className="admin-value-row">
                      <span className="admin-truncate">{value.raw}</span>
                      <ArrowRight size={14} aria-hidden="true" />
                      <select
                        className="admin-select"
                        value={value.target}
                        onChange={(event) =>
                          setValueMappings((current) => ({
                            ...current,
                            [entry.field]: { ...current[entry.field], [value.raw]: event.target.value },
                          }))
                        }
                      >
                        <option value="">Default ({entry.defaultName})</option>
                        {entry.options.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        {step === 3 && project && (
          <section className="admin-card">
            <h2>Preview</h2>
            <p className="admin-muted">
              {validated.length} rows will be imported into {project.project.name}.{" "}
              {errorCount > 0 && <strong className="admin-error-text">{errorCount} with errors will be skipped. </strong>}
              {warningCount > 0 && <>{warningCount} have warnings. </>}
              The first 10 rows are shown{validated.length > 10 ? "; rows with problems further down are listed below" : ""}.
            </p>
            <PreviewTable
              rows={[
                ...validated.slice(0, 10),
                ...validated.slice(10).filter((row) => row.errors.length > 0).slice(0, 50),
              ]}
              project={project}
              members={context?.members ?? []}
            />
          </section>
        )}

        {step === 4 && result && (
          <section className="admin-card">
            <h2>
              <CircleCheck size={18} aria-hidden="true" /> Import finished
            </h2>
            <p>
              Created <strong>{result.created}</strong> issue{result.created === 1 ? "" : "s"}
              {result.failed > 0 && (
                <>
                  ; <strong className="admin-error-text">{result.failed}</strong> row
                  {result.failed === 1 ? "" : "s"} failed
                </>
              )}
              .
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Key</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((row) => (
                    <tr key={row.rowNumber} data-tone={row.key ? undefined : "danger"}>
                      <td className="admin-mono">{row.rowNumber}</td>
                      <td>
                        {row.key ? (
                          <Link className="admin-mono" href={`/issues/${row.key}`}>
                            {row.key}
                          </Link>
                        ) : (
                          <span className="admin-pill" data-tone="danger">Not created</span>
                        )}
                      </td>
                      <td>{row.summary || <span className="admin-muted">—</span>}</td>
                      <td>
                        <Messages errors={row.errors} warnings={row.warnings} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="admin-form-actions">
              <button type="button" className="secondary-button" onClick={reset}>
                Import another file
              </button>
              {project && (
                <Link className="primary-button" href={`/projects/${project.project.id}`}>
                  Open {project.project.name}
                </Link>
              )}
            </div>
          </section>
        )}

        {step < 4 && (
          <div className="admin-wizard-nav">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStep((value) => value - 1)}
              disabled={step === 0 || importing}
            >
              <ArrowLeft size={15} aria-hidden="true" /> Back
            </button>
            {step < 3 ? (
              <button
                type="button"
                className="primary-button"
                disabled={!canContinue}
                onClick={() => setStep((value) => value + 1)}
              >
                Next <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={importing || validated.length === errorCount}
                onClick={runImport}
              >
                {importing
                  ? `Importing ${validated.length - errorCount} issues…`
                  : `Import ${validated.length - errorCount} issue${validated.length - errorCount === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Messages({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (errors.length === 0 && warnings.length === 0) return <span className="admin-muted">—</span>;
  return (
    <ul className="admin-messages">
      {errors.map((message) => (
        <li key={`e-${message}`} data-tone="danger">
          {message}
        </li>
      ))}
      {warnings.map((message) => (
        <li key={`w-${message}`} data-tone="warning">
          {message}
        </li>
      ))}
    </ul>
  );
}

function PreviewTable({
  rows,
  project,
  members,
}: {
  rows: ReturnType<typeof validateImportRow>[];
  project: ProjectContext;
  members: Array<{ id: string; name: string }>;
}) {
  const name = (options: ImportOption[], key: string) =>
    options.find((option) => option.key === key)?.name ?? key;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Summary</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assignee</th>
            <th scope="col">Parent</th>
            <th scope="col">Checks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNumber} data-tone={row.errors.length ? "danger" : undefined}>
              <td className="admin-mono">{row.rowNumber}</td>
              <td>{row.summary || <span className="admin-muted">—</span>}</td>
              <td>{name(project.kinds, row.kind)}</td>
              <td>{name(project.statuses, row.status)}</td>
              <td>{name(project.priorities, row.priority)}</td>
              <td>{members.find((member) => member.id === row.assigneeId)?.name ?? "Unassigned"}</td>
              <td className="admin-mono">{row.parentRef ?? "—"}</td>
              <td>
                <Messages errors={row.errors} warnings={row.warnings} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
