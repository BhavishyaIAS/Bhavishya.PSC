"""
UPSC Prelims previous-year questions from the content team's two Word editions:

  * year-wise:    one paper per year (1979–2026), questions in their original order, each tagged
                  with its subject:      Q12. [Geography]  New  medium confidence
  * subject-wise: the same questions grouped by subject, each tagged with its year.

Both hold the same questions with the same keys and explanations; `build_upsc` reads the year-wise
edition (it carries the question numbers) and, given the subject-wise one, checks the two agree.
The result is a bundle for `pyq_bundle.load`: on the site the year-wise view is the PYQ page's year
filter (questions in paper order) and the subject-wise view is its subject filter.

What is changed, and nothing more:
  * the subjects become the UPSC exam's topics ("International Relations and Current Affairs" ->
    Current Affairs; "General Knowledge and Miscellaneous" -> a General Knowledge topic);
  * a note attached to an answer ("(UPSC's official key: (d); see explanation)") opens the explanation;
  * an explanation's further paragraphs and lists stay with it ("- " items become "• "); captions of
    figures the edition does not include ("Fig: ...") are dropped;
  * an answer naming no option ("None of the options is correct as framed", "Only statement 2 is
    correct; no option matches exactly") becomes the None-of-the-options answer, any reason kept as a note;
  * the edition's own flags become tags: "low-confidence key", "medium-confidence key", "asked again";
  * left out: questions without a year, and questions whose options were figures (garbled in the file).
"""

import re
from collections import Counter, defaultdict

PAPER = "General Studies Paper I"
SLUG = "upsc/civil-services"
# edition subject -> (key, site topic, look)
SUBJECTS = {
    "Ancient History": ("ANC", "Ancient History", "history"),
    "Medieval History": ("MED", "Medieval History", "history"),
    "Modern History": ("MOD", "Modern History", "history"),
    "Art and Culture": ("ART", "Art and Culture", "history"),
    "Geography": ("GEO", "Geography", "geography"),
    "Polity and Governance": ("POL", "Polity and Governance", "polity"),
    "Economy": ("ECO", "Economy", "economy"),
    "Environment and Ecology": ("ENV", "Environment and Ecology", "environment"),
    "Science and Technology": ("SNT", "Science and Technology", "science"),
    "International Relations and Current Affairs": ("CUR", "Current Affairs", "general"),
    "General Knowledge and Miscellaneous": ("GK", "General Knowledge", "general"),
}
QHEAD = re.compile(r"^Q(\d+)\.\s*\[([^\]]+)\]\s*(.*)$")
OPTION = re.compile(r"^\(([a-d])\)\s*(.*)$", re.S)
ANSWER = re.compile(r"^\(([a-d])\)\s*(.*)$", re.S)
YEAR = re.compile(r"\b(19[789]\d|20[0-4]\d)\b")


def parse(path):
    """Every question in a Word edition, in document order, with the headings it sits under."""
    import docx  # python-docx, already used for the notes importer

    out, h1, h2, cur, stage = [], None, None, None, None
    for p in docx.Document(path).paragraphs:
        style = p.style.name if p.style is not None else ""
        t = p.text.strip()
        if style in ("Heading 1", "Heading 2"):
            if cur:
                out.append(cur)
            cur = None
            h1, h2 = (t, None) if style == "Heading 1" else (h1, t)
            continue
        if not t:
            continue
        m = QHEAD.match(t)
        if m:
            if cur:
                out.append(cur)
            cur = {"n": int(m.group(1)), "tag": m.group(2).strip(), "flags": m.group(3).lower().split(),
                   "h1": h1, "h2": h2, "text": [], "opts": {}, "answer": "", "expl": "", "more": []}
            stage = "text"
            continue
        if cur is None:
            continue
        m = OPTION.match(t)
        if m and stage in ("text", "opts") and len(cur["opts"]) < 4 and m.group(1) == "abcd"[len(cur["opts"])]:
            cur["opts"][m.group(1)] = m.group(2).strip()
            stage = "opts"
        elif t.startswith("Answer:") and stage in ("text", "opts"):
            cur["answer"], stage = t[7:].strip(), "answer"
        elif t.startswith("Explanation:") and stage == "answer":
            cur["expl"], stage = t[12:].strip(), "expl"
        elif stage == "text":
            cur["text"].append(t)
        elif stage == "opts":
            k = "abcd"[len(cur["opts"]) - 1]
            cur["opts"][k] += "\n" + t
        else:
            cur["more"].append(t)
    if cur:
        out.append(cur)
    return out


