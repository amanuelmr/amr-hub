"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import type { WorkspaceMember } from "../data/issues";
import { createMentionSuggestion } from "./mentionSuggestion";

export function RichTextEditor({
  value,
  onChange,
  members,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  members: WorkspaceMember[];
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Mention.configure({
        HTMLAttributes: { class: "mention-chip" },
        suggestion: createMentionSuggestion(members),
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt("Link URL");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onMouseDown={(event) => {
            event.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          aria-label="Bold"
          title="Bold"
        >
          <Bold size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onMouseDown={(event) => {
            event.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
          aria-label="Italic"
          title="Italic"
        >
          <Italic size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          onMouseDown={(event) => {
            event.preventDefault();
            editor.chain().focus().toggleBulletList().run();
          }}
          aria-label="Bullet list"
          title="Bullet list"
        >
          <List size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "active" : ""}
          onMouseDown={(event) => {
            event.preventDefault();
            editor.chain().focus().toggleOrderedList().run();
          }}
          aria-label="Numbered list"
          title="Numbered list"
        >
          <ListOrdered size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor.isActive("blockquote") ? "active" : ""}
          onMouseDown={(event) => {
            event.preventDefault();
            editor.chain().focus().toggleBlockquote().run();
          }}
          aria-label="Quote"
          title="Quote"
        >
          <Quote size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor.isActive("link") ? "active" : ""}
          onMouseDown={(event) => {
            event.preventDefault();
            setLink();
          }}
          aria-label="Link"
          title="Link"
        >
          <LinkIcon size={14} aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} className="rich-text-content" />
    </div>
  );
}
