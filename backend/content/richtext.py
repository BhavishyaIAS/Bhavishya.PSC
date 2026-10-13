"""
Rich documents are stored as TipTap / ProseMirror JSON:

    {"type": "doc", "content": [{"type": "heading", "attrs": {"level": 2}, "content": [...]}, ...]}

The frontend renders them with a whitelist renderer (unknown nodes are dropped,
URLs are protocol-checked), and the server validates shape + node types on write
and extracts plain text for full-text search.
"""

import json

ALLOWED_NODES = {
    "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem",
    "blockquote", "callout", "codeBlock", "diagram", "hardBreak", "horizontalRule",
    "image", "table", "tableRow", "tableHeader", "tableCell",
}
ALLOWED_MARKS = {"bold", "italic", "strike", "code", "link", "underline", "highlight"}
MAX_DOC_BYTES = 2 * 1024 * 1024
BLOCK_NODES = {"paragraph", "heading", "listItem", "blockquote", "callout", "codeBlock", "diagram", "tableCell", "tableHeader"}


class RichTextError(ValueError):
    pass


def empty_doc():
    return {"type": "doc", "content": []}


def validate_doc(doc):
    """Raise RichTextError if `doc` isn't an acceptable document. Returns the doc."""
    if doc in (None, "", {}):
        return empty_doc()
    if not isinstance(doc, dict) or doc.get("type") != "doc":
        raise RichTextError("Document must be a TipTap JSON object with type 'doc'.")
    if len(json.dumps(doc)) > MAX_DOC_BYTES:
        raise RichTextError("Document is too large (max 2 MB).")

    def walk(node, depth=0):
        if depth > 60:
            raise RichTextError("Document is nested too deeply.")
        if not isinstance(node, dict):
            raise RichTextError("Invalid node.")
        ntype = node.get("type")
        if ntype not in ALLOWED_NODES:
            raise RichTextError(f"Unsupported block type: {ntype!r}.")
        for mark in node.get("marks", []) or []:
            if not isinstance(mark, dict) or mark.get("type") not in ALLOWED_MARKS:
                raise RichTextError("Unsupported text formatting.")
        for child in node.get("content", []) or []:
            walk(child, depth + 1)

    walk(doc)
    return doc


def doc_to_text(doc) -> str:
    """Flatten a document to plain text (for search + previews)."""
    if not isinstance(doc, dict):
        return ""
    parts = []

    def walk(node):
        if not isinstance(node, dict):
            return
        if node.get("type") == "text":
            parts.append(node.get("text", ""))
        elif node.get("type") in ("codeBlock", "diagram"):
            # Diagram source is markup, not prose — keep only a caption if any.
            caption = (node.get("attrs") or {}).get("caption")
            if caption:
                parts.append(caption)
            if node.get("type") == "diagram":
                parts.append("\n")
                return
        for child in node.get("content", []) or []:
            walk(child)
        if node.get("type") in BLOCK_NODES:
            parts.append("\n")

    walk(doc)
    return "".join(parts).strip()


def text_to_doc(text: str):
    """Plain text (blank-line separated paragraphs; lines starting '- ' become bullets) → document."""
    content = []
    for block in (text or "").replace("\r\n", "\n").split("\n\n"):
        lines = [ln for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        if all(ln.lstrip().startswith(("- ", "• ", "* ")) for ln in lines):
            content.append({
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [para(ln.lstrip()[2:].strip())]} for ln in lines
                ],
            })
        else:
            content.append(para(" ".join(ln.strip() for ln in lines)))
    return {"type": "doc", "content": content}


def para(text, marks=None):
    node = {"type": "text", "text": text}
    if marks:
        node["marks"] = [{"type": m} for m in marks]
    return {"type": "paragraph", "content": [node]} if text else {"type": "paragraph"}
