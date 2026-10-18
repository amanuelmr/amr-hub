/**
 * Defence in depth for rendering stored rich text in the browser. Rich
 * comments are sanitized on the server before storage, but older or
 * API-created comments are stored verbatim, so anything rendered as HTML
 * goes through this allow-list first (mirrors src/server/richText.ts).
 */

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  p: [],
  br: [],
  hr: [],
  strong: [],
  em: [],
  s: [],
  u: [],
  ul: ["data-type"],
  ol: [],
  li: ["data-type", "data-checked"],
  a: ["href", "target", "rel"],
  code: ["class", "data-language"],
  pre: [],
  blockquote: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  span: ["data-type", "data-id", "data-label", "class"],
  dl: [],
  dt: [],
  dd: [],
  img: ["src", "alt", "title"],
  label: [],
  input: ["type", "checked", "disabled"],
  div: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ["colspan", "rowspan"],
  td: ["colspan", "rowspan"],
};

/** Removed together with their content (everything else is unwrapped). */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "textarea",
  "select",
  "button",
  "form",
]);

const ATTACHMENT_SRC = /^\/api\/attachments\/[A-Za-z0-9_%-]+$/;
const SAFE_HREF = /^(https?:|mailto:|\/(?!\/)|#)/i;
const LANGUAGE_CLASS = /^language-[a-z0-9+#-]{1,30}$/i;

function cleanAttributes(element: Element, tag: string) {
  const allowed = ALLOWED_ATTRIBUTES[tag] ?? [];
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();
    let keep = allowed.includes(name);
    if (keep && name === "href") keep = SAFE_HREF.test(value);
    if (keep && name === "src") keep = ATTACHMENT_SRC.test(value);
    if (keep && name === "class" && tag === "code") {
      keep = LANGUAGE_CLASS.test(value);
    }
    if (keep && name === "class" && tag === "span") {
      keep = value === "mention-chip";
    }
    if (keep && name === "type") keep = value === "checkbox";
    if (!keep) element.removeAttribute(attribute.name);
  }
  if (tag === "a") element.setAttribute("rel", "noreferrer noopener");
  if (tag === "input") element.setAttribute("disabled", "disabled");
}

function cleanChildren(parent: ParentNode) {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === 3) continue; // text
    if (child.nodeType !== 1) {
      child.parentNode?.removeChild(child);
      continue;
    }
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      element.remove();
      continue;
    }
    cleanChildren(element);
    if (!(tag in ALLOWED_ATTRIBUTES)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    if (
      (tag === "img" && !ATTACHMENT_SRC.test(element.getAttribute("src") ?? "")) ||
      (tag === "input" && element.getAttribute("type") !== "checkbox")
    ) {
      element.remove();
      continue;
    }
    cleanAttributes(element, tag);
  }
}

export function sanitizeHtmlInBrowser(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  // DOMParser documents are inert: no scripts run and no images load.
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanChildren(doc.body);
  return doc.body.innerHTML;
}
