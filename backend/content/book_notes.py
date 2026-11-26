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

    def __init__(self, document, mono=False):
        super().__init__(document)
        self.items: list[dict] = []
        self.mono = mono  # keep fixed-width lines (text diagrams) as they are, joined into code blocks

    def _emit(self, block):
        self.items.append(block)

    def _paragraph(self, el, style):
        if style in SKIP_STYLES or style.lower().startswith("toc"):
            return
        if self.mono and _monospace(el):
            text = "".join(" " if n.tag == qn("w:tab") else (n.text or "") for n in el.iter(qn("w:t"), qn("w:tab")))
            if text.strip():
                last = self.items[-1] if self.items else None
                if last and last.get("type") == "codeBlock":
                    last["content"][0]["text"] += ("\n\n" if last.pop("_gap", False) else "\n") + text.rstrip()
                else:
                    self.items.append({"type": "codeBlock", "content": [{"type": "text", "text": text.rstrip()}]})
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
            if self.mono and self.items and self.items[-1].get("type") == "codeBlock":
                self.items[-1]["_gap"] = True  # a blank line inside a diagram
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
            if isinstance(b, dict):
                b.pop("_gap", None)
            flat.extend(b if isinstance(b, list) else [b])
        self.items = flat


MONO_FONTS = {"consolas", "courier new", "courier", "lucida console", "menlo", "monaco"}


def _monospace(el) -> bool:
    """A paragraph set wholly in a fixed-width font (a line of a text diagram)."""
    fonts = []
    for r in el.iter(qn("w:r")):
        if not "".join(t.text or "" for t in r.iter(qn("w:t"))).strip():
            continue
        rf = r.find(qn("w:rPr") + "/" + qn("w:rFonts"))
        fonts.append((rf.get(qn("w:ascii")) or "").lower() if rf is not None else "")
    return bool(fonts) and all(f in MONO_FONTS for f in fonts)


def stream(path, mono=False) -> list[dict]:
    return _Stream(Document(path), mono=mono).parse().items


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


# ───────────────────────────── APPSC Group I: Indian economy ─────────────────────────────


def economy_book(path: str) -> dict:
    """
    "Indian Economy — Topic Notes": TOPIC n (heading 1) → sections "k. TITLE" (heading 2; the unnumbered opener,
    "THE WHOLE TOPIC IN ONE PICTURE", is section "P") → numbered sub-sections "k.j Title" (heading 3, the parts).
    Each section is a chapter keyed (topic, k); each topic's own heading and subtitle are chapter (topic, "T").
    """
    state = {"topic": None}

    def key(level, text):
        if level == 1:
            m = re.match(r"(?i)^TOPIC\s+(\d+)\b", text)
            if not m:
                raise ValueError(f"Unexpected heading 1: {text!r}")
            state["topic"] = int(m.group(1))
            return (state["topic"], "T")
        if level == 2 and state["topic"] is not None:
            m = re.match(r"^(\d+)\.\s", text)
            return (state["topic"], int(m.group(1)) if m else "P")
        return None

    items = [{**it, "text": it["text"].replace("**", "")} if it["type"] == "_h" else it for it in stream(path, mono=True)]
    return {"eco": chapters(items, chapter_level=2, part_level=3, chapter_key=key, part_number=_num(r"^\d+\.(\d+)\s"))}


def _sec(topic, *keys, parts=None):
    """Whole sections of a topic, or (with parts) some numbered sub-sections of one section."""
    if parts is not None:
        return [("eco", (topic, keys[0]), parts)]
    return [("eco", (topic, k), None) for k in keys]


def _open(topic, *keys):
    """A topic's opening: its own heading and subtitle, the one-page picture, then the given sections."""
    return _sec(topic, "T", "P", *keys)


