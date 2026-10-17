import { describe, expect, it } from "vitest";
import {
  buildImportRows,
  detectDelimiter,
  guessColumnMapping,
  guessValue,
  normalizeDate,
  orderRowsForImport,
  parseCsv,
  plainTextToHtml,
  snapStoryPoints,
  validateImportRow,
  type ImportRow,
  type ImportValidationContext,
} from "./csvImportCore";
import { toCsv } from "./csvExportCore";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n").rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quotes, escaped quotes, delimiters and newlines inside quotes", () => {
    const result = parseCsv('name,notes\r\n"Smith, J","He said ""hi""\r\nand left"\r\n');
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      ["name", "notes"],
      ["Smith, J", 'He said "hi"\r\nand left'],
    ]);
  });

  it("supports CR-only line endings, empty fields and missing trailing newline", () => {
    expect(parseCsv("a,,c\r1,2,").rows).toEqual([
      ["a", "", "c"],
      ["1", "2", ""],
    ]);
  });

  it("strips a BOM and skips blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n\n").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps an empty quoted field as a row value", () => {
    expect(parseCsv('a\n""\n').rows).toEqual([["a"], [""]]);
  });

  it("reports an unterminated quote", () => {
    const result = parseCsv('a,b\n"open,1\n2,3');
    expect(result.errors[0]).toMatch(/Unclosed quoted field starting on line 2/);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n")).toBe("\t");
    expect(detectDelimiter('"x,y";b;c')).toBe(";");
    expect(parseCsv("a;b\n1;2").rows[1]).toEqual(["1", "2"]);
  });

  it("round-trips the exporter output", () => {
    const rows = [
      ["Summary", "Description"],
      ['Quote "this"', "line 1\nline 2, with comma"],
      ["=SUM(A1)", ""],
    ];
    const parsed = parseCsv(toCsv(rows)).rows;
    expect(parsed[1]).toEqual(rows[1]);
    expect(parsed[2][0]).toBe("'=SUM(A1)");
  });
});

describe("column and value guessing", () => {
  it("maps Jira export headers to fields", () => {
    expect(
      guessColumnMapping([
        "Issue key",
        "Summary",
        "Issue Type",
        "Status",
        "Assignee",
        "Labels",
        "Labels",
        "Custom field (Story Points)",
        "Due Date",
        "Parent",
        "Sprint",
        "Fix Version/s",
        "Whatever",
        "Summary",
      ]),
    ).toEqual([
      "issueId",
      "summary",
      "kind",
      "status",
      "assignee",
      "labels",
      "labels",
      "storyPoints",
      "dueDate",
      "parentKey",
      "sprint",
      "fixVersion",
      "",
      "",
    ]);
  });

  it("matches values by key, name and synonym", () => {
    const statuses = [
      { key: "OPEN", name: "To do" },
      { key: "IN_PROGRESS", name: "In progress" },
      { key: "DONE", name: "Done" },
    ];
    expect(guessValue("status", "To Do", statuses)).toBe("OPEN");
    expect(guessValue("status", "in_progress", statuses)).toBe("IN_PROGRESS");
    expect(guessValue("status", "Closed", statuses)).toBe("DONE");
    expect(guessValue("status", "Blocked", statuses)).toBe("");
    expect(
      guessValue("priority", "Highest", [
        { key: "URGENT", name: "Urgent" },
        { key: "LOW", name: "Low" },
      ]),
    ).toBe("URGENT");
    expect(guessValue("kind", "Sub-task", [{ key: "SUBTASK", name: "Subtask" }])).toBe("SUBTASK");
  });
});

describe("row helpers", () => {
  it("normalizes dates", () => {
    expect(normalizeDate("2026-10-16")).toBe("2026-10-16");
    expect(normalizeDate("2026-10-16T09:00:00Z")).toBe("2026-10-16");
    expect(normalizeDate("16/Oct/26 9:00 AM")).toBe("2026-10-16");
    expect(normalizeDate("10/16/2026")).toBe("2026-10-16");
    expect(normalizeDate("16/10/2026")).toBe("2026-10-16");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("soon")).toBeNull();
  });

  it("snaps story points", () => {
    expect(snapStoryPoints(5)).toBe(5);
    expect(snapStoryPoints(7)).toBe(8);
    expect(snapStoryPoints(100)).toBe(21);
  });

  it("escapes plain text into paragraphs", () => {
    expect(plainTextToHtml("a <b>\nc\n\nd")).toBe("<p>a &lt;b&gt;<br>c</p><p>d</p>");
  });
});

