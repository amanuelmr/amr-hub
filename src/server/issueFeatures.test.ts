import { describe, expect, it, vi } from "vitest";

vi.mock("../../prisma/client", () => ({ default: {} }));

import { canonicalLink, linkLabelFrom } from "./issueRelations";
import {
  canDeleteWorklog,
  canEditWorklog,
  createWorklogSchema,
  nextRemainingEstimate,
} from "./worklogs";
import {
  canDeleteAttachment,
  contentDisposition,
  isInlineImage,
  normalizeMimeType,
  sanitizeFileName,
  validateUploads,
  MAX_ATTACHMENT_BYTES,
} from "./attachments";
import { canDeleteComment, canEditComment } from "./comments";
import { canDeleteIssue, cloneStatus, cloneTitle } from "./issueOperations";

describe("canonicalLink", () => {
  it("keeps outward link types as given", () => {
    expect(canonicalLink("A-1", "A-2", "BLOCKS")).toEqual({
      sourceId: "A-1",
      targetId: "A-2",
      type: "BLOCKS",
    });
  });

  it("swaps inward link types to the canonical direction", () => {
    expect(canonicalLink("A-1", "A-2", "IS_BLOCKED_BY")).toEqual({
      sourceId: "A-2",
      targetId: "A-1",
      type: "BLOCKS",
    });
    expect(canonicalLink("A-1", "A-2", "IS_CLONED_BY").type).toBe("CLONES");
  });

  it("describes links from each side", () => {
    const link = { sourceId: "A-2", targetId: "A-1", type: "BLOCKS" };
    expect(linkLabelFrom("A-2", link)).toBe("blocks A-1");
    expect(linkLabelFrom("A-1", link)).toBe("is blocked by A-2");
  });
});

describe("worklogs", () => {
  it("burns the remaining estimate automatically", () => {
    expect(nextRemainingEstimate({ remaining: 240, original: 480 }, 60)).toBe(
      180,
    );
    expect(nextRemainingEstimate({ remaining: null, original: 120 }, 60)).toBe(
      60,
    );
    expect(nextRemainingEstimate({ remaining: 30, original: 120 }, 60)).toBe(0);
    expect(nextRemainingEstimate({ remaining: null, original: null }, 60)).toBe(
      null,
    );
  });

  it("gives time back on deletion", () => {
    expect(nextRemainingEstimate({ remaining: 0, original: 120 }, -60)).toBe(
      60,
    );
  });

  it("respects leave and set modes", () => {
    expect(
      nextRemainingEstimate({ remaining: 90, original: 120 }, 60, "LEAVE"),
    ).toBe(90);
    expect(
      nextRemainingEstimate({ remaining: 90, original: 120 }, 60, "SET", 15),
    ).toBe(15);
  });

  it("limits editing to the author and deletion to author or owner", () => {
    expect(canEditWorklog("u1", "u1")).toBe(true);
    expect(canEditWorklog("u1", "u2")).toBe(false);
    expect(canEditWorklog(null, "u2")).toBe(false);
    expect(canDeleteWorklog("u1", "u2", "owner")).toBe(true);
    expect(canDeleteWorklog("u1", "u2", "member")).toBe(false);
  });

  it("requires minutes when setting the remaining estimate", () => {
    const base = { minutes: 30, startedAt: "2026-10-16T09:00:00.000Z" };
    expect(
      createWorklogSchema.safeParse({ ...base, remaining: { mode: "SET" } })
        .success,
    ).toBe(false);
    expect(
      createWorklogSchema.safeParse({
        ...base,
        remaining: { mode: "SET", minutes: 0 },
      }).success,
    ).toBe(true);
  });
});

describe("attachments", () => {
  it("only renders raster images inline", () => {
    expect(isInlineImage("image/png")).toBe(true);
    expect(isInlineImage("image/svg+xml")).toBe(false);
    expect(isInlineImage("text/html")).toBe(false);
    expect(contentDisposition("shot.png", "image/png")).toMatch(/^inline;/);
    expect(contentDisposition("logo.svg", "image/svg+xml")).toMatch(
      /^attachment;/,
    );
  });

  it("encodes file names safely", () => {
    const header = contentDisposition('ré"port.pdf', "application/pdf");
    expect(header).toContain('filename="r_port.pdf"');
    expect(header).toContain("filename*=UTF-8''r%C3%A9port.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("")).toBe("attachment");
  });

  it("normalizes mime types", () => {
    expect(normalizeMimeType("Image/PNG")).toBe("image/png");
    expect(normalizeMimeType("text/plain; charset=utf-8")).toBe("text/plain");
    expect(normalizeMimeType("")).toBe("application/octet-stream");
    expect(normalizeMimeType("<script>")).toBe("application/octet-stream");
  });

  it("validates upload sizes and counts", () => {
    expect(validateUploads([])).toMatch(/at least one/);
    expect(
      validateUploads([{ name: "big.bin", size: MAX_ATTACHMENT_BYTES + 1 }]),
    ).toMatch(/10 MB/);
    expect(
      validateUploads(
        Array.from({ length: 11 }, (_, index) => ({
          name: `${index}`,
          size: 1,
        })),
      ),
    ).toMatch(/up to 10/);
    expect(validateUploads([{ name: "ok.txt", size: 10 }])).toBeNull();
  });

  it("lets uploaders and owners delete", () => {
    expect(canDeleteAttachment("u1", "u1", "member")).toBe(true);
    expect(canDeleteAttachment("u1", "u2", "member")).toBe(false);
    expect(canDeleteAttachment("u1", "u2", "owner")).toBe(true);
  });
});

describe("comments and issue operations", () => {
  it("applies comment permissions", () => {
    expect(canEditComment("u1", "u1")).toBe(true);
    expect(canEditComment("u1", "u2")).toBe(false);
    expect(canDeleteComment("u1", "u2", "owner")).toBe(true);
    expect(canDeleteComment(null, "u2", "member")).toBe(false);
  });

  it("names and resets clones", () => {
    expect(cloneTitle("Fix login")).toBe("CLONE - Fix login");
    expect(cloneTitle("x".repeat(255))).toHaveLength(255);
    expect(cloneStatus("BACKLOG")).toBe("BACKLOG");
    expect(cloneStatus("IN_REVIEW")).toBe("OPEN");
  });

  it("lets only the reporter or an owner delete issues", () => {
    expect(canDeleteIssue("u1", "u1", "member")).toBe(true);
    expect(canDeleteIssue("u1", "u2", "member")).toBe(false);
    expect(canDeleteIssue(null, "u2", "owner")).toBe(true);
  });
});