# Comprehensive Notes → Paper IV → Economy & Development (NC-P4-1-<topic>-<section>). The book's own topic numbers
# (1, 2, 6, 7, 8, 11) are its source syllabus's; here they go to the topics of the same name. A topic's opening (its
# picture and first principles) goes with its first section; its closing (how it connects, the way forward, rapid
# revision) with its strategy section where the syllabus has one, else with its last section that has notes.
# Sections the book doesn't cover stay empty, to be written later: 02-05 India and WTO, 03-09 banking reforms,
# 03-11 stock exchanges and SEBI, 07-13/14/15 (A.P. schemes, A.P. skilling, DWCRA), 10-13 Stand-up India, and the
# whole of the A.P. topics and topics 01 and 05 (the book has no chapters on them).
APPSC_ECONOMY = {
    # 1. Major Challenges of the Indian Economy (book: Topic 1)
    "02-01": _open(1, 0, 1), "02-02": _sec(1, 2, 3), "02-03": _sec(1, 4), "02-04": _sec(1, 5),
    "02-06": _sec(1, 6), "02-07": _sec(1, 7), "02-08": _sec(1, 8), "02-09": _sec(1, 9),
    "02-10": _sec(1, 10, 11, 12, 13, 14),
    # 2. Resource Mobilisation in the Indian Economy (book: Topic 2)
    "03-01": _open(2, 0, 1), "03-02": _sec(2, 2, 3, 4), "03-03": _sec(2, 5), "03-04": _sec(2, 6),
    "03-05": _sec(2, 7), "03-06": _sec(2, 8), "03-07": _sec(2, 9, 10), "03-08": _sec(2, 12),
    "03-10": _sec(2, 11), "03-12": _sec(2, 13), "03-13": _sec(2, 14), "03-14": _sec(2, 15, 16, 17),
    # 6. Inclusive Growth (book: Topic 6)
    "07-01": _open(6, 0, 1, 2), "07-02": _sec(6, 15, 16, 17), "07-03": _sec(6, 3), "07-04": _sec(6, 4),
    "07-05": _sec(6, 5, 6), "07-06": _sec(6, 7), "07-07": _sec(6, 8), "07-08": _sec(6, 9),
    "07-09": _sec(6, 10, 11), "07-10": _sec(6, 12), "07-11": _sec(6, 13), "07-12": _sec(6, 14),
    # 7. Agricultural Development (book: Topic 7)
    "08-01": _open(7, 0, 1, 2), "08-02": _sec(7, 3), "08-03": _sec(7, 4, parts=r(3, 7)), "08-04": _sec(7, 5),
    "08-05": _sec(7, 4, parts=[2]), "08-06": _sec(7, 4, parts=[1]), "08-07": _sec(7, 6, 7, 8, 9),
    "08-08": _sec(7, 10), "08-09": _sec(7, 11, 14, 15, 16), "08-10": _sec(7, 12), "08-11": _sec(7, 13),
    # 9. Industrial Development and Policy (book: Topic 8)
    "10-01": _open(8, 0, 1), "10-02": _sec(8, 2), "10-03": _sec(8, 3), "10-04": _sec(8, 4), "10-05": _sec(8, 5),
    "10-06": _sec(8, 6), "10-07": _sec(8, 7), "10-08": _sec(8, 8), "10-09": _sec(8, 9),
    "10-10": _sec(8, 10, parts=[1]), "10-11": _sec(8, 11), "10-12": _sec(8, 12), "10-14": _sec(8, 10, parts=[2]),
    "10-15": _sec(8, 13), "10-16": _sec(8, 14, 15, 16, 17),
    # 11. Infrastructure in India (book: Topic 11)
    "12-01": _open(11, 0) + _sec(11, 1, parts=r(1, 5)), "12-02": _sec(11, 1, parts=[6]), "12-03": _sec(11, 2),
    "12-04": _sec(11, 3), "12-05": _sec(11, 4), "12-06": _sec(11, 5, 6), "12-07": _sec(11, 7, parts=[5]),
    "12-08": _sec(11, 7, parts=r(1, 4)), "12-09": _sec(11, 8), "12-10": _sec(11, 9), "12-11": _sec(11, 10),
    "12-12": _sec(11, 11), "12-13": _sec(11, 12, 13, 14, 15),
}


