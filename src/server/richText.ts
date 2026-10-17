import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
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
  "span",
  "dl",
  "dt",
  "dd",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
  span: ["data-type", "data-id", "data-label"],
};

export function sanitizeDescriptionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
  }).trim();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

export function extractCommentMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(COMMENT_MENTION_PATTERN)) {
    ids.add(match[1]);
  }
  return [...ids];
}
