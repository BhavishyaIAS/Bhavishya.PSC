import { AlertTriangle, Info, Lightbulb, Target } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import type { RichDoc, RichNode } from "@/lib/types";

import { Diagram } from "./Diagram";

/**
 * Read-only renderer for TipTap/ProseMirror JSON. It's a whitelist: unknown
 * node types render nothing, links and images are protocol-checked, and no
 * HTML string is ever injected — so stored content can't execute script.
 */

const CALLOUTS = {
  info: { icon: Info, label: "Note" },
  tip: { icon: Lightbulb, label: "Tip" },
  warning: { icon: AlertTriangle, label: "Caution" },
  exam: { icon: Target, label: "Exam focus" },
} as const;

export function safeHref(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h) || (h.startsWith("/") && !h.startsWith("//")) || h.startsWith("#")) return h;
  return undefined;
}

export function safeImageSrc(src: unknown): string | undefined {
  if (typeof src !== "string") return undefined;
  return /^https:\/\//i.test(src) || src.startsWith("/api/media/public/") ? src : undefined;
}

function str(v: unknown) {
  return typeof v === "string" ? v : "";
}

function renderText(node: RichNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "highlight":
        out = <mark>{out}</mark>;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (href) {
          const external = /^https?:/i.test(href);
          out = (
            <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
              {out}
            </a>
          );
        }
        break;
      }
    }
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function children(node: RichNode) {
  return (node.content ?? []).map((child, i) => renderNode(child, i));
}

function cellSpan(node: RichNode) {
  const colSpan = Number(node.attrs?.colspan) || undefined;
  const rowSpan = Number(node.attrs?.rowspan) || undefined;
  return { colSpan: colSpan && colSpan > 1 ? colSpan : undefined, rowSpan: rowSpan && rowSpan > 1 ? rowSpan : undefined };
}

function renderNode(node: RichNode, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key}>{children(node)}</p>;
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4);
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      return <Tag key={key}>{children(node)}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{children(node)}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(node.attrs?.start) || undefined}>
          {children(node)}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children(node)}</li>;
    case "blockquote":
      return <blockquote key={key}>{children(node)}</blockquote>;
    case "callout": {
      const tone = (str(node.attrs?.tone) in CALLOUTS ? str(node.attrs?.tone) : "info") as keyof typeof CALLOUTS;
      const { icon: Icon, label } = CALLOUTS[tone];
      return (
        <aside key={key} className={`callout callout-${tone}`} aria-label={label}>
          <Icon className="callout-icon" size={19} aria-hidden />
          <div>{children(node)}</div>
        </aside>
      );
    }
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "diagram":
      return <Diagram key={key} code={str(node.attrs?.code)} caption={str(node.attrs?.caption)} />;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = safeImageSrc(node.attrs?.src);
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={key} src={src} alt={str(node.attrs?.alt)} title={str(node.attrs?.title) || undefined} loading="lazy" />;
    }
    case "table":
      return (
        <table key={key}>
          <tbody>{children(node)}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key}>{children(node)}</tr>;
    case "tableHeader":
      return (
        <th key={key} {...cellSpan(node)}>
          {children(node)}
        </th>
      );
    case "tableCell":
      return (
        <td key={key} {...cellSpan(node)}>
          {children(node)}
        </td>
      );
    default:
      return null;
  }
}

export function isEmptyDoc(doc: RichDoc | Record<string, never> | null | undefined) {
  return !doc || !("content" in doc) || !doc.content?.length;
}

export function RichText({ doc, className = "" }: { doc: RichDoc | Record<string, never> | null | undefined; className?: string }) {
  if (isEmptyDoc(doc)) return null;
  return <div className={`prose ${className}`}>{(doc as RichDoc).content!.map((n, i) => renderNode(n, i))}</div>;
}