def build_appsc_economy(path: str) -> dict:
    books = economy_book(path)
    mapping = {f"NC-P4-1-{k}": v for k, v in APPSC_ECONOMY.items()}
    placed = {key for pieces in mapping.values() for _, key, _ in pieces}
    left = [ch.title for key, ch in books["eco"].items() if key not in placed]
    if left:  # build() checks the parts; a section without parts must be placed too
        raise ValueError(f"Sections not placed anywhere: {left}")
    return {
        "track": {"commission": "appsc", "group": "group-1"},
        "kind": "comprehensive",
        "source": "Indian Economy — Topic Notes",
        "notes": build(books, mapping),
    }


# ───────────────────────────── APPSC Group I: history and culture of Andhra Pradesh ─────────────────────────────


class _TitledStream(_Stream):
    """A book whose chapters start at a "Title" paragraph (or, for its first, a line in capitals): those become
    level-0 heading markers; the cover and contents before the first chapter are dropped."""

    def __init__(self, document, first_title):
        super().__init__(document)
        self.first_title = first_title
        self.started = False

    def _paragraph(self, el, style):
        text = re.sub(r"\s+", " ", "".join(t.text or "" for t in el.iter(qn("w:t")))).strip()
        if style == "Title" or (not self.started and text == self.first_title):
            self.started = True
            self.items.append({"type": "_h", "level": 0, "text": text})
            return
        if not self.started:
            return  # the cover and the contents
        if style == "Normal" and re.match(r"^Part [IVX]+ [–-] ", text):
            return  # "Part II – Modern Andhra": the book's own grouping, not notes
        super()._paragraph(el, style)


def titled_chapters(items) -> dict:
    """Chapters from level-0 markers; every heading 1 is a part, numbered in order (1, 2, …) whatever its label
    ("(a) Administration", "3. Political History", "Quick Revision"). A heading 2 that opens a group of parts
    ("Part A: …") joins the next part; other headings 2 and 3 are sub-headings of the part they fall in."""
    out: dict = {}
    ch = current = None
    pending: list = []

    def heading(level, text):
        return {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}

    for it in items:
        if it["type"] == "_h":
            level, text = it["level"], tidy_heading(it["text"])
            if level == 0:
                key = len(out) + 1
                ch = out[key] = Chapter(key, nice(text))
                current, pending = ch.head, []
            elif ch is None:
                continue
            elif level == 1:
                n = len(ch.order) + 1
                ch.parts[n] = [*pending, heading(3, text)]
                ch.order.append(n)
                current, pending = ch.parts[n], []
            elif level == 2 and re.match(r"(?i)^Part [A-Z]\b", text):
                pending.append(heading(3, text))
            else:
                current.append(heading(4, text))
            continue
        if ch is not None:
            current.append(it)
    if pending:
        raise ValueError(f"{ch.title}: a divider with no part after it")
    return out


def ap_history_book(path: str) -> dict:
    return {"aph": titled_chapters(_TitledStream(Document(path), "THE SATAVAHANAS").parse().items)}


