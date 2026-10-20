import { describe, expect, it } from "vitest";
import {
  extractCommentMentionIds,
  extractMentionedMemberIds,
  hasRichContent,
  sanitizeDescriptionHtml,
  stripHtml,
} from "./richText";

describe("sanitizeDescriptionHtml", () => {
  it("keeps the allowed formatting tags", () => {
    const input = "<p>Hello <strong>world</strong></p><ul><li>One</li></ul>";
    expect(sanitizeDescriptionHtml(input)).toBe(input);
  });

  it("strips script tags entirely", () => {
    const result = sanitizeDescriptionHtml(
      "<p>hi</p><script>alert(1)</script>",
    );
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
  });

  it("strips inline event handlers", () => {
    const result = sanitizeDescriptionHtml('<p onclick="alert(1)">hi</p>');
    expect(result).not.toContain("onclick");
  });

  it("strips javascript: links", () => {
    const result = sanitizeDescriptionHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("keeps mention spans with their data attributes", () => {
    const input =
      '<p><span data-type="mention" data-id="member-1" data-label="Jane">@Jane</span></p>';
    expect(sanitizeDescriptionHtml(input)).toBe(input);
  });
});

describe("stripHtml", () => {
  it("returns the plain-text length of a formatted description", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });
});

describe("extractMentionedMemberIds", () => {
  it("extracts every mentioned member id, deduplicated", () => {
    const html =
      '<p><span data-type="mention" data-id="member-1">@Jane</span> and ' +
      '<span data-type="mention" data-id="member-2">@Sam</span> and ' +
      '<span data-type="mention" data-id="member-1">@Jane</span></p>';

    expect(extractMentionedMemberIds(html)).toEqual(["member-1", "member-2"]);
  });

  it("ignores spans that are not mentions", () => {
    const html = '<p><span class="foo">not a mention</span></p>';
    expect(extractMentionedMemberIds(html)).toEqual([]);
  });
});

describe("extractCommentMentionIds", () => {
  it("extracts member ids from the markdown-style mention syntax", () => {
    const body = "Hey @[Jane Doe](member-1), can you check this?";
    expect(extractCommentMentionIds(body)).toEqual(["member-1"]);
  });

  it("returns an empty array when there are no mentions", () => {
    expect(extractCommentMentionIds("Just a plain comment")).toEqual([]);
  });
});

describe("sanitizeDescriptionHtml rich content", () => {
  it("keeps images that point at workspace attachments", () => {
    const input = '<p><img src="/api/attachments/abc123" alt="shot.png" /></p>';
    expect(sanitizeDescriptionHtml(input)).toBe(
      '<p><img src="/api/attachments/abc123" alt="shot.png" /></p>',
    );
  });

  it("drops images from any other source", () => {
    for (const src of [
      "https://evil.example/x.png",
      "//evil.example/api/attachments/x",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/api/attachments/../issues",
    ]) {
      expect(sanitizeDescriptionHtml(`<p><img src="${src}" /></p>`)).toBe(
        "<p></p>",
      );
    }
  });

  it("keeps code block language classes and adds a label attribute", () => {
    const result = sanitizeDescriptionHtml(
      '<pre><code class="language-typescript">const a = 1;</code></pre>',
    );
    expect(result).toBe(
      '<pre><code class="language-typescript" data-language="typescript">const a = 1;</code></pre>',
    );
  });

  it("drops other classes on code", () => {
    expect(
      sanitizeDescriptionHtml('<code class="evil language-">x</code>'),
    ).toBe("<code>x</code>");
  });

  it("keeps task lists with read-only checkboxes", () => {
    const result = sanitizeDescriptionHtml(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked" onclick="x()"><span></span></label><div><p>Done</p></div></li></ul>',
    );
    expect(result).toContain('<ul data-type="taskList">');
    expect(result).toContain('data-checked="true"');
    expect(result).toContain(
      '<input type="checkbox" disabled="disabled" checked="checked" />',
    );
    expect(result).not.toContain("onclick");
  });

  it("drops non-checkbox inputs", () => {
    expect(sanitizeDescriptionHtml('<p><input type="text" value="x"></p>')).toBe(
      "<p></p>",
    );
  });

  it("keeps tables", () => {
    const input =
      '<table><tbody><tr><th colspan="2">H</th></tr><tr><td>a</td><td>b</td></tr></tbody></table>';
    expect(sanitizeDescriptionHtml(input)).toBe(input);
  });
});

describe("rich comment helpers", () => {
  it("extracts mentions from rich HTML comments", () => {
    const html =
      '<p>Hi <span data-type="mention" data-id="member-9" data-label="Jo">@Jo</span></p>';
    expect(extractCommentMentionIds(html)).toEqual(["member-9"]);
  });

  it("treats image-only content as content", () => {
    expect(hasRichContent('<p><img src="/api/attachments/a"></p>')).toBe(true);
    expect(hasRichContent("<p> </p>")).toBe(false);
  });
});