const context: ImportValidationContext = {
  statuses: [
    { key: "OPEN", name: "To do" },
    { key: "DONE", name: "Done" },
  ],
  kinds: [
    { key: "TASK", name: "Task" },
    { key: "EPIC", name: "Epic" },
  ],
  priorities: [{ key: "MEDIUM", name: "Medium" }, { key: "HIGH", name: "High" }],
  members: [{ id: "m1", name: "Ada Lovelace", email: "ada@example.com" }],
  sprints: [{ id: "s1", name: "Sprint 1" }],
  defaults: { status: "OPEN", kind: "TASK", priority: "MEDIUM" },
};

function row(overrides: Partial<ImportRow>): ImportRow {
  return {
    rowNumber: 2,
    issueId: "",
    summary: "A summary",
    description: "",
    kind: "",
    status: "",
    priority: "",
    assignee: "",
    labels: [],
    storyPoints: "",
    dueDate: "",
    parentKey: "",
    sprint: "",
    fixVersion: "",
    ...overrides,
  };
}

describe("buildImportRows", () => {
  it("applies the column and value mappings and merges label columns", () => {
    const rows = buildImportRows(
      [["Fix it", "Done", "a, b", "c;a", "'=x"]],
      ["summary", "status", "labels", "labels", "description"],
      { status: { Done: "DONE" }, kind: {}, priority: {} },
    );
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      summary: "Fix it",
      status: "DONE",
      labels: ["a", "b", "c"],
      description: "=x",
    });
  });
});

describe("validateImportRow", () => {
  it("resolves members, sprints and defaults", () => {
    const result = validateImportRow(
      row({ assignee: "ADA@example.com", sprint: "sprint 1", status: "BLOCKED", storyPoints: "4" }),
      context,
    );
    expect(result.errors).toEqual([]);
    expect(result.assigneeId).toBe("m1");
    expect(result.cycleId).toBe("s1");
    expect(result.status).toBe("OPEN");
    expect(result.estimate).toBe(3);
    expect(result.warnings.length).toBe(2);
  });

  it("reports blocking errors", () => {
    const result = validateImportRow(
      row({ summary: " ", dueDate: "nope", storyPoints: "x", kind: "EPIC", parentKey: "A-1" }),
      context,
    );
    expect(result.errors).toHaveLength(4);
  });

  it("warns about unknown assignees instead of failing", () => {
    const result = validateImportRow(row({ assignee: "ghost" }), context);
    expect(result.errors).toEqual([]);
    expect(result.assigneeId).toBeNull();
  });
});

describe("orderRowsForImport", () => {
  it("puts in-file parents first and flags cycles and unknown parents", () => {
    const rows = [
      validateImportRow(row({ rowNumber: 2, issueId: "1", parentKey: "2" }), context),
      validateImportRow(row({ rowNumber: 3, issueId: "2" }), context),
      validateImportRow(row({ rowNumber: 4, issueId: "3", parentKey: "4" }), context),
      validateImportRow(row({ rowNumber: 5, issueId: "4", parentKey: "3" }), context),
      validateImportRow(row({ rowNumber: 6, parentKey: "OPS-1" }), context),
      validateImportRow(row({ rowNumber: 7, parentKey: "OPS-99" }), context),
    ];
    const ordered = orderRowsForImport(rows, new Set(["OPS-1"]));
    expect(ordered.map((entry) => entry.rowNumber).slice(0, 2)).toEqual([3, 2]);
    expect(rows[2].errors).toContain("Parent links form a cycle");
    expect(rows[3].errors).toContain("Parent links form a cycle");
    expect(rows[4].errors).toEqual([]);
    expect(rows[5].errors[0]).toMatch(/not found/);
  });

  it("flags duplicate issue ids", () => {
    const rows = [
      validateImportRow(row({ issueId: "1" }), context),
      validateImportRow(row({ rowNumber: 3, issueId: "1" }), context),
    ];
    orderRowsForImport(rows);
    expect(rows[1].errors[0]).toMatch(/more than once/);
  });
});
