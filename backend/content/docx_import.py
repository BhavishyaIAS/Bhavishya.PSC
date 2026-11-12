"""
Import a Word (.docx) book of notes into the syllabus.

    Heading 1  → a chapter  → Topic       ("PART I — …" headings stay inside the chapter)
    Heading 2  → a section  → MicroTheme  (a leading "12. " is dropped from the title)
    the rest   → that section's Note (rich document, same format as the editor)

An unnumbered Heading 2 straight after a chapter title, before any text, is the
chapter's subtitle and joins its title. Text between a chapter title and its
first section becomes an "Introduction" section.

Inline bold / italic / underline / strike, headings 3–6, bullet and numbered
lists (nested), tables and line breaks are kept; everything is plain text in a
whitelisted document, so nothing in the file can run in the browser.

Re-importing is idempotent: micro-themes are keyed on their code
(PREFIX-chapter-section), topics on their title within the subject.
"""

import re
import zipfile
from dataclasses import dataclass, field

from django.db import transaction
from docx import Document
from docx.oxml.ns import qn

from .models import MicroTheme, Note, NoteKind, Paper, Status, Subject, Topic
from .richtext import validate_doc

MAX_BYTES = 15 * 1024 * 1024
SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "its", "of", "on", "or", "the", "to", "with"}
NUMBERED = re.compile(r"^\s*(\d+)[.)]\s+")


class DocxImportError(ValueError):
    pass


@dataclass
class Section:
    title: str
    blocks: list = field(default_factory=list)

    def doc(self):
        return {"type": "doc", "content": self.blocks}

    def words(self):
        return len(_text(self.blocks).split())

    def tables(self):
        return sum(1 for b in self.blocks if b["type"] == "table")


@dataclass
class Chapter:
    title: str
    subtitle: str = ""
    intro: list = field(default_factory=list)
    sections: list = field(default_factory=list)

    def full_title(self):
        if not self.subtitle:
            return self.title
        sep = " " if self.subtitle[:1].islower() else ": "
        return f"{self.title}{sep}{self.subtitle}"


# ─────────────────────────── text helpers ───────────────────────────


def title_case(text: str) -> str:
    """'THE DELHI SULTANATE (1206–1526)' → 'The Delhi Sultanate (1206–1526)'. Mixed case is left alone."""
    text = " ".join(text.split())
    if any(c.islower() for c in text):
        return text
    out = []
    for i, word in enumerate(text.split(" ")):
        core = word.strip("(),.:;—–-'’\"")
        if re.fullmatch(r"[IVXLC]+", core):  # roman numerals
            out.append(word)
        elif i and core.lower() in SMALL_WORDS:
            out.append(word.lower())
        else:
            lw = word.lower()
            j = next((k for k, c in enumerate(lw) if c.isalpha()), None)
            out.append(lw if j is None else lw[:j] + lw[j].upper() + lw[j + 1:])
    return " ".join(out)


def _text(nodes) -> str:
    parts = []
    for n in nodes or []:
        if n.get("type") == "text":
            parts.append(n.get("text", ""))
        parts.append(_text(n.get("content")))
        parts.append(" ")
    return "".join(parts)


# ─────────────────────────── inline runs ───────────────────────────


def _on(rpr, tag):
    el = rpr.find(qn(tag)) if rpr is not None else None
    if el is None:
        return False
    val = el.get(qn("w:val"))
    return val not in ("0", "false", "none")


def _inline(p_el):
    """A <w:p> element → list of text / hardBreak nodes with marks (adjacent equal marks merged)."""
    nodes = []

    def push(text, marks):
        if not text:
            return
        if nodes and nodes[-1]["type"] == "text" and nodes[-1].get("marks", []) == marks:
            nodes[-1]["text"] += text
        else:
            node = {"type": "text", "text": text}
            if marks:
                node["marks"] = marks
            nodes.append(node)

    for r in p_el.iter(qn("w:r")):
        rpr = r.find(qn("w:rPr"))
        style = rpr.find(qn("w:rStyle")) if rpr is not None else None
        style_id = (style.get(qn("w:val")) or "").lower() if style is not None else ""
        marks = []
        if _on(rpr, "w:b") or style_id in ("strong", "strongemphasis"):
            marks.append({"type": "bold"})
        if _on(rpr, "w:i") or style_id in ("emphasis",):
            marks.append({"type": "italic"})
        if rpr is not None and rpr.find(qn("w:u")) is not None and rpr.find(qn("w:u")).get(qn("w:val")) not in ("none", None):
            marks.append({"type": "underline"})
        if _on(rpr, "w:strike"):
            marks.append({"type": "strike"})
        for child in r:
            if child.tag == qn("w:t"):
                push(child.text or "", marks)
            elif child.tag == qn("w:tab"):
                push(" ", marks)
            elif child.tag in (qn("w:br"), qn("w:cr")):
                nodes.append({"type": "hardBreak"})
    # trim edge whitespace / breaks
    while nodes and nodes[-1]["type"] == "hardBreak":
        nodes.pop()
    if nodes and nodes[0]["type"] == "text":
        nodes[0]["text"] = nodes[0]["text"].lstrip()
    if nodes and nodes[-1]["type"] == "text":
        nodes[-1]["text"] = nodes[-1]["text"].rstrip()
    return [n for n in nodes if n["type"] != "text" or n["text"]]


