"""
Notes from whole books: Word (.docx) books of notes placed, section by section, into a syllabus.

A book is read as a stream of blocks (the same rich-document format as the editor, converted by
docx_import's parser: inline formatting, nested lists and tables kept) with its headings as markers.
It is then cut into chapters and their numbered parts, and each syllabus section (a micro-theme) gets
the chapters, or the runs of parts, that the mapping assigns to it, in book order:

    the source chapter's title   → heading 2 (at the start of each piece, so a reader always knows where it is from)
    a part ("PART 3 …", "3. …")  → heading 3 (as are dividers such as "PART B: …" or "PART I — ADMINISTRATION")
    headings inside a part       → heading 4

Text before a chapter's first part (its introduction) goes with the first piece taken from that chapter.
The mapping must use every part of every chapter exactly once; the build checks that, so nothing in a
book is dropped or duplicated.

    build(books, mapping) → {code: doc}
    load(bundle, get_model) → creates the notes (published), leaving any note that already has text alone
"""

from __future__ import annotations

import re

from docx import Document
from docx.oxml.ns import qn

from .docx_import import _inline, _para, _Parser, title_case
from .richtext import doc_to_text, validate_doc

SKIP_STYLES = {"Title", "Subtitle", "Date", "TOC Heading", "Contents Note", "Module Subtitle", "Module Contents Label", "Module Contents"}


class _Stream(_Parser):
    """docx_import's parser, but every block (and every heading, as a marker) goes into one flat stream."""

    def __init__(self, document):
        super().__init__(document)
        self.items: list[dict] = []

    def _emit(self, block):
        self.items.append(block)

    def _paragraph(self, el, style):
        if style in SKIP_STYLES or style.lower().startswith("toc"):
            return
        m = re.match(r"(?i)heading\s*(\d)", style)
        if m:
            parts, text = [], ""
            for node in el.iter():
                if node.tag == qn("w:t"):
                    text += node.text or ""
                elif node.tag == qn("w:tab"):  # "1.1<tab>Who They Were"
                    text += " "
                elif node.tag in (qn("w:br"), qn("w:cr")):
                    parts.append(text)
                    text = ""
            parts.append(text)
            text = " · ".join(p.strip().replace("\t", " ") for p in parts if p.strip())
            if text:
                self.items.append({"type": "_h", "level": int(m.group(1)), "text": re.sub(r"\s+", " ", text)})
            return
        inline = _inline(el)
        if not inline:
            return
        if style == "Label":
            for n in inline:
                if n["type"] == "text" and {"type": "bold"} not in n.get("marks", []):
                    n["marks"] = [*n.get("marks", []), {"type": "bold"}]
            self._emit(_para(inline))
        elif style == "Key Point":
            self._emit({"type": "callout", "attrs": {"tone": "exam"}, "content": [_para(inline)]})
        elif style == "Note":
            self._emit({"type": "callout", "attrs": {"tone": "info"}, "content": [_para(inline)]})
        elif style == "Module Tagline":
            self._emit(_para([{**n, "marks": [{"type": "italic"}]} if n["type"] == "text" else n for n in inline]))
        elif style in ("Block Text", "Quote", "Intense Quote"):
            self._emit({"type": "blockquote", "content": [_para(inline)]})
        else:
            self._emit(_para(inline))

    def _finish(self):
        flat = []
        for b in self.items:
            flat.extend(b if isinstance(b, list) else [b])
        self.items = flat


def stream(path) -> list[dict]:
    return _Stream(Document(path)).parse().items


