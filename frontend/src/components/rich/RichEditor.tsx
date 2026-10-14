"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Columns3,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useRef } from "react";

import { useToast } from "@/components/ui/Toast";
import { clientApi } from "@/lib/client-api";
import type { RichDoc } from "@/lib/types";

import { Diagram } from "./Diagram";

// ─────────────────────────── custom nodes ───────────────────────────

const TONES = ["info", "tip", "warning", "exam"] as const;

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-tone") || "info",
        renderHTML: (attrs) => ({ "data-tone": attrs.tone }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { "data-callout": "", class: `callout callout-${node.attrs.tone}` }), ["div", 0]];
  },
});

function DiagramView({ node, updateAttributes, selected }: NodeViewProps) {
  const code = String(node.attrs.code ?? "");
  return (
    <NodeViewWrapper className="diagram-edit" data-selected={selected || undefined}>
      <div className="row small muted" style={{ marginBottom: 8 }} contentEditable={false}>
        <Waypoints size={15} aria-hidden /> <b>Diagram</b> — Mermaid syntax, e.g. <code>flowchart LR; A--&gt;B</code>
      </div>
      <div className="grid-2" contentEditable={false}>
        <div className="stack" style={{ gap: 8 }}>
          <textarea
            className="textarea"
            rows={7}
            value={code}
            aria-label="Diagram source"
            onChange={(e) => updateAttributes({ code: e.target.value })}
          />
          <input
            className="input"
            placeholder="Caption (optional)"
            aria-label="Diagram caption"
            value={String(node.attrs.caption ?? "")}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
          />
        </div>
        <Diagram code={code} caption={String(node.attrs.caption ?? "")} />
      </div>
    </NodeViewWrapper>
  );
}

const DiagramNode = Node.create({
  name: "diagram",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { code: { default: "flowchart LR\n  A[Cause] --> B[Event] --> C[Outcome]" }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-diagram]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-diagram": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DiagramView);
  },
});

// ─────────────────────────── toolbar ───────────────────────────

function Btn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      p: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      callout: e.isActive("callout"),
      tone: (e.getAttributes("callout").tone as string) || "",
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  async function uploadImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      const { url } = await clientApi<{ url: string }>("/manage/uploads/image/", { method: "POST", body: form });
      const alt = window.prompt("Describe the image (alt text for screen readers):", "") ?? "";
      chain().setImage({ src: url, alt }).run();
    } catch (err) {
      toast((err as Error).message || "Upload failed", "error");
    }
  }

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <Btn icon={Pilcrow} label="Paragraph" active={s.p} onClick={() => chain().setParagraph().run()} />
      <Btn icon={Heading2} label="Heading" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <Btn icon={Heading3} label="Sub-heading" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Btn icon={Heading4} label="Minor heading" active={s.h4} onClick={() => chain().toggleHeading({ level: 4 }).run()} />
      <span className="sep" />
      <Btn icon={Bold} label="Bold" active={s.bold} onClick={() => chain().toggleBold().run()} />
      <Btn icon={Italic} label="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <Btn icon={Underline} label="Underline" active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      <Btn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
      <Btn icon={Code} label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()} />
      <Btn
        icon={Link2}
        label={s.link ? "Remove link" : "Add link"}
        active={s.link}
        onClick={() => {
          if (s.link) return void chain().unsetLink().run();
          const href = window.prompt("Link URL (https://…)", "https://");
          if (href && /^https?:\/\//i.test(href)) chain().extendMarkRange("link").setLink({ href }).run();
        }}
      />
      <span className="sep" />
      <Btn icon={List} label="Bulleted list" active={s.ul} onClick={() => chain().toggleBulletList().run()} />
      <Btn icon={ListOrdered} label="Numbered list" active={s.ol} onClick={() => chain().toggleOrderedList().run()} />
      <Btn icon={Quote} label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
      <select
        className="tb-select"
        aria-label="Callout box"
        value={s.callout ? s.tone : ""}
        onChange={(e) => {
          const tone = e.target.value;
          if (!tone) {
            if (s.callout) chain().lift("callout").run();
          } else if (s.callout) {
            chain().updateAttributes("callout", { tone }).run();
          } else {
            chain().wrapIn("callout", { tone }).run();
          }
        }}
      >
        <option value="">Callout…</option>
        {TONES.map((t) => (
          <option key={t} value={t}>
            {t === "exam" ? "Exam focus" : t[0].toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
      <span className="sep" />
      <Btn icon={TableIcon} label="Insert table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {s.table && (
        <>
          <Btn icon={Rows3} label="Add row" onClick={() => chain().addRowAfter().run()} />
          <Btn icon={Columns3} label="Add column" onClick={() => chain().addColumnAfter().run()} />
          <Btn icon={Trash2} label="Delete table" onClick={() => chain().deleteTable().run()} />
        </>
      )}
      <Btn icon={ImagePlus} label="Upload image" onClick={() => fileRef.current?.click()} />
      <Btn
        icon={Waypoints}
        label="Insert diagram"
        onClick={() => chain().insertContent({ type: "diagram" }).run()}
      />
      <Btn icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
      <span className="sep" />
      <Btn icon={Undo2} label="Undo" disabled={!s.canUndo} onClick={() => chain().undo().run()} />
      <Btn icon={Redo2} label="Redo" disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadImage(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─────────────────────────── editor ───────────────────────────

export function RichEditor({
  value,
  onChange,
  placeholder = "Start writing…",
  label,
}: {
  value: RichDoc | Record<string, never> | null | undefined;
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  label: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"] },
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({ allowBase64: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
      DiagramNode,
    ],
    content: value && "type" in value ? value : { type: "doc", content: [] },
    editorProps: { attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichDoc),
  });

  return (
    <div className="editor">
      {editor && <Toolbar editor={editor} />}
      <div className="editor-content prose">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