def _para(content):
    return {"type": "paragraph", "content": content} if content else {"type": "paragraph"}


# ─────────────────────────── the parser ───────────────────────────


class _Parser:
    def __init__(self, document):
        self.doc = document
        self.styles = {s.style_id: s.name for s in document.styles}
        self.num_fmt = self._numbering()
        self.title = ""
        self.subtitle = ""
        self.chapters: list[Chapter] = []
        self.warnings: list[str] = []
        self.pending_part = None

    def _numbering(self):
        """numId → {ilvl: 'bullet' | 'decimal' | …}."""
        try:
            root = self.doc.part.numbering_part.element
        except (KeyError, NotImplementedError, AttributeError):
            return {}
        abstract = {}
        for an in root.findall(qn("w:abstractNum")):
            levels = {}
            for lvl in an.findall(qn("w:lvl")):
                fmt = lvl.find(qn("w:numFmt"))
                levels[lvl.get(qn("w:ilvl"))] = fmt.get(qn("w:val")) if fmt is not None else "bullet"
            abstract[an.get(qn("w:abstractNumId"))] = levels
        out = {}
        for num in root.findall(qn("w:num")):
            ref = num.find(qn("w:abstractNumId"))
            if ref is not None:
                out[num.get(qn("w:numId"))] = abstract.get(ref.get(qn("w:val")), {})
        return out

    # ── paragraph classification ──

    def _style_name(self, p_el):
        ppr = p_el.find(qn("w:pPr"))
        st = ppr.find(qn("w:pStyle")) if ppr is not None else None
        sid = st.get(qn("w:val")) if st is not None else ""
        return self.styles.get(sid, sid or "Normal")

    def _list_info(self, p_el, style):
        ppr = p_el.find(qn("w:pPr"))
        numpr = ppr.find(qn("w:numPr")) if ppr is not None else None
        if numpr is not None and numpr.find(qn("w:numId")) is not None:
            num_id = numpr.find(qn("w:numId")).get(qn("w:val"))
            if num_id == "0":
                return None
            ilvl_el = numpr.find(qn("w:ilvl"))
            ilvl = int(ilvl_el.get(qn("w:val"))) if ilvl_el is not None else 0
            fmt = self.num_fmt.get(num_id, {}).get(str(ilvl), "bullet")
            return ilvl, ("bulletList" if fmt in ("bullet", "none") else "orderedList")
        if style.startswith("List Bullet"):
            return 0, "bulletList"
        if style.startswith("List Number"):
            return 0, "orderedList"
        return None

    # ── the walk ──

    def parse(self):
        body = self.doc.element.body
        blocks_pending_list = []  # (ilvl, kind, inline)
        for el in body.iterchildren():
            if el.tag == qn("w:p"):
                style = self._style_name(el)
                li = self._list_info(el, style)
                if li is not None:
                    inline = _inline(el)
                    if inline:
                        blocks_pending_list.append((li[0], li[1], inline))
                    continue
                if blocks_pending_list:
                    self._emit(self._build_list(blocks_pending_list))
                    blocks_pending_list = []
                self._paragraph(el, style)
            elif el.tag == qn("w:tbl"):
                if blocks_pending_list:
                    self._emit(self._build_list(blocks_pending_list))
                    blocks_pending_list = []
                table = self._table(el)
                if table:
                    self._emit(table)
        if blocks_pending_list:
            self._emit(self._build_list(blocks_pending_list))
        self._finish()
        return self

    def _paragraph(self, el, style):
        text = "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()
        level = None
        m = re.match(r"(?i)heading\s*(\d)", style)
        if m:
            level = int(m.group(1))
        if style == "Title":
            if not self.title:
                self.title = title_case(text)
            return
        if style == "Subtitle":
            if not self.subtitle:
                self.subtitle = text
            return
        if not text:
            return
        if level == 1:
            if re.match(r"(?i)^part\s+[ivxlc\d]+\b", text) and self.chapters:
                self.pending_part = title_case(text)
                return
            self.chapters.append(Chapter(title=title_case(text)))
            self.pending_part = None
            return
        if level == 2:
            ch = self._chapter()
            if not ch.sections and not ch.intro and not ch.subtitle and not NUMBERED.match(text):
                ch.subtitle = text
                return
            ch.sections.append(Section(title=NUMBERED.sub("", text).strip() or text))
            if self.pending_part:
                ch.sections[-1].blocks.append(
                    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": self.pending_part}]}
                )
                self.pending_part = None
            return
        if level:  # 3+ → headings inside the note (h2…h4)
            self._emit({"type": "heading", "attrs": {"level": min(max(level - 1, 2), 4)}, "content": _inline(el) or [{"type": "text", "text": text}]})
            return
        inline = _inline(el)
        if not inline:
            return
        if style in ("Block Text", "Quote", "Intense Quote"):
            self._emit({"type": "blockquote", "content": [_para(inline)]})
        else:
            self._emit(_para(inline))

    def _chapter(self):
        if not self.chapters:
            self.chapters.append(Chapter(title=self.title or "Chapter 1"))
        return self.chapters[-1]

    def _emit(self, block):
        if not self.chapters:
            return  # front matter before the first chapter (book title page etc.)
        ch = self.chapters[-1]
        (ch.sections[-1].blocks if ch.sections else ch.intro).append(block)

    def _build_list(self, items):
        """[(ilvl, kind, inline)] → a nested bullet/ordered list node."""

        def build(i, depth):
            kind = items[i][1]
            node = {"type": kind, "content": []}
            while i < len(items) and items[i][0] >= depth:
                lvl, k, inline = items[i]
                if lvl > depth and node["content"]:
                    sub, i = build(i, lvl)
                    node["content"][-1]["content"].append(sub)
                    continue
                node["content"].append({"type": "listItem", "content": [_para(inline)]})
                i += 1
            return node, i

        out, i = build(0, items[0][0])
        # A run can break back to a shallower level than it started at; append those as siblings.
        extra = []
        while i < len(items):
            more, i = build(i, items[i][0])
            extra.append(more)
        if extra:
            return [out, *extra]
        return out

    def _table(self, tbl):
        rows = []
        for r_index, tr in enumerate(tbl.findall(qn("w:tr"))):
            cells = []
            for tc in tr.findall(qn("w:tc")):
                tcpr = tc.find(qn("w:tcPr"))
                span = tcpr.find(qn("w:gridSpan")) if tcpr is not None else None
                vmerge = tcpr.find(qn("w:vMerge")) if tcpr is not None else None
                if vmerge is not None and vmerge.get(qn("w:val")) in (None, "continue"):
                    continue  # covered by the cell above
                paras = [_para(_inline(p)) for p in tc.findall(qn("w:p"))]
                paras = [p for p in paras if p.get("content")] or [_para([])]
                cell = {"type": "tableHeader" if r_index == 0 else "tableCell", "content": paras}
                if span is not None and (span.get(qn("w:val")) or "1") != "1":
                    cell["attrs"] = {"colspan": int(span.get(qn("w:val")))}
                cells.append(cell)
            if cells:
                rows.append({"type": "tableRow", "content": cells})
        return {"type": "table", "content": rows} if rows else None

    def _finish(self):
        for ch in self.chapters:
            # lists built as [node, node] were emitted as one block; flatten
            for holder in [ch.intro, *[s.blocks for s in ch.sections]]:
                flat = []
                for b in holder:
                    flat.extend(b if isinstance(b, list) else [b])
                holder[:] = flat
            if ch.intro:
                ch.sections.insert(0, Section(title="Introduction", blocks=ch.intro))
                ch.intro = []
            if not ch.sections:
                self.warnings.append(f"Chapter “{ch.full_title()}” has no text and was skipped.")
        self.chapters = [c for c in self.chapters if c.sections]
        if not self.chapters:
            raise DocxImportError(
                "No chapters found. Chapters must use the Word style “Heading 1” and sections “Heading 2”."
            )


