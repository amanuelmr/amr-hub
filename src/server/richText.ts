import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "s",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "span",
  "dl",
  "dt",
  "dd",
  "img",
  // Task lists: <ul data-type="taskList"><li data-checked><label><input>…
  "label",
  "input",
  "div",
  // Tables (pasted or produced by a table-capable editor).
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  span: ["data-type", "data-id", "data-label"],
  img: ["src", "alt", "title"],
  code: ["class", "data-language"],
  ul: ["data-type"],
  li: ["data-type", "data-checked"],
  input: ["type", "checked", "disabled"],
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
};

/** Inline images may only point at this workspace's own attachment files. */
const ATTACHMENT_SRC = /^\/api\/attachments\/[A-Za-z0-9_%-]+$/;
const LANGUAGE_CLASS = /^language-([a-z0-9+#-]{1,30})$/i;

export function isAttachmentImageSrc(src: string | undefined) {
  return typeof src === "string" && ATTACHMENT_SRC.test(src);
}

export function sanitizeDescriptionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedClasses: { code: ["language-*"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      code: (tagName, attribs) => {
        const language = LANGUAGE_CLASS.exec(attribs.class ?? "")?.[1];
        const next: sanitizeHtml.Attributes = language
          ? { class: `language-${language}`, "data-language": language }
          : {};
        return { tagName, attribs: next };
      },
      input: (tagName, attribs) => ({
        tagName,
        attribs: {
          // Non-checkbox inputs keep their type so exclusiveFilter drops them.
          type: attribs.type === "checkbox" ? "checkbox" : "other",
          disabled: "disabled",
          ...(attribs.checked !== undefined ? { checked: "checked" } : {}),
        },
      }),
      li: (tagName, attribs) => {
        const next: sanitizeHtml.Attributes =
          attribs["data-type"] === "taskItem"
            ? {
                "data-type": "taskItem",
                "data-checked":
                  attribs["data-checked"] === "true" ? "true" : "false",
              }
            : {};
        return { tagName, attribs: next };
      },
      ul: (tagName, attribs) => {
        const next: sanitizeHtml.Attributes =
          attribs["data-type"] === "taskList" ? { "data-type": "taskList" } : {};
        return { tagName, attribs: next };
      },
    },
    exclusiveFilter: (frame) =>
      (frame.tag === "img" && !isAttachmentImageSrc(frame.attribs.src)) ||
      (frame.tag === "input" && frame.attribs.type !== "checkbox"),
  }).trim();
}

/** Comments use the same rich-text model and trust boundary as descriptions. */
export const sanitizeCommentHtml = sanitizeDescriptionHtml;

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when sanitized rich text has visible content (text or an image). */
export function hasRichContent(html: string): boolean {
  return stripHtml(html).length > 0 || /<img\b/i.test(html);
}

const SPAN_TAG_PATTERN = /<span\b([^>]*)>/g;
const DATA_ID_PATTERN = /data-id="([^"]*)"/;

export function extractMentionedMemberIds(html: string): string[] {
  const ids = new Set<string>();

  for (const match of html.matchAll(SPAN_TAG_PATTERN)) {
    const attributes = match[1];
    if (!/data-type="mention"/.test(attributes)) continue;

    const idMatch = DATA_ID_PATTERN.exec(attributes);
    if (idMatch && idMatch[1]) ids.add(idMatch[1]);
  }

  return [...ids];
}

const COMMENT_MENTION_PATTERN = /@\[[^\]]+\]\(([^)]+)\)/g;

/**
 * Mentioned member ids in a comment. Comments are rich HTML (mention spans)
 * since the shared editor; older ones use the compact `@[Name](id)` syntax.
 */
export function extractCommentMentionIds(body: string): string[] {
  const ids = new Set<string>(extractMentionedMemberIds(body));
  for (const match of body.matchAll(COMMENT_MENTION_PATTERN)) {
    ids.add(match[1]);
  }
  return [...ids];
}
