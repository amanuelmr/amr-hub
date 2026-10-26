import { describe, expect, it } from "vitest";
import type { Issue } from "../../data/issues";
import { issueFieldRows, issueToHtml, issueToXml, type IssueExportContext } from "./issueExport";

const issue = {
  id: "OPS-7",
  title: "Fix <login> & retry",
  description: "<p>Steps</p><script>alert(1)</script>",
  priority: "HIGH",
  resolution: null,
  assignee: { id: "m1", name: "Ada", email: "ada@example.com" },
  creator: { id: "u1", name: "Bo", email: "bo@example.com" },
  parent: null,
  labels: [{ id: "l1", name: "backend", color: "#000" }],
  fixVersion: null,
  estimate: 3,
  dueDate: "2026-11-02T00:00:00.000Z",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-20T09:00:00.000Z",
  links: [],
  webLinks: [{ id: "w1", url: "https://example.com/spec?a=1&b=2", title: "Spec", createdAt: "" }],
  comments: [{ id: "c1", author: "Ada", body: "<p>Done ]]> soon</p>", createdAt: "2026-10-21T00:00:00.000Z" }],
} as unknown as Issue;

const ctx: IssueExportContext = {
  url: "https://hub.test/issues/OPS-7",
  status: "In progress",
  type: "Bug",
  sanitize: (html) => html.replace(/<script>.*?<\/script>/g, ""),
};

describe("issueFieldRows", () => {
  it("lists filled fields with readable values", () => {
    const rows = Object.fromEntries(issueFieldRows(issue, ctx));
    expect(rows).toMatchObject({
      Type: "Bug",
      Status: "In progress",
      Priority: "High",
      Resolution: "Unresolved",
      Assignee: "Ada",
      Labels: "backend",
      "Story points": "3",
      "Due date": "2026-11-02",
    });
    expect(rows).not.toHaveProperty("Parent");
  });
});

describe("issueToHtml", () => {
  it("escapes plain text and sanitizes rich text", () => {
    const html = issueToHtml(issue, ctx);
    expect(html).toContain("<h1>Fix &lt;login&gt; &amp; retry</h1>");
    expect(html).toContain("<p>Steps</p>");
    expect(html).not.toContain("<script>");
    expect(html).toContain('href="https://example.com/spec?a=1&amp;b=2"');
  });
});

describe("issueToXml", () => {
  it("escapes values and keeps CDATA well formed", () => {
    const xml = issueToXml(issue, ctx);
    expect(xml).toContain("<summary>Fix &lt;login&gt; &amp; retry</summary>");
    expect(xml).toContain("<status>In progress</status>");
    expect(xml).toContain("<![CDATA[<p>Done ]]]]><![CDATA[> soon</p>]]>");
    expect(xml).toContain('<weblink url="https://example.com/spec?a=1&amp;b=2">Spec</weblink>');
  });
});