def nice(text: str) -> str:
    """ALL-CAPS headings → title case; others as written."""
    letters = [c for c in text if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.8:
        text = title_case(text.upper())
    return tidy_heading(text)


def tidy_heading(text: str) -> str:
    """'1.1Who They Were' → '1.1 Who They Were'; 'Part 2 · the Timeline' / '3. the Toolkit' → '… The …'."""
    text = re.sub(r"^(\d+(?:\.\d+)+)(?=[^\s\d.])", r"\1 ", text)
    return re.sub(r"(^\d+(?:\.\d+)*\.\s+|^\d+(?:\.\d+)+\s+|\s·\s)([a-z])", lambda m: m.group(1) + m.group(2).upper(), text)


def tidy_doc(doc: dict) -> bool:
    """Tidy the headings of a stored note in place; True if anything changed."""
    changed = False
    for block in doc.get("content", []):
        if block.get("type") == "heading" and block.get("content") and block["content"][0].get("type") == "text":
            first = block["content"][0]
            new = tidy_heading(first["text"])
            if new != first["text"]:
                first["text"], changed = new, True
    return changed


class Chapter:
    def __init__(self, key, title):
        self.key, self.title = key, title
        self.head: list = []          # text before the first part
        self.parts: dict[int, list] = {}  # part number → blocks (its own heading first)
        self.order: list[int] = []


def chapters(items, *, chapter_level: int, part_level: int, chapter_key, part_number, divider=None) -> dict:
    """
    Cut a stream into chapters (headings at chapter_level that chapter_key accepts) and their numbered parts
    (headings at part_level that part_number numbers). Unnumbered headings at the part level (or that `divider`
    accepts, at any level above it) are dividers: they join the next part.
    """
    out: dict = {}
    ch: Chapter | None = None
    current: list | None = None
    pending: list = []

    def heading(level, text):
        return {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}

    for it in items:
        if it["type"] == "_h":
            level, text = it["level"], it["text"]
            key = chapter_key(level, text)
            if key is not None:
                ch = out[key] = Chapter(key, nice(text))
                current, pending = ch.head, []
                continue
            if ch is None:
                continue  # front matter
            if level <= part_level and (divider and divider(level, text)):
                pending.append(heading(3, nice(text)))
                continue
            if level == part_level:
                n = part_number(text)
                if n is None:
                    if not ch.parts:  # a subtitle before the first part
                        ch.head.append({"type": "paragraph", "content": [{"type": "text", "text": nice(text), "marks": [{"type": "italic"}]}]})
                    else:
                        pending.append(heading(3, nice(text)))
                    continue
                if n in ch.parts:
                    raise ValueError(f"{ch.title}: part {n} appears twice")
                ch.parts[n] = [*pending, heading(3, nice(text))]
                ch.order.append(n)
                current, pending = ch.parts[n], []
                continue
            if level < part_level:
                current = None  # a level above the parts that isn't a chapter (e.g. a unit): its text, if any, is reported
                continue
            (current if current is not None else ch.head).append(heading(4, nice(text)))
            continue
        if ch is not None and current is not None:
            current.append(it)
        else:
            STRAY.append(it)
    return out


STRAY: list = []  # blocks that fell outside every chapter (front matter, unit introductions): checked by the build


def build(books: dict, mapping: dict) -> dict:
    """
    books: name → {key: Chapter}; mapping: code → [(book, chapter key, parts)], parts = None for the whole
    chapter or an iterable of part numbers. Returns code → doc, after checking every part is used once.
    """
    used: dict = {}
    head_done: set = set()
    notes = {}
    for code, pieces in mapping.items():
        blocks: list = []
        for book, key, parts in pieces:
            ch = books[book][key]
            take = list(ch.order) if parts is None else [p for p in ch.order if p in set(parts)]
            if parts is not None and len(take) != len(set(parts)):
                raise ValueError(f"{code}: {ch.title} has no part(s) {sorted(set(parts) - set(take))}")
            blocks.append({"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": ch.title}]})
            if (book, key) not in head_done:
                blocks.extend(ch.head)
                head_done.add((book, key))
            for p in take:
                if (book, key, p) in used:
                    raise ValueError(f"{ch.title} part {p} is placed twice ({used[(book, key, p)]} and {code})")
                used[(book, key, p)] = code
                blocks.extend(ch.parts[p])
        notes[code] = validate_doc({"type": "doc", "content": blocks})
    for book, chs in books.items():
        for key, ch in chs.items():
            missing = [p for p in ch.order if (book, key, p) not in used]
            if missing:
                raise ValueError(f"{book}: {ch.title} parts {missing} are not placed anywhere")
    return notes


