"""
The Notes modules' own syllabi.

Each of the three Notes modules (Comprehensive, Prelims, Mains) can have a syllabus of its own for a track,
separate from the track's general syllabus (the one PYQs are filed under and the Syllabus and Progress pages
show). Papers of such a syllabus carry `notes_kind`; everything below them is the usual
Subject → Topic (a chapter) → MicroTheme (a section, where a note is written).

    build_appsc_g1(prelims_docx, mains_docx, comprehensive_docx) → bundle (dict, saved as JSON)
    load(bundle, get_model)                                      → creates the trees (idempotent)

The documents are the commission's syllabi as supplied (APPSC Group I, 2018). Their wording is kept; only
structure is derived: headings become papers, subjects and chapters, bullets become sections. Where a
document lists items as one long bullet ("Unit: a; b; c"), the unit becomes a chapter and each item a
section. Fragments split across bullets in the source ("Biodiversity—" / "its importance and concerns") are
joined; trailing list punctuation (",", ";", " and") is dropped from titles.
"""

from __future__ import annotations

import re

KINDS = ("comprehensive", "prelims", "mains")
PREFIX = {"comprehensive": "NC", "prelims": "NP", "mains": "NM"}
MAX = 255

SMALL = {"and", "of", "the", "in", "on", "for", "to", "a", "an", "or", "by", "with", "at", "vs", "vs."}


def title_case(text: str) -> str:
    """ALL-CAPS headings in the documents → title case (roman numerals and A.P. kept)."""
    words = text.split()
    out = []
    for i, w in enumerate(words):
        core = w.strip("()[],:")
        if re.fullmatch(r"[IVX]+|A\.P\.|S&T|ICT|II|III|IV|V", core):
            out.append(w)
        elif i and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower() if w.isupper() or w.lower() == w else w)
    return " ".join(out)


def clean(text: str) -> str:
    """A bullet as a title: whitespace collapsed, trailing list punctuation and dangling 'and' removed."""
    t = re.sub(r"\s+", " ", text).strip()
    keep_dot = re.search(r"(\b[A-Z]|\betc)\.$", t)  # abbreviations keep their full stop: "A.D.", "L.C.M.", "etc."
    t = re.sub(r"\s*[,;:.—–-]+\s*$", "", t)
    t = re.sub(r"\s+(and|&)$", "", t)
    t = re.sub(r"\s*[,;:—–-]+\s*$", "", t)
    if keep_dot:
        t += "."
    return t[:1].upper() + t[1:] if t else t


def paragraphs(path: str):
    import docx

    d = docx.Document(path)
    rows = ((p.style.name, p.text.replace("\u00a0", " ").strip()) for p in d.paragraphs)  # some spaces are non-breaking
    return [(style, text) for style, text in rows if text], d.tables


class Tree:
    """Builds Paper → Subject → Topic → MicroTheme, in document order."""

    def __init__(self):
        self.papers: list[dict] = []
        self.paper = self.subject = self.topic = None

    def add_paper(self, title, code, stage, description=""):
        self.paper = {"title": title, "code": code, "stage": stage, "description": description, "subjects": []}
        self.papers.append(self.paper)
        self.subject = self.topic = None

    def add_subject(self, title):
        self.subject = {"title": title, "topics": []}
        self.paper["subjects"].append(self.subject)
        self.topic = None

    def ensure_subject(self, title):
        if self.subject is None:
            self.add_subject(title)

    def add_topic(self, title):
        self.topic = {"title": clean(title), "sections": []}
        self.subject["topics"].append(self.topic)

    def add_section(self, title):
        t = clean(title)
        if t:
            self.topic["sections"].append(t)

    def single(self, title):
        """A topic that is a single section (a bullet that stands alone)."""
        self.add_topic(title)
        self.add_section(title)


def split_unit(text: str):
    """'Unit: a; b; c' or 'Unit — a; b; c' → ('Unit', ['a', 'b', 'c']). Without a heading, the first item heads it."""
    head = None
    m = re.match(r"^(.{3,90}?)(?::| — )\s*(.+)$", text)
    if m and ";" not in m.group(1):
        head, rest = m.group(1), m.group(2)
    else:
        rest = text
    items = [x for x in (clean(s) for s in re.split(r";\s*|(?<=[a-z])\.\s+(?=[A-Z])", rest)) if x]
    if head is None:
        head = items[0]
    return clean(head), items


# ───────────────────────────── Prelims ─────────────────────────────

# bullets that stand alone even though a group (a bullet ending in ':') came before them
PRE_STANDALONE = ("The Bhakti Movement and Sufism", "Biotechnology: Nature", "Genetic Engineering", "Nanotechnology", "Health & Environment")