# Mains Notes → Paper II → History and Culture of Andhra Pradesh (NM-P2-2-<topic>-<section>), from "Andhra Pradesh
# History — Revision Notes" (chapters numbered as in the book: 1 Satavahanas … 17 Formation of Andhra State).
# Where a chapter covers several syllabus sections it is split by its parts: the social reformers go to 03-08, the
# freedom fighters to 04-08, nationalist and revolutionary literature (Part C) to 04-04, the Dalit writers (Part B)
# to 04-05, and Potti Sriramulu's fast to 04-12 (formation of Andhra State). Sections the book doesn't cover stay
# empty, to be written later.
APPSC_AP_HISTORY = {
    # 6. Ancient Andhra
    "01-01": [("aph", 1, None)], "01-02": [("aph", 2, None)], "01-03": [("aph", 3, None)], "01-04": [("aph", 4, None)],
    "01-05": [("aph", 6, None)], "01-07": [("aph", 7, None)], "01-09": [("aph", 5, None)],
    # 7. Medieval Andhra
    "02-03": [("aph", 8, None)], "02-05": [("aph", 9, None)],
    # 8. Modern Andhra
    "03-01": [("aph", 10, None)], "03-03": [("aph", 11, None)], "03-04": [("aph", 12, None)],
    "03-05": [("aph", 13, [1, 2, 3, 4, 6])],
    "03-08": [("aph", 14, r(1, 3)), ("aph", 15, [1]), ("aph", 13, [5])],
    # 9. Nationalist Movement
    "04-04": [("aph", 14, r(7, 12))], "04-05": [("aph", 14, r(4, 6))], "04-08": [("aph", 15, r(2, 7))],
    "04-09": [("aph", 16, [1])], "04-10": [("aph", 16, r(2, 5))],
    "04-11": [("aph", 17, [1, 2, 3, 4, 6, 7])], "04-12": [("aph", 17, [5])],
}


def build_appsc_ap_history(path: str) -> dict:
    notes = build(ap_history_book(path), {f"NM-P2-2-{k}": v for k, v in APPSC_AP_HISTORY.items()})
    return {
        "track": {"commission": "appsc", "group": "group-1"},
        "kind": "mains",
        "source": "Andhra Pradesh History — Revision Notes",
        "notes": notes,
    }


# ───────────────────────────── APPSC Group I: ethics ─────────────────────────────


def ethics_book(path: str) -> dict:
    """"Ethics, Integrity and Aptitude — Complete Notes": CHAPTER n (heading 1) → PART k (heading 2) → headings 3–4."""
    return {"eth": chapters(
        stream(path), chapter_level=1, part_level=2,
        chapter_key=lambda lvl, t: _num(r"^CHAPTER\s+(\d+)\b")(t) if lvl == 1 else None,
        part_number=_num(r"^PART\s+(\d+)\b"),
    )}


# Syllabus-Wise Notes → Paper III → Ethics in Public Service and Knowledge of Law (NC-P3-3-<chapter>-<section>), from
# "Ethics, Integrity and Aptitude — Complete Notes" (11 chapters, numbered as in the book). The book's chapters are
# cut by part and placed under the syllabus's own headings; a chapter's revision toolkit goes with its last piece.
# The book has nothing on chapter 5 (Basic Knowledge of Laws): its nine sections stay empty, to be written later.
APPSC_ETHICS = {
    # 1. Ethics and Human Interface
    "01-01": [("eth", 1, r(1, 3))], "01-02": [("eth", 1, [4])], "01-03": [("eth", 1, [5, 7])],
    "01-04": [("eth", 1, [6, 8]), ("eth", 4, None)],  # integrity and accountability: and the foundational values
    # 2. Human Values
    "02-01": [("eth", 2, r(1, 3))], "02-02": [("eth", 2, [4])], "02-03": [("eth", 2, [5])], "02-04": [("eth", 2, [6])],
    "02-05": [("eth", 2, [7, 8]), ("eth", 6, None)],  # lessons from great leaders: and the moral thinkers
    # 3. Attitude and Emotional Intelligence
    "03-01": [("eth", 3, r(1, 3))], "03-02": [("eth", 3, [4])], "03-03": [("eth", 3, r(5, 8))],
    "03-04": [("eth", 5, [1, 2, 3, 6])], "03-05": [("eth", 5, [4, 5, 7])],
    # 4. Public Service, Governance and Probity
    "04-01": [("eth", 7, [1, 2]), ("eth", 8, r(1, 3))],
    "04-02": [("eth", 8, [4, 5, 7])],
    "04-03": [("eth", 9, [4])],
    "04-04": [("eth", 7, [6, 8]), ("eth", 8, [6]), ("eth", 9, [7])],
    "04-05": [("eth", 7, [4, 5, 7, 9]), ("eth", 11, r(5, 7))],
    "04-06": [("eth", 7, [3, 10, 11, 12]), ("eth", 8, [8]), ("eth", 9, [1, 2, 3, 5, 6, 8, 9, 10, 11])],
    "04-07": [("eth", 11, [1, 2, 3, 4, 8])],
    "04-08": [("eth", 10, [1, 2, 3, 4, 5, 6, 8, 9, 10])],
    "04-09": [("eth", 10, [7])],
}


