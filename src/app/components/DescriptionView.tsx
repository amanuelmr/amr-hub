import { looksLikeHtml } from "../data/richText";

export function DescriptionView({ value }: { value: string }) {
  if (looksLikeHtml(value)) {
    // Sanitized server-side (sanitizeDescriptionHtml) before storage — this is
    // the single trust boundary; nothing downstream re-sanitizes.
    return (
      <div
        className="issue-description rich-text-content rich-text-view"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  return <p className="issue-description">{value}</p>;
}