def build_prelims(path: str) -> list[dict]:
    paras, tables = paragraphs(path)
    pattern = {r.cells[0].text.strip(): f"{r.cells[2].text.strip()} marks · {r.cells[3].text.strip()}" for r in tables[0].rows[1:]}
    tree = Tree()
    group = False
    pending = ""  # a bullet ending in a dash continues on the next one
    for style, text in paras:
        if style == "Heading 1":
            m = re.match(r"PAPER (I+) [—-] (.+)", text)
            if m:
                code = f"P{len(m.group(1))}"
                tree.add_paper(f"Paper {m.group(1)} — {title_case(m.group(2))}", code, "prelims", pattern.get(f"Paper {m.group(1)}", ""))
            group = False
            continue
        if tree.paper is None:
            continue
        if style == "Heading 2":
            title = re.sub(r"^[A-Z]\.\s+", "", text)
            if tree.subject is None or tree.subject["title"].lower() != title.lower():
                tree.add_subject(title)
            group = False
            continue
        if not style.startswith("List"):
            continue
        if pending:
            text, pending = f"{pending} {text}", ""
        if re.search(r"[—-]$", text):
            pending = text.rstrip("—- ") + " —"
            continue
        if text.startswith(PRE_STANDALONE):
            tree.single(text)
            group = False
        elif text.endswith(":"):
            tree.add_topic(text)
            group = True
        elif group:
            tree.add_section(text)
        else:
            tree.single(text)
    return tree.papers


# ───────────────────────────── Mains ─────────────────────────────

MAINS_INTRO = ("of the following dynasties", "Socio Cultural Conditions of:", "Literature(Telugu), Art and Architecture:")
MAINS_SPLITS = {
    # long comma lists in the source: each item a section (wording kept)
    "Major Challenges of Indian Economy": (
        "Major Challenges of Indian Economy",
        ["Inconsistent growth rate", "Low growth rates of agriculture and manufacturing sectors", "Inflation and oil prices",
         "Current account deficit and unfavorable balance of payments", "Falling rupee value", "Growing NPAs and capital infusion",
         "Money laundering and black money", "Insufficient financial resources and deficiency of capital",
         "Lack of Inclusive growth and Sustainable development",
         "Nature, causes, consequences and solutions of these problems"],
    ),
    "Concept of Public Service": (
        "Concept of Public Service",
        ["Concept of Public Service", "\"Philosophical basis of Governance\"",
         "Professional Ethics in the light of right understanding and Vision for Holistic Technologies", "Codes of Ethics",
         "Codes of Conduct", "RTI", "Public Service Act", "Leadership Ethics", "Work culture",
         "Ethical principles within an Organizational content", "Ethical and moral values in governance",
         "Ethical issues in international relations", "Corruption", "Lokpal", "Lokayukta"],
    ),
}


def build_mains(path: str) -> list[dict]:
    paras, _ = paragraphs(path)
    tree = Tree()
    papers = {"ENGLISH": ("English (Qualifying)", "ENG"), "TELUGU": ("Telugu (Qualifying)", "TEL")}
    group = False
    unit_mode = False  # inside a numbered unit (Heading 3): every bullet is a section of it
    for style, text in paras:
        if style == "Heading 1":
            group = unit_mode = False
            if text in papers:
                title, code = papers[text]
                tree.add_paper(title, code, "mains")
                tree.add_subject(text.title())
                continue
            m = re.match(r"PAPER ([IV]+) [—-] (.+)", text)
            if m:
                num = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}[m.group(1)]
                tree.add_paper(f"Paper {m.group(1)} — {title_case(m.group(2))}", f"P{num}", "mains")
                if num in (1, 4, 5):  # papers without sections: one subject, named after the paper
                    tree.add_subject(title_case(m.group(2)))
            else:
                tree.paper = None
            continue
        if tree.paper is None:
            continue
        if text.startswith("Marks:"):
            tree.paper["description"] = text
            continue
        if text.startswith("Candidates are required"):
            tree.paper["description"] = f"{tree.paper['description']} — {text}"
            continue
        if style == "Heading 2":
            group = unit_mode = False
            if tree.paper["code"] == "P1":  # the essay paper's headings are its chapters
                tree.add_topic(text)
                group = True
            else:
                tree.add_subject(re.sub(r"^[A-Z]\.\s+", "", text))
            continue
        if style == "Heading 3" or (style == "List Bullet" and re.match(r"^\d+\.\s", text)):
            tree.add_topic(text)
            unit_mode, group = True, False
            continue
        if not style.startswith("List"):
            continue
        level2 = style == "List Bullet 2"
        if tree.paper["code"] in ("ENG", "TEL"):
            # components ("Essay — 20 marks") are chapters; their one-line format notes are left out,
            # except where the line lists areas ("English Grammar areas:")
            if level2:
                if group:
                    tree.add_section(text)
                continue
            tree.add_topic(text)
            group = text.endswith(":")
            if not group:
                tree.add_section(text)
            continue
        if any(s in text for s in MAINS_INTRO):
            continue
        key = next((k for k in MAINS_SPLITS if text.startswith(k)), None)
        if key:
            head, items = MAINS_SPLITS[key]
            tree.add_topic(head)
            for it in items:
                tree.add_section(it)
            group = False
            continue
        if unit_mode:
            tree.add_section(text)
        elif text.endswith(":"):
            tree.add_topic(text)
            group = True
        elif group:
            tree.add_section(text)
        elif tree.paper["code"] in ("P4", "P5") or (";" in text and len(text) > 120):
            head, items = split_unit(text)
            tree.add_topic(head)
            for it in items:
                tree.add_section(it)
        else:
            tree.single(text)
    return tree.papers


