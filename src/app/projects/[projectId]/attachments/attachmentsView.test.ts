import { describe, expect, it } from "vitest";
import { fileKind, filterAttachments, type ProjectAttachment } from "./attachmentsView";

const file = (name: string, mimeType: string, issueId = "OPS-1", issueTitle = "Login") =>
  ({ id: name, name, mimeType, issueId, issueTitle }) as ProjectAttachment;

describe("fileKind", () => {
  it("groups images, documents and the rest", () => {
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("application/pdf")).toBe("document");
    expect(fileKind("text/plain")).toBe("document");
    expect(fileKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("document");
    expect(fileKind("application/zip")).toBe("other");
  });
});

describe("filterAttachments", () => {
  const files = [
    file("shot.png", "image/png"),
    file("spec.pdf", "application/pdf", "OPS-2", "Checkout flow"),
    file("logs.zip", "application/zip"),
  ];

  it("matches file names and work items, case-insensitively", () => {
    expect(filterAttachments(files, "SPEC", "").map((item) => item.name)).toEqual(["spec.pdf"]);
    expect(filterAttachments(files, "checkout", "").map((item) => item.name)).toEqual(["spec.pdf"]);
    expect(filterAttachments(files, "ops-1", "").map((item) => item.name)).toEqual(["shot.png", "logs.zip"]);
  });

  it("filters by kind", () => {
    expect(filterAttachments(files, "", "image").map((item) => item.name)).toEqual(["shot.png"]);
    expect(filterAttachments(files, "", "other").map((item) => item.name)).toEqual(["logs.zip"]);
  });
});