# ───────────────────────────── APPSC Group I: Indian history ─────────────────────────────


def _num(pattern):
    def f(text):
        m = re.match(pattern, text, re.I)
        return int(m.group(1)) if m else None
    return f


def appsc_history_books(ancient: str, medieval: str, modern: str) -> dict:
    anc = chapters(
        stream(ancient), chapter_level=1, part_level=2,
        chapter_key=lambda lvl, t: _num(r"^Module\s+(\d+)")(t) if lvl == 1 else None,
        part_number=_num(r"^PART\s+(\d+)"),
    )
    med_titles = iter(range(1, 100))
    med = chapters(
        stream(medieval), chapter_level=1, part_level=2,
        chapter_key=lambda lvl, t: next(med_titles) if lvl == 1 and not re.match(r"(?i)^PART\s+[IVX]+\b", t) else None,
        part_number=_num(r"^(\d+)\.\s"),
        divider=lambda lvl, t: lvl == 1 and re.match(r"(?i)^PART\s+[IVX]+\b", t),
    )
    mod = chapters(
        stream(modern), chapter_level=2, part_level=3,
        chapter_key=lambda lvl, t: _num(r"^Chapter\s+(\d+)")(t) if lvl == 2 else None,
        part_number=_num(r"^(\d+)\.\s"),
        divider=lambda lvl, t: lvl == 2 and re.match(r"(?i)^PART\s+[A-Z]\b", t),
    )
    return {"anc": anc, "med": med, "mod": mod}


def r(a, b):
    return range(a, b + 1)


# Comprehensive Notes → Paper II → History and Culture of India (NC-P2-1-<unit>-<section>)
APPSC_HISTORY = {
    # 1. Ancient and Early Indian History
    "01-01": [("anc", 1, None)], "01-02": [("anc", 2, None)], "01-03": [("anc", 3, None)],
    "01-04": [("anc", 4, None)], "01-05": [("anc", 5, None)],
    "01-06": [("anc", 6, r(1, 4))], "01-07": [("anc", 6, r(5, 10))], "01-08": [("anc", 6, r(11, 22))],
    "01-09": [("anc", 9, r(1, 5))], "01-10": [("anc", 9, r(6, 14))],
    "01-11": [("anc", 8, None)], "01-12": [("anc", 10, None)], "01-13": [("anc", 7, None)],
    "01-14": [("anc", 11, None)], "01-15": [("anc", 12, None)], "01-16": [("anc", 16, None)],
    "01-17": [("anc", 17, None)],
    # 2. South Indian Dynasties (the Hoysalas and Yadavas have no chapter in the books)
    "02-01": [("anc", 14, r(1, 9))], "02-02": [("anc", 13, r(1, 11))], "02-03": [("anc", 13, r(13, 19))],
    "02-04": [("anc", 14, r(10, 20))], "02-05": [("anc", 13, [12])], "02-06": [("anc", 15, None)],
    # 3. Medieval Cultural Developments
    "03-01": [("med", 1, None)], "03-02": [("med", 2, r(1, 5))], "03-03": [("med", 2, r(6, 16))],
    "03-04": [("med", 3, None)], "03-05": [("med", 4, None)], "03-06": [("med", 5, None)],
    "03-07": [("med", 6, r(1, 4))], "03-08": [("med", 6, r(5, 17))], "03-09": [("med", 7, None)],
    "03-10": [("med", 8, None)],
    "03-11": [("mod", 1, r(1, 6))], "03-12": [("mod", 1, r(7, 12))], "03-13": [("mod", 2, None)],
    "03-14": [("mod", 3, None), ("mod", 4, None), ("mod", 5, None)], "03-15": [("mod", 6, None)],
    # 4. British Rule, National Consciousness and Reform Movements
    "04-01": [("mod", 7, [1, 2, 3, 5, 6, 7, 8, 9]), ("mod", 8, None)], "04-02": [("mod", 7, [4])],
    "04-03": [("mod", 9, None)], "04-04": [("mod", 10, None), ("mod", 11, None), ("mod", 12, None)],
    "04-05": [("mod", 13, None)], "04-06": [("mod", 18, None), ("mod", 19, None)],
    "04-07": [("mod", 14, None), ("mod", 15, None), ("mod", 16, None), ("mod", 17, None)],
    "04-08": [("mod", 24, r(1, 2))], "04-09": [("mod", 23, None), ("mod", 24, r(3, 6))],
    "04-10": [("mod", 21, None)], "04-11": [("mod", 20, None)], "04-12": [("mod", 22, None)],
    "04-13": [("mod", 25, r(1, 4))], "04-14": [("mod", 25, r(5, 7))], "04-15": [("mod", 25, r(8, 13))],
    "04-16": [("mod", 30, [3])], "04-17": [("mod", 26, None)],
    # 5. Indian Nationalism, Freedom Struggle and Post-Independence India (the books end in 1947)
    "05-01": [("mod", 27, None), ("mod", 28, None), ("mod", 29, None), ("mod", 30, [1, 2, 4, 5, 9, 10, 11])],
    "05-02": [("mod", 37, [7])],
    "05-03": [("mod", 31, None), ("mod", 32, None), ("mod", 33, None), ("mod", 34, None)],
    "05-04": [("mod", 37, [1, 2, 3, 4, 5, 6, 8, 9, 10]), ("mod", 38, None)],
    "05-05": [("mod", 35, None), ("mod", 36, r(1, 3))], "05-06": [("mod", 39, None), ("mod", 40, None)],
    "05-07": [("mod", 30, r(6, 7))], "05-10": [("mod", 30, [8])], "05-11": [("mod", 36, r(4, 9))],
}