def parse_docx(upload):
    """An uploaded .docx → _Parser with .title, .subtitle, .chapters, .warnings."""
    name = (getattr(upload, "name", "") or "").lower()
    if not name.endswith(".docx"):
        raise DocxImportError("Choose a Word .docx file (in Word: File → Save As → Word Document).")
    if upload.size > MAX_BYTES:
        raise DocxImportError("The file is too large (max 15 MB).")
    upload.seek(0)
    if upload.read(4) != b"PK\x03\x04":
        raise DocxImportError("This isn't a valid .docx file.")
    upload.seek(0)
    try:
        with zipfile.ZipFile(upload) as z:
            if sum(i.file_size for i in z.infolist()) > 25 * MAX_BYTES:
                raise DocxImportError("The file expands to an unreasonable size.")
        upload.seek(0)
        document = Document(upload)
    except DocxImportError:
        raise
    except Exception as exc:  # corrupt zip / not a Word file
        raise DocxImportError(f"Couldn't read the document ({exc.__class__.__name__}).")
    return _Parser(document).parse()


# ─────────────────────────── applying it ───────────────────────────


def default_prefix(title: str) -> str:
    words = [w for w in re.findall(r"[A-Za-z]+", title) if w.lower() not in SMALL_WORDS]
    return ("".join(w[0] for w in words[:4]).upper() or "NOTES")[:8]