def build_appsc_ethics(path: str) -> dict:
    notes = build(ethics_book(path), {f"NC-P3-3-{k}": v for k, v in APPSC_ETHICS.items()})
    return {
        "track": {"commission": "appsc", "group": "group-1"},
        "kind": "comprehensive",
        "source": "Ethics, Integrity and Aptitude — Complete Notes",
        "replace": True,  # asked for: these notes replace whatever the sections hold
        "notes": notes,
    }


def tidy_syllabus_subject(
    get_model, *, track_ref: dict, kind: str, paper_code: str, subject_index: int, syllabus: dict, hide_subjects: str = ""
) -> dict:
    """
    Put one Notes subject back in its syllabus's shape: its chapters in syllabus order with their syllabus titles and
    numbers, each section under its chapter in order; a chapter or section that was deleted comes back, empty, with
    its syllabus code (so notes for it can be placed again). Chapters in the subject that the syllabus doesn't have (one a
    Word import added, say) are hidden — set to draft with their sections and notes, never deleted — and listed;
    so are other subjects of the paper whose title matches `hide_subjects` (a regex) and that aren't the syllabus's.
    """
    Track, Paper, Subject = get_model("Track"), get_model("Paper"), get_model("Subject")
    Topic, MicroTheme, Note = get_model("Topic"), get_model("MicroTheme"), get_model("Note")
    from .notes_syllabus import PREFIX

    track = Track.objects.filter(commission__slug=track_ref["commission"], group__slug=track_ref["group"]).first()
    paper = track and Paper.objects.filter(track=track, notes_kind=kind, code=paper_code).first()
    p = next((x for x in syllabus["syllabi"][kind] if x["code"] == paper_code), None)
    if paper is None or p is None:
        return {"skipped": "paper not found"}
    s = p["subjects"][subject_index - 1]
    subject = Subject.objects.filter(paper=paper, code=f"{paper_code}-{subject_index}").first()
    if subject is None:
        return {"skipped": "subject not found"}
    report = {"chapters_fixed": 0, "sections_fixed": 0, "chapters_restored": 0, "sections_restored": 0, "hidden": []}
    if subject.title != s["title"] or subject.order != subject_index:
        subject.title, subject.order = s["title"], subject_index
        subject.save(update_fields=["title", "order"])
    keep = set()
    for ti, t in enumerate(s["topics"], 1):
        prefix = f"{PREFIX[kind]}-{paper_code}-{subject_index}-{ti:02d}-"
        mts = {m.code: m for m in MicroTheme.objects.filter(track=track, code__startswith=prefix)}
        topic = (Topic.objects.filter(subject=subject, code=f"{subject_index}.{ti}").first()
                 or Topic.objects.filter(subject=subject, title=t["title"]).first()
                 or next((m.topic for m in mts.values()), None))
        if topic is None:  # deleted: the syllabus chapter comes back
            topic = Topic.objects.create(subject=subject, title=t["title"], code=f"{subject_index}.{ti}", order=ti, status="published")
            report["chapters_restored"] += 1
        elif (topic.subject_id, topic.title, topic.code, topic.order) != (subject.id, t["title"], f"{subject_index}.{ti}", ti):
            topic.subject, topic.title, topic.code, topic.order = subject, t["title"], f"{subject_index}.{ti}", ti
            topic.save(update_fields=["subject", "title", "code", "order"])
            report["chapters_fixed"] += 1
        keep.add(topic.id)
        for mi, title in enumerate(t["sections"], 1):
            mt = mts.get(f"{prefix}{mi:02d}")
            if mt is None:  # deleted: the syllabus section comes back
                MicroTheme.objects.create(topic=topic, track=track, code=f"{prefix}{mi:02d}", title=title, order=mi, status="published")
                report["sections_restored"] += 1
            elif (mt.topic_id, mt.order, mt.title) != (topic.id, mi, title):
                mt.topic, mt.order, mt.title = topic, mi, title
                mt.save(update_fields=["topic", "order", "title"])
                report["sections_fixed"] += 1
    if hide_subjects:  # a whole subject an import added beside this one, on the same theme
        others = Subject.objects.filter(paper=paper, title__iregex=hide_subjects).exclude(id=subject.id).exclude(
            code__in=[f"{paper_code}-{i}" for i in range(1, len(p["subjects"]) + 1)]
        )
        for other in others:
            report["hidden"].append(f"subject: {other.title}")
            mts = MicroTheme.objects.filter(topic__subject=other)
            Note.objects.filter(micro_theme__in=mts).update(status="draft")
            mts.update(status="draft")
            Topic.objects.filter(subject=other).update(status="draft")
            other.status = "draft"
            other.save(update_fields=["status"])
    extra = Topic.objects.filter(subject=subject).exclude(id__in=keep).order_by("order", "id")
    for n, topic in enumerate(extra, len(s["topics"]) + 1):
        report["hidden"].append(topic.title)
        mts = MicroTheme.objects.filter(topic=topic)
        Note.objects.filter(micro_theme__in=mts).update(status="draft")
        mts.update(status="draft")
        topic.status, topic.order = "draft", n
        topic.save(update_fields=["status", "order"])
    return report