def build_appsc_history(ancient: str, medieval: str, modern: str) -> dict:
    books = appsc_history_books(ancient, medieval, modern)
    notes = build(books, {f"NC-P2-1-{k}": v for k, v in APPSC_HISTORY.items()})
    return {
        "track": {"commission": "appsc", "group": "group-1"},
        "kind": "comprehensive",
        "source": "Ancient Indian History (book edition), Medieval Indian History, Modern Indian History",
        "notes": notes,
    }


# ───────────────────────────── loading ─────────────────────────────


def read(path) -> dict:
    import gzip
    import json

    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load(bundle: dict, get_model) -> dict:
    """Create the bundle's notes, published. A section whose note of this kind already has text is left alone."""
    from django.contrib.postgres.search import SearchVector

    Track, MicroTheme, Note = get_model("Track"), get_model("MicroTheme"), get_model("Note")
    ref = bundle["track"]
    track = Track.objects.filter(commission__slug=ref["commission"], group__slug=ref["group"]).first()
    if track is None:
        return {"skipped": "track not found"}
    kind = bundle["kind"]
    mts = {m.code: m for m in MicroTheme.objects.filter(track=track, code__in=list(bundle["notes"]))}
    counts = {"created": 0, "filled": 0, "kept": 0, "missing": 0}
    for code, doc in bundle["notes"].items():
        mt = mts.get(code)
        if mt is None:
            counts["missing"] += 1
            continue
        note = Note.objects.filter(micro_theme=mt, kind=kind).first()
        if note is not None and (note.body_text or "").strip():
            counts["kept"] += 1
            continue
        text = doc_to_text(doc)
        if note is None:
            note = Note.objects.create(micro_theme=mt, kind=kind, body=doc, body_text=text, status="published")
            counts["created"] += 1
        else:
            note.body, note.body_text, note.status = doc, text, "published"
            note.save()
            counts["filled"] += 1
        Note.objects.filter(pk=note.pk).update(search_vector=SearchVector("body_text", config="english"))
    return counts