def _norm(s):
    return re.sub(r"\W+", " ", (s or "").lower()).strip()


def _key(year, q):
    return (year, _norm(" ".join(q["text"])), tuple(_norm(q["opts"].get(k, "")) for k in "abcd"))


def build_upsc(yearwise_path, subjectwise_path=None):
    report = defaultdict(list)
    questions, used = [], Counter()
    rows = parse(yearwise_path)
    for q in rows:
        m = YEAR.search(q["h1"] or "")
        if not m:
            report["skipped_no_year"].append(" ".join(q["text"])[:90])
            continue
        year = int(m.group(1))
        q["year"] = year
        if len(q["opts"]) != 4:
            report["skipped_figure_options"].append(f"{year} Q{q['n']}: {' '.join(q['text'])[:80]}")
            continue
        if q["tag"] not in SUBJECTS:
            raise ValueError(f"Unknown subject {q['tag']!r} at {year} Q{q['n']}")
        key, title, look = SUBJECTS[q["tag"]]
        used[key] += 1

        ans = q["answer"]
        note = ""
        m = ANSWER.match(ans)
        if not m:  # no option is right as the question was framed: say so, keeping any reason given
            correct = "N"
            if not ans.lower().startswith("none of the options"):
                note = ans
        else:
            correct = m.group(1).upper()
            rest, option = m.group(2).strip(), q["opts"][m.group(1)]
            if rest.startswith(option.split("\n")[0]):
                note = rest[len(option.split("\n")[0]):].strip()
            elif rest:
                report["answer_text_differs"].append(f"{year} Q{q['n']}")
        lines = [q["expl"]] + [ln for ln in q["more"] if not re.match(r"^Fig\.?\s*:", ln)]
        lines = [re.sub(r"^-\s+", "• ", ln) for ln in lines if ln]
        if note:
            lines.insert(0, note)
        tags = []
        if "low" in q["flags"]:
            tags.append("low-confidence key")
        elif "medium" in q["flags"]:
            tags.append("medium-confidence key")
        if "repeat" in q["flags"]:
            tags.append("asked again")
        if correct == "N":
            report["none_of_the_options"].append(f"{year} Q{q['n']}")
        questions.append({
            "stage": "prelims", "year": year, "paper_label": PAPER, "question_no": q["n"],
            "text": "\n".join(q["text"]), "micro_theme": f"UPSC-PRE-{key}", "keywords": "", "status": "published",
            "option_a": q["opts"]["a"], "option_b": q["opts"]["b"], "option_c": q["opts"]["c"], "option_d": q["opts"]["d"],
            "correct_option": correct, "explanation": "\n".join(lines), "tags": tags,
        })

    if subjectwise_path:
        mine = {_key(q["year"], q): q for q in rows if "year" in q}
        theirs = {}
        for q in parse(subjectwise_path):
            m = YEAR.search(q["tag"])
            if m:
                theirs[_key(int(m.group(1)), q)] = q
        report["only_in_yearwise"] = [f"{k[0]}: {k[1][:60]}" for k in set(mine) - set(theirs)]
        report["only_in_subjectwise"] = [f"{k[0]}: {k[1][:60]}" for k in set(theirs) - set(mine)]
        for k in set(mine) & set(theirs):
            a, b = mine[k], theirs[k]
            if a["answer"] != b["answer"] or a["tag"] != b["h1"]:
                report["editions_disagree"].append(f"{k[0]} Q{a['n']}: {a['answer'][:40]} / {b['answer'][:40]}")

    micro_themes = [
        {"code": f"UPSC-PRE-{key}", "title": "UPSC Prelims previous-year questions, 1979–2026",
         "chapter": "Previous-year questions", "subject": key,
         "subject_own": {"title": title, "look": look, "hidden": False}}
        for key, title, look in SUBJECTS.values() if used[key]
    ]
    return {"tracks": {SLUG: {"micro_themes": micro_themes, "questions": questions}}}, dict(report)