# ───────────────────────────── Comprehensive ─────────────────────────────


def build_comprehensive(path: str) -> list[dict]:
    paras, tables = paragraphs(path)
    rows = [[c.text.strip() for c in r.cells] for r in tables[0].rows[1:]]
    names = [r[0].lstrip("★ ").strip() for r in rows if not r[0].startswith("TOTAL")]
    expected = [int(r[4]) for r in rows if not r[0].startswith("TOTAL")]
    codes = ["ENG", "TEL", "P1", "P2", "P3", "P4", "P5", "GMPA"]
    tree = Tree()
    n = -1
    for style, text in paras:
        if style == "Heading 1":
            n += 1
            stage = "prelims" if "Prelims" in text else "mains"
            tree.add_paper(names[n], codes[n], stage)
            continue
        if n < 0:
            continue
        if style == "Normal":
            if re.match(r"^(Marks|Mains):", text):
                tree.paper["description"] = text
            continue  # cross-references (») and study hints are not topics
        if style == "Heading 2":
            tree.add_subject(re.sub(r"^[A-Z]\.\s+", "", text))
            continue
        if style == "Heading 3":
            tree.ensure_subject(re.sub(r"^Paper [IV]+ — ", "", tree.paper["title"]).split(" (")[0])
            tree.add_topic(re.sub(r"^★\s*", "", text))
            continue
        if style.startswith("List"):
            tree.ensure_subject(re.sub(r"^Paper [IV]+ — ", "", tree.paper["title"]).split(" (")[0])
            if tree.topic is None:
                tree.add_topic(tree.subject["title"])
            # keep the (P & M) / (P only) / (M only) tag, with tidy spacing
            tree.topic["sections"].append(re.sub(r"\s{2,}", " ", text).strip())
    got = [sum(len(t["sections"]) for s in p["subjects"] for t in s["topics"]) for p in tree.papers]
    if got != expected:
        raise ValueError(f"Comprehensive syllabus: topic counts {got} differ from the document's own table {expected}")
    return tree.papers


def build_appsc_g1(prelims: str, mains: str, comprehensive: str) -> dict:
    bundle = {
        "track": {"commission": "appsc", "group": "group-1"},
        "source": "APPSC Group I syllabi (2018): Prelims, Mains, and the integrated Comprehensive syllabus",
        "syllabi": {
            "prelims": build_prelims(prelims),
            "mains": build_mains(mains),
            "comprehensive": build_comprehensive(comprehensive),
        },
    }
    for kind, papers in bundle["syllabi"].items():
        for p in papers:
            for s in p["subjects"]:
                for t in s["topics"]:
                    for x in [p["title"], s["title"], t["title"], *t["sections"]]:
                        if len(x) > MAX:
                            raise ValueError(f"{kind}: title longer than {MAX} characters: {x[:80]}…")
                    if not t["sections"]:
                        raise ValueError(f"{kind}: chapter without sections: {t['title']}")
    return bundle


# ───────────────────────────── Loading ─────────────────────────────


def read(path) -> dict:
    import gzip
    import json

    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def load(bundle: dict, get_model, publish: bool = True) -> dict:
    """
    Create the Notes syllabi for the bundle's track. Idempotent: a kind whose syllabus already exists
    for the track is left alone (so an admin's later edits are never overwritten). Returns counts.
    `get_model(name)` returns a content model (apps.get_model in a migration).
    """
    Track = get_model("Track")
    Paper = get_model("Paper")
    Subject = get_model("Subject")
    Topic = get_model("Topic")
    MicroTheme = get_model("MicroTheme")
    ref = bundle["track"]
    track = Track.objects.filter(commission__slug=ref["commission"], group__slug=ref["group"]).first()
    if track is None:
        return {"skipped": "track not found"}
    status = "published" if publish else "draft"
    counts = {}
    for kind in KINDS:
        papers = bundle["syllabi"].get(kind) or []
        if not papers or Paper.objects.filter(track=track, notes_kind=kind).exists():
            continue
        n = 0
        for pi, p in enumerate(papers, 1):
            paper = Paper.objects.create(
                track=track, notes_kind=kind, stage=p["stage"], code=p["code"], title=p["title"],
                description=p.get("description", ""), order=pi, status=status,
            )
            for si, s in enumerate(p["subjects"], 1):
                subject = Subject.objects.create(paper=paper, title=s["title"], code=f"{p['code']}-{si}", order=si, status=status)
                for ti, t in enumerate(s["topics"], 1):
                    topic = Topic.objects.create(subject=subject, title=t["title"], code=f"{si}.{ti}", order=ti, status=status)
                    for mi, title in enumerate(t["sections"], 1):
                        code = f"{PREFIX[kind]}-{p['code']}-{si}-{ti:02d}-{mi:02d}"
                        MicroTheme.objects.create(topic=topic, track=track, title=title, code=code, order=mi, status=status)
                        n += 1
        counts[kind] = n
    return counts