# ───────────────────────────── loading ─────────────────────────────


def read(path) -> dict:
    import gzip
    import json

    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load(bundle: dict, get_model) -> dict:
    """
    Create the bundle's notes, published. A section whose note of this kind already has text is left alone, unless
    the bundle says "replace" (then its text is replaced).
    """
    from django.contrib.postgres.search import SearchVector

    Track, MicroTheme, Note = get_model("Track"), get_model("MicroTheme"), get_model("Note")
    ref = bundle["track"]
    track = Track.objects.filter(commission__slug=ref["commission"], group__slug=ref["group"]).first()
    if track is None:
        return {"skipped": "track not found"}
    kind = bundle["kind"]
    mts = {m.code: m for m in MicroTheme.objects.filter(track=track, code__in=list(bundle["notes"]))}
    counts = {"created": 0, "filled": 0, "kept": 0, "missing": 0}
    if bundle.get("replace"):
        counts["replaced"] = 0
    for code, doc in bundle["notes"].items():
        mt = mts.get(code)
        if mt is None:
            counts["missing"] += 1
            continue
        note = Note.objects.filter(micro_theme=mt, kind=kind).first()
        if note is not None and (note.body_text or "").strip() and not bundle.get("replace"):
            counts["kept"] += 1
            continue
        text = doc_to_text(doc)
        if note is None:
            note = Note.objects.create(micro_theme=mt, kind=kind, body=doc, body_text=text, status="published")
            counts["created"] += 1
        else:
            had = bool((note.body_text or "").strip())
            note.body, note.body_text, note.status = doc, text, "published"
            note.save()
            counts["replaced" if had else "filled"] += 1
        Note.objects.filter(pk=note.pk).update(search_vector=SearchVector("body_text", config="english"))
    return counts
