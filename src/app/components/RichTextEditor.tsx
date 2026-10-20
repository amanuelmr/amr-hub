"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { mergeAttributes, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Code,
  FileCode2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  Minus,
  Quote,
  Smile,
  Strikethrough,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import type { WorkspaceMember } from "../data/issues";
import { createMentionSuggestion } from "./mentionSuggestion";
import { EmojiPicker } from "./EmojiPicker";

export type UploadedImage = { src: string; alt: string };

/** Uploads pasted/dropped images (as issue attachments) and returns their URLs. */
export type ImageUploader = (files: File[]) => Promise<UploadedImage[]>;

export const CODE_LANGUAGES = [
  { value: "", label: "Plain text" },
  { value: "bash", label: "Bash" },
  { value: "css", label: "CSS" },
  { value: "go", label: "Go" },
  { value: "html", label: "HTML" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "markdown", label: "Markdown" },
  { value: "python", label: "Python" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "typescript", label: "TypeScript" },
  { value: "yaml", label: "YAML" },
];

/** Block image node; the sanitizer only keeps /api/attachments/ sources. */
const AttachmentImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});

function imageFiles(list: FileList | null | undefined) {
  return [...(list ?? [])].filter((file) => file.type.startsWith("image/"));
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onRun,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}

function blockType(editor: Editor) {
  for (const level of [1, 2, 3, 4] as const) {
    if (editor.isActive("heading", { level })) return `h${level}`;
  }
  return "p";
}

export function RichTextEditor({
  value,
  onChange,
  members,
  placeholder,
  autoFocus = false,
  onUploadImages,
  onSubmitShortcut,
}: {
  value: string;
  onChange: (html: string) => void;
  members: WorkspaceMember[];
  placeholder?: string;
  autoFocus?: boolean;
  /** Enables image paste/drop and the image button. */
  onUploadImages?: ImageUploader;
  /** Cmd/Ctrl+Enter, e.g. to save a comment. */
  onSubmitShortcut?: () => void;
}) {
  const uploadRef = useRef<ImageUploader | undefined>(onUploadImages);
  const submitRef = useRef(onSubmitShortcut);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    uploadRef.current = onUploadImages;
    submitRef.current = onSubmitShortcut;
  });

  const insertImages = async (files: File[], position?: number) => {
    const upload = uploadRef.current;
    const editor = editorRef.current;
    if (!upload || !editor || files.length === 0) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const images = await upload(files);
      const content = images.map((image) => ({
        type: "image",
        attrs: { src: image.src, alt: image.alt },
      }));
      if (content.length === 0) return;
      const chain = editor.chain().focus();
      if (position === undefined) chain.insertContent(content).run();
      else chain.insertContentAt(position, content).run();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Image could not be uploaded",
      );
    } finally {
      setIsUploading(false);
    }
  };
  const insertImagesRef = useRef(insertImages);
  useEffect(() => {
    insertImagesRef.current = insertImages;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true },
        codeBlock: { languageClassPrefix: "language-" },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      AttachmentImage,
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
    editorProps: {
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0 || !uploadRef.current) return false;
        event.preventDefault();
        void insertImagesRef.current(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (files.length === 0 || !uploadRef.current) return false;
        event.preventDefault();
        const position = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        void insertImagesRef.current(files, position);
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          submitRef.current
        ) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            block: blockType(instance),
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            strike: instance.isActive("strike"),
            code: instance.isActive("code"),
            link: instance.isActive("link"),
            bulletList: instance.isActive("bulletList"),
            orderedList: instance.isActive("orderedList"),
            taskList: instance.isActive("taskList"),
            blockquote: instance.isActive("blockquote"),
            codeBlock: instance.isActive("codeBlock"),
            table: instance.isActive("table"),
            language:
              (instance.getAttributes("codeBlock").language as
                | string
                | null
                | undefined) ?? "",
          }
        : null,
  });

  if (!editor || !state) return null;

  const setLink = () => {
    const previous = (editor.getAttributes("link").href as string) ?? "";
    const url = window.prompt("Link URL", previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const setBlock = (next: string) => {
    const chain = editor.chain().focus();
    if (next === "p") chain.setParagraph().run();
    else {
      chain
        .setHeading({ level: Number(next.slice(1)) as 1 | 2 | 3 | 4 })
        .run();
    }
  };

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Formatting">
        <label className="rich-text-select">
          <span className="sr-only">Text style</span>
          <select
            value={state.codeBlock ? "p" : state.block}
            disabled={state.codeBlock}
            onChange={(event) => setBlock(event.target.value)}
          >
            <option value="p">Normal text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
          </select>
        </label>
        <span className="rich-text-divider" aria-hidden="true" />
        <ToolbarButton
          label="Bold (⌘B)"
          active={state.bold}
          onRun={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic (⌘I)"
          active={state.italic}
          onRun={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={state.strike}
          onRun={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={state.code}
          onRun={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Link" active={state.link} onRun={setLink}>
          <LinkIcon size={14} aria-hidden="true" />
        </ToolbarButton>
        <span className="rich-text-divider" aria-hidden="true" />
        <ToolbarButton
          label="Bullet list"
          active={state.bulletList}
          onRun={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state.orderedList}
          onRun={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Action item"
          active={state.taskList}
          onRun={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListChecks size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={state.blockquote}
          onRun={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Code snippet"
          active={state.codeBlock}
          onRun={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <FileCode2 size={14} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Table"
          active={state.table}
          onRun={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <TableIcon size={14} aria-hidden="true" />
        </ToolbarButton>
        {state.table && (
          <>
            <ToolbarButton
              label="Add row"
              active={false}
              onRun={() => editor.chain().focus().addRowAfter().run()}
            >
              <BetweenHorizontalEnd size={14} aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              label="Add column"
              active={false}
              onRun={() => editor.chain().focus().addColumnAfter().run()}
            >
              <BetweenVerticalEnd size={14} aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              label="Delete table"
              active={false}
              onRun={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 size={14} aria-hidden="true" />
            </ToolbarButton>
          </>
        )}
        <ToolbarButton
          label="Divider"
          onRun={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={14} aria-hidden="true" />
        </ToolbarButton>
        <span className="rich-text-divider" aria-hidden="true" />
        <EmojiPicker
          label="Emoji"
          onPick={(emoji) => editor.chain().focus().insertContent(emoji).run()}
          trigger={
            <button type="button" aria-label="Emoji" title="Emoji">
              <Smile size={14} aria-hidden="true" />
            </button>
          }
        />
        {onUploadImages && (
          <ToolbarButton
            label="Insert image"
            disabled={isUploading}
            onRun={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <LoaderCircle
                size={14}
                className="rich-text-spin"
                aria-hidden="true"
              />
            ) : (
              <ImagePlus size={14} aria-hidden="true" />
            )}
          </ToolbarButton>
        )}
        {state.codeBlock && (
          <label className="rich-text-select rich-text-language">
            <span className="sr-only">Code language</span>
            <select
              value={state.language}
              onChange={(event) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("codeBlock", {
                    language: event.target.value || null,
                  })
                  .run()
              }
            >
              {CODE_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <EditorContent editor={editor} className="rich-text-content" />
      {(isUploading || uploadError) && (
        <p
          className={`rich-text-status${uploadError ? " is-error" : ""}`}
          role={uploadError ? "alert" : "status"}
        >
          {uploadError ?? "Uploading image…"}
        </p>
      )}
      {onUploadImages && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = imageFiles(event.target.files);
            event.target.value = "";
            void insertImages(files);
          }}
        />
      )}
    </div>
  );
}
