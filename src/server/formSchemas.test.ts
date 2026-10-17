import { describe, expect, it } from "vitest";
import { createField, type FormField } from "../app/components/forms/formModel";
import { buildSubmission, formFieldsSchema, parseStoredFields } from "./formSchemas";

const fields: FormField[] = [
  createField("SUMMARY", "summary"),
  createField("DESCRIPTION", "description"),
  createField("PRIORITY", "priority"),
  { ...createField("DROPDOWN", "browser"), label: "Browser", options: ["Chrome", "Safari"], required: true },
  { ...createField("CHECKBOX", "os"), label: "Platforms", options: ["Mac", "Win"] },
  { ...createField("NUMBER", "count"), label: "Users affected" },
  { ...createField("DATE", "seen"), label: "First seen" },
  { ...createField("PARAGRAPH", "steps"), label: "Steps <b>" },
];

describe("formFieldsSchema", () => {
  it("requires Summary first and forces it required", () => {
    expect(formFieldsSchema.safeParse([createField("SHORT_TEXT", "a")]).success).toBe(false);
    const parsed = formFieldsSchema.parse([{ ...createField("SUMMARY", "s"), required: false }]);
    expect(parsed[0].required).toBe(true);
  });

  it("rejects duplicate singletons, duplicate ids and option-less choice fields", () => {
    const summary = createField("SUMMARY", "s");
    expect(formFieldsSchema.safeParse([summary, createField("PRIORITY", "p"), createField("PRIORITY", "q")]).success).toBe(false);
    expect(formFieldsSchema.safeParse([summary, createField("DATE", "s")]).success).toBe(false);
    expect(formFieldsSchema.safeParse([summary, { ...createField("DROPDOWN", "d"), options: [] }]).success).toBe(false);
  });

  it("drops options from non-choice fields", () => {
    const parsed = formFieldsSchema.parse([createField("SUMMARY", "s"), { ...createField("DATE", "d"), options: ["x"] }]);
    expect(parsed[1].options).toEqual([]);
  });
});

describe("parseStoredFields", () => {
  it("tolerates corrupt JSON", () => {
    expect(parseStoredFields("not json")).toEqual([]);
    expect(parseStoredFields(JSON.stringify([createField("SUMMARY", "s")]))).toHaveLength(1);
  });
});

describe("buildSubmission", () => {
  it("validates required and typed answers", () => {
    const result = buildSubmission(fields, { summary: "ab", browser: "Edge", count: "many", seen: "2026-02-30" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      summary: "Use at least 4 characters",
      browser: "Choose one of the options",
      count: "Enter a number",
      seen: "Enter a valid date",
    });
  });

  it("maps answers onto a work item with an escaped definition list", () => {
    const result = buildSubmission(fields, {
      summary: "  Checkout   is broken ",
      description: "<p>Nothing happens <img src=x onerror=alert(1)></p>",
      priority: "HIGH",
      browser: "Safari",
      os: ["Win", "Mac"],
      count: "12",
      seen: "2026-10-01",
      steps: "1. open <script>\n2. click",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe("Checkout is broken");
    expect(result.priority).toBe("HIGH");
    expect(result.description).not.toContain("<img");
    expect(result.description).not.toContain("<script>");
    expect(result.description).toContain("<dt><strong>Browser</strong></dt><dd>Safari</dd>");
    expect(result.description).toContain("<dd>Mac, Win</dd>");
    expect(result.description).toContain("Steps &lt;b&gt;");
    expect(result.description).toContain("1. open &lt;script&gt;<br />2. click");
  });

  it("produces an empty description when only the summary is answered", () => {
    const result = buildSubmission([createField("SUMMARY", "summary")], { summary: "Just a title" });
    expect(result).toEqual({ ok: true, title: "Just a title", description: "", priority: null });
  });
});