def section_code(prefix, ci, si):
    return f"{prefix}-{ci:02d}-{si:02d}"


def outline(parsed, prefix):
    return [
        {
            "title": ch.full_title(),
            "sections": [
                {"code": section_code(prefix, ci, si), "title": s.title, "words": s.words(), "tables": s.tables()}
                for si, s in enumerate(ch.sections, 1)
            ],
        }
        for ci, ch in enumerate(parsed.chapters, 1)
    ]


def check_conflicts(parsed, paper: Paper, subject_title: str, prefix: str):
    """Codes this import would take that already belong to a different subject in the track."""
    codes = [section_code(prefix, ci, si) for ci, ch in enumerate(parsed.chapters, 1) for si in range(1, len(ch.sections) + 1)]
    clash = (
        MicroTheme.objects.filter(track=paper.track, code__in=codes)
        .exclude(topic__subject__paper=paper, topic__subject__title=subject_title)
        .values_list("code", flat=True)
    )
    return sorted(clash)


@transaction.atomic
def apply_import(parsed, *, paper: Paper, subject_title: str, prefix: str, status: str, kind: str, user):
    """Create/update subject → topics → micro-themes → notes. New items get `status`; existing ones keep theirs."""
    if kind not in NoteKind.values:
        raise DocxImportError("Unknown note type.")
    if status not in Status.values:
        raise DocxImportError("Unknown status.")
    clash = check_conflicts(parsed, paper, subject_title, prefix)
    if clash:
        raise DocxImportError(f"Codes already used by another subject in this exam: {', '.join(clash[:5])}… — choose a different code prefix.")

    counts = {"topics_created": 0, "micro_themes_created": 0, "micro_themes_updated": 0, "notes_written": 0}
    subject = Subject.objects.filter(paper=paper, title=subject_title).first()
    if subject is None:
        last = Subject.objects.filter(paper=paper).order_by("-order").first()
        subject = Subject.objects.create(
            paper=paper, title=subject_title, code=prefix, status=status, order=(last.order + 1) if last else 1
        )
    for ci, ch in enumerate(parsed.chapters, 1):
        title = ch.full_title()[:255]
        topic = Topic.objects.filter(subject=subject, title=title).first()
        if topic is None:
            topic = Topic(subject=subject, title=title, status=status)
            counts["topics_created"] += 1
        topic.order = ci
        topic.code = f"{ci:02d}"
        topic.save()
        for si, sec in enumerate(ch.sections, 1):
            code = section_code(prefix, ci, si)
            mt = MicroTheme.objects.filter(track=paper.track, code=code).first()
            if mt is None:
                mt = MicroTheme(code=code, status=status)
                counts["micro_themes_created"] += 1
            else:
                counts["micro_themes_updated"] += 1
            mt.topic, mt.title, mt.order = topic, sec.title[:255], si
            mt.save()
            note = Note.objects.filter(micro_theme=mt, kind=kind).first() or Note(micro_theme=mt, kind=kind, status=status)
            note.body = validate_doc(sec.doc())
            note.updated_by = user
            note.save()
            counts["notes_written"] += 1
    return subject, counts
