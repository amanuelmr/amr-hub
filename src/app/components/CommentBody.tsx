"use client";

import { useMemo } from "react";
import { looksLikeHtml, parseCommentBody } from "../data/richText";
import { sanitizeHtmlInBrowser } from "./browserSanitize";

export function CommentBody({ body }: { body: string }) {
  const isRich = looksLikeHtml(body);
  const html = useMemo(
    () => (isRich ? sanitizeHtmlInBrowser(body) : ""),
    [body, isRich],
  );

  if (isRich) {
    return (
      <div
        className="comment-body rich-text-content rich-text-view"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Older comments: plain text with `@[Name](memberId)` mentions.
  return (
    <p className="comment-body">
      {parseCommentBody(body).map((part, index) =>
        part.type === "mention" ? (
          <span className="mention-chip" key={`${part.memberId}-${index}`}>
            @{part.name}
          </span>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        ),
      )}
    </p>
  );
}
