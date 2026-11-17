"""
PYQ bundles: previous-year questions with their model answers, prepared once from
the content team's spreadsheets and loaded into the database by a migration.

    build(prelims_csv, mains_csv) -> bundle      (clean, classify, structure; no database)
    load(bundle, get_model)       -> report      (idempotent upsert; works with migration models)

Spreadsheet columns: stage, commission, exam_group, year, paper_label, microtheme_code,
microtheme_name, question_text, keywords, status, then option_a..d, correct_option,
explanation (prelims) or directive_word, marks, model_answer_text (mains).

What `build` does to the content, and nothing more:
  * the commission comes from the paper label: "... (TGPSC)" is TGPSC Group 1, the rest APPSC;
  * a missing year is read from the question's own "(APPSC, 2017 ...)" note, which is then removed;
  * model answers keep every word of the answer; what is cut is the material pasted in after it
    (booklet covers and running heads, contents tables, editorial notes and correction logs,
    "next batch" messages), and only after the answer's Conclusion;
  * answers are given their structure back (headings, "Label: text" points, " · " tables,
    the Value addition list) and lines broken mid-sentence are rejoined;
  * a prelims row with only the correct answer (no distractors) is kept as an answer-only question;
  * each micro-theme is filed under one of the exam's notes topics (Ancient History ... Environment)
    in a chapter named by its theme. New chapters and micro-themes are created as drafts, so the
    Notes, Syllabus and Progress pages are unchanged until an admin publishes them; the questions
    themselves are published and visible in the PYQ pages straight away.
"""

import csv
import gzip
import json
import re
from collections import defaultdict

from .richtext import doc_to_text

# ─────────────────────────────── where things go ────────────────────────────────

# Subject keys -> (title for APPSC, title for TGPSC, look). Existing subjects are found by title.
SUBJECTS = {
    "ANC": ("Ancient History", "Ancient History", "history"),
    "MED": ("Medieval History", "Medieval History", "history"),
    "MOD": ("Modern History", "Modern History", "history"),
    "REGH": ("AP History", "Telangana History", "history"),
    "GEO": ("Geography", "Geography", "geography"),
    "REGG": ("AP Geography", "Telangana Geography", "geography"),
    "POL": ("Polity", "Polity", "polity"),
    "ECO": ("Economy", "Economy", "economy"),
    "REGE": ("AP Economy", "Telangana Economy", "economy"),
    "SNT": ("Science and Technology", "Science and Technology", "science"),
    "ENV": ("Environment", "Environment", "environment"),
    "ETH": ("Ethics", "Ethics", "general"),
    "ESS": ("Essay", "Essay", "general"),
    "MEN": ("Mental Ability", "Mental Ability", "general"),
    "CUR": ("Current Affairs", "Current Affairs", "general"),
}
# Subjects an admin has not set up are created hidden: they would otherwise appear as new Notes topics.
NEW_SUBJECTS_HIDDEN = {"ETH", "ESS", "MEN", "CUR"}

# One chapter per theme; the same theme is sometimes named differently in prelims and mains.
THEME_ALIASES = {
    "IVC": "Indus Valley Civilization",
    "South Dynasties": "South Indian Dynasties",
    "Mughals": "Mughal Empire",
    "1857 Revolt": "Revolt of 1857",
    "Reform Movements": "Socio-Religious Reform",
    "Social Reformers": "Socio-Religious Reform",
    "New Religions": "Heterodox Religions",
    "Disaster Mgmt": "Disaster Management",
}
ANCIENT = {
    "Indus Valley Civilization", "Vedic Age", "Heterodox Religions", "Mahajanapadas", "Magadha & Mauryas",
    "Post-Mauryan", "Gupta Empire", "Post-Gupta North", "Sources",
}
MEDIEVAL = {"Delhi Sultanate", "Vijayanagar & Bahmani", "Religious Movements", "Mughal Empire", "Marathas", "Deccan Kingdoms", "Vernacular Growth"}
# South Indian dynasties straddle the two: the earlier houses are ancient, the later ones medieval.
LATER_SOUTH = re.compile(r"chola|rashtrakuta|kalyani|kakatiya|reddi", re.I)
SCIENCE_IN_ENVIRONMENT = {"Biodiversity", "Forest & Wildlife", "Action Plans"}
REGIONAL_ECONOMY_THEMES = {"AP Schemes", "AP Economy Post-Bifurcation", "AP Reorganisation Act"}


def subject_for(code: str, theme: str, title: str) -> str:
    group = re.sub(r"-\d+$", "", code)
    part = group.split("-")[-1]
    if group in ("PRE-PI-HC", "MN-PII-HCOI"):
        if theme == "South Indian Dynasties":
            return "MED" if LATER_SOUTH.search(title) else "ANC"
        return "ANC" if theme in ANCIENT else "MED" if theme in MEDIEVAL else "MOD"
    if part == "HCOA":
        return "REGH"
    if part == "G":
        return "GEO"
    if part in ("PSJI", "PC", "PAG", "LII"):
        return "POL"
    if part == "EIPS":
        return "ETH"
    if part == "ECB":
        return "ESS"
    if part == "MPA":
        return "MEN"
    if part == "CE":
        return "CUR"
    if part == "IAE" or group.startswith("MN-PIV"):
        if theme in REGIONAL_ECONOMY_THEMES or (group.startswith("MN-PIV") and part.endswith("A") and part != "IEC"):
            return "REGE"
        return "ECO"
    if part == "ST":
        return "ENV" if theme in SCIENCE_IN_ENVIRONMENT else "SNT"
    if part in ("ED", "PL"):
        return "ENV"
    if group.startswith("MN-PV"):
        return "SNT"
    raise ValueError(f"No subject for micro-theme {code}")


# ─────────────────────────────── cleaning answers ────────────────────────────────

# Lines that begin the material pasted in after an answer (only looked for after its Conclusion).
PASTED = re.compile(
    r"^(C ?I ?V ?I ?C ?C ?E ?N ?T ?R ?E\b|APPSC\s*/\s*TGPSC|APPSC GROUP|TGPSC GROUP|APPSC Group-?I\b|TGPSC Group-?I\b"
    r"|Prepared for|Compiled for|Compiled:|Source base:|Corrected and enriched|How to use|Note on length|Length note"
    r"|Section — Questions|Questions covered|Questions \d+\s*[–-]|Q\d+\s*[│|]|All statistics|Updated (to|with)\b"
    r"|Examiner-Grade|GOVERNMENT SOURCES|NEXT BATCH|Next batch|CORRECTIONS TO|Andhra Pradesh–specific content"
    r"|Science, Technology and Environmental Issues$|Enriched, Fact-Checked|Enriched from|Enriched Examiner|This completes the enrichment"
    r"|Sources( used| restricted| cited|:)|Project Reference Texts$|Theme \d|History & Culture of India and Andhra Pradesh \|"
    r"|Q Theme Verdict|Note: All statistics|Enriched [\w-]+(-Standard)? (Mains )?Model Answers|Enriched [\w-]+ Model Answers"
    r"|Enriched (Mains|Full-Marks|Evaluator-Standard|Examiner-Standard) |Enrichment (draws|sourced)|\d{1,3} .{3,100}\b(Rebuilt|Kept)\b|\d+ .{3,120} (APPSC|TGPSC) \d{4} (Rebuilt|Kept))",
    re.I,
)
# Notes to the compiler inside an answer (never advice to the student): removed wherever they stand.
EDITORIAL = re.compile(
    r"^(CORRECTIONS? \(booklet|Corrections to the source booklet|A note on length|Note on length|Length note"
    r"|Carry this page into revision|Q\d+(\s*(and|&)\s*Q\d+)?\s+—\s.*\bBooklet\b|Questions \d+ and \d+ in the source booklet|Base text:"
    r"|Enriched (against|for)\b|Enrichment basis|Note on unavailable project files|.*Enriched Model Answers"
    r"|Government sources (verified|used)|Remove from the booklet|Prepared for|Compiled for|Source base: CivicCentre|.*\bstanding instruction\b)",
    re.I,
)
SECTION_WORDS = {"introduction", "conclusion", "value addition"}
END_PUNCT = tuple(".!?:;)\"'’”]")


def clean_answer(text: str):
    """The answer itself, without what was pasted after it. Returns (text, cut_line_or_None)."""
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    after = next((i for i, ln in enumerate(lines) if ln.strip().lower() == "conclusion"), None)
    start = (after + 1) if after is not None else min(5, len(lines))
    cut = next((i for i in range(start, len(lines)) if PASTED.match(lines[i].strip())), None)
    if cut is not None:
        lines = lines[:cut]
    kept = [ln for ln in lines if not EDITORIAL.match(ln.strip())]
    return "\n".join(kept).strip(), (cut if cut is not None else (len(kept) if len(kept) < len(lines) else None))


def _text(t, bold=False):
    node = {"type": "text", "text": t}
    if bold:
        node["marks"] = [{"type": "bold"}]
    return node


def _para(line):
    m = re.match(r"^([^:.;]{2,70}?):\s*(\S.*)$", line)
    if m and not re.search(r"\d$", m.group(1)):  # "As a thermal barrier: ..." -> bold lead-in (not times like 10:30)
        return {"type": "paragraph", "content": [_text(m.group(1) + ":", bold=True), _text(" " + m.group(2))]}
    return {"type": "paragraph", "content": [_text(line)]}


def _is_heading(line, nxt):
    if line.lower() in SECTION_WORDS:
        return True
    words = line.split()
    return (
        nxt is not None and 0 < len(words) <= 12 and len(line) <= 90 and not line.endswith(END_PUNCT)
        and ": " not in line and " · " not in line and not re.match(r"^[\d(•\-–]", line)
    )


def _cells(line):
    if " · " not in line or " — " not in line:
        return None
    first, rest = line.split(" — ", 1)
    return [first.strip()] + [c.strip() for c in rest.split(" · ")]


def answer_to_doc(text: str, essay: bool = False):
    """A model answer in the spreadsheet's layout (one line per paragraph) -> a structured document."""
    raw = [ln.strip() for ln in text.split("\n") if ln.strip()]
    # rejoin a paragraph broken mid-sentence ("... south of the" / "Himalayas, the monsoon ...")
    lines = []
    for ln in raw:
        if lines and len(lines[-1]) > 60 and not lines[-1].endswith(END_PUNCT) and _cells(lines[-1]) is None:
            lines[-1] = f"{lines[-1]} {ln}"
        else:
            lines.append(ln)
    content, i, in_value = [], 0, False
    while i < len(lines):
        ln, nxt = lines[i], lines[i + 1] if i + 1 < len(lines) else None
        row = _cells(ln)
        if row and nxt and _cells(nxt) and len(_cells(nxt)) == len(row):
            rows = [row]
            while i + 1 < len(lines) and _cells(lines[i + 1]) and len(_cells(lines[i + 1])) == len(row):
                i += 1
                rows.append(_cells(lines[i]))
            content.append({"type": "table", "content": [
                {"type": "tableRow", "content": [
                    {"type": "tableHeader" if r == 0 else "tableCell", "content": [{"type": "paragraph", "content": [_text(c)]}]}
                    for c in cells
                ]} for r, cells in enumerate(rows)
            ]})
        elif i == 0 and essay and nxt and nxt.lower() == "introduction":
            content.append({"type": "heading", "attrs": {"level": 2}, "content": [_text(ln.rstrip("."))]})
        elif _is_heading(ln, nxt):
            in_value = ln.lower() == "value addition"
            content.append({"type": "heading", "attrs": {"level": 3}, "content": [_text(ln)]})
        elif in_value:
            items = []
            while i < len(lines) and not _is_heading(lines[i], lines[i + 1] if i + 1 < len(lines) else None):
                items.append({"type": "listItem", "content": [_para(lines[i])]})
                i += 1
            content.append({"type": "bulletList", "content": items})
            in_value = False
            continue
        else:
            content.append(_para(ln))
        i += 1
    return {"type": "doc", "content": content}


# ─────────────────────────────── building ────────────────────────────────

CODE_LIKE = re.compile(r"^(PRE|MN)-P[IV]+-[A-Z0-9]+-\d+$")
YEAR_NOTE = re.compile(r"\s*\((APPSC|TGPSC)\s*,\s*(\d{4})[^)]*\)?\s*$")


def _rows(path):
    csv.field_size_limit(1 << 30)
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def build(prelims_csv: str, mains_csv: str):
    report = defaultdict(list)
    tracks = {}
    numbering = defaultdict(int)

    def track(slug):
        return tracks.setdefault(slug, {"micro_themes": {}, "questions": []})

    for stage, path in (("prelims", prelims_csv), ("mains", mains_csv)):
        for n, r in enumerate(_rows(path), start=2):
            label = r["paper_label"].strip()
            commission = "tgpsc" if "(TGPSC)" in label else (r["commission"].strip().lower() or "appsc")
            label = label.replace("(TGPSC)", "").strip()
            text = r["question_text"].strip()
            year = int(r["year"] or 0)
            if year == 0:
                m = YEAR_NOTE.search(text)
                if not m:
                    report["skipped"].append(f"{stage} row {n}: no year anywhere — {text[:90]}")
                    continue
                year, text = int(m.group(2)), text[: m.start()].strip()
                report["year_from_text"].append(f"{stage} row {n}: {commission.upper()} {year}")
            slug = f"{commission}/group-{r['exam_group'].strip() or '1'}"
            t = track(slug)

            code = r["microtheme_code"].strip().upper()
            name = r["microtheme_name"].strip()
            theme, _, title = name.partition(" — ")
            theme = THEME_ALIASES.get(theme.strip(), theme.strip())
            title = (title or name).strip()
            if code not in t["micro_themes"]:
                t["micro_themes"][code] = {"code": code, "title": title, "chapter": theme, "subject": subject_for(code, theme, title)}

            keywords = r.get("keywords", "").strip()
            if CODE_LIKE.match(keywords):
                keywords = ""  # a second micro-theme code had slipped into this column
            key = (slug, stage, year, label)
            numbering[key] += 1
            q = {"stage": stage, "year": year, "paper_label": label, "question_no": numbering[key], "text": text,
                 "micro_theme": code, "keywords": keywords, "status": "published"}
            if stage == "prelims":
                opts = [r[f"option_{k}"].strip() for k in "abcd"]
                correct = r["correct_option"].strip().upper()
                q.update(option_a=opts[0], option_b=opts[1], option_c=opts[2], option_d=opts[3],
                         correct_option=correct, explanation=r.get("explanation", "").strip())
                if not any(opts[1:]):
                    report["answer_only"].append(n)
            else:
                answer, cut = clean_answer(r["model_answer_text"])
                if cut is not None:
                    report["answers_trimmed"].append(f"row {n}: {len(r['model_answer_text'])} -> {len(answer)} chars")
                marks = int(r["marks"]) if r["marks"].strip().isdigit() else None
                q.update(directive=r.get("directive_word", "").strip().title()[:40], marks=marks,
                         model_answer=answer_to_doc(answer, essay=(marks or 0) >= 50))
            t["questions"].append(q)

    for t in tracks.values():
        t["micro_themes"] = list(t["micro_themes"].values())
    return {"tracks": tracks}, dict(report)


def write(bundle, path):
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))


def read(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


# ─────────────────────────────── loading ────────────────────────────────


def _norm(s):
    return re.sub(r"\W+", " ", (s or "").lower()).strip()


def load(bundle, get_model, log=print):
    """
    Upsert a bundle. `get_model(name)` returns a model class (apps.get_model in a migration).
    Tracks that don't exist are skipped (a fresh install). Safe to run again: questions are keyed on
    (track, stage, year, paper, number); a question an admin already entered with the same wording
    and year is left as it is.
    """
    Track, Paper, Subject, Topic, MicroTheme, Question = (
        get_model(n) for n in ("Track", "Paper", "Subject", "Topic", "MicroTheme", "Question")
    )
    from django.contrib.postgres.search import SearchVector

    totals = defaultdict(int)
    for slug, data in bundle["tracks"].items():
        commission, group = slug.split("/")
        track = Track.objects.filter(commission__slug=commission, group__slug=group).first()
        if track is None:
            # the commission is here but not this exam yet: add it (a fresh install has neither, and is skipped)
            Commission, ExamGroup = get_model("Commission"), get_model("ExamGroup")
            com, grp = Commission.objects.filter(slug=commission).first(), ExamGroup.objects.filter(slug=group).first()
            if com is None or grp is None:
                log(f"  {slug}: no such exam here, skipped")
                continue
            track = Track.objects.create(commission=com, group=grp, order=grp.order)
            log(f"  {slug}: exam added to {com.short_name}")
        regional = commission == "tgpsc"

        # the notes topics (subjects) live in the exam's General Studies paper
        papers = Paper.objects.filter(track=track)
        home = (
            papers.filter(subjects__title__iexact="Ancient History").first()
            or papers.filter(code="GS").first()
            or papers.order_by("order", "id").first()
        )
        if home is None:
            home = Paper.objects.create(track=track, code="GS", title="General Studies", stage="prelims", order=1, status="published")
        subjects = {}

        def subject(key):
            if key in subjects:
                return subjects[key]
            title_ap, title_tg, look = SUBJECTS[key]
            title = title_tg if regional else title_ap
            s = Subject.objects.filter(paper__track=track, title__iexact=title).first()
            if s is None:
                last = Subject.objects.filter(paper=home).order_by("-order").values_list("order", flat=True).first() or 0
                s = Subject.objects.create(paper=home, title=title, code=key, look=look, order=last + 1,
                                           status="draft" if key in NEW_SUBJECTS_HIDDEN else "published")
                totals["subjects_created"] += 1
            subjects[key] = s
            return s

        chapters = {}
        mt_ids = {}
        for mt in data["micro_themes"]:
            code = mt["code"]
            existing = MicroTheme.objects.filter(track=track, code=code).first()
            if existing and (_norm(mt["title"]) in _norm(existing.title) or _norm(existing.title) in _norm(mt["title"])):
                mt_ids[mt["code"]] = existing.id
                totals["micro_themes_reused"] += 1
                continue
            if existing:  # the code already means something else in this exam: keep both, apart
                code = f"{code}-PYQ"
                log(f"  {slug}: {mt['code']} is already '{existing.title}' here; filed as {code}")
                existing = MicroTheme.objects.filter(track=track, code=code).first()
                if existing:
                    mt_ids[mt["code"]] = existing.id
                    totals["micro_themes_reused"] += 1
                    continue
            s = subject(mt["subject"])
            ck = (s.id, mt["chapter"])
            if ck not in chapters:
                topic = Topic.objects.filter(subject=s, title=mt["chapter"]).first()
                if topic is None:
                    last = Topic.objects.filter(subject=s).order_by("-order").values_list("order", flat=True).first() or 0
                    topic = Topic.objects.create(subject=s, title=mt["chapter"], order=last + 1, status="draft")
                    totals["chapters_created"] += 1
                chapters[ck] = topic
            topic = chapters[ck]
            last = MicroTheme.objects.filter(topic=topic).order_by("-order").values_list("order", flat=True).first() or 0
            mt_ids[mt["code"]] = MicroTheme.objects.create(
                topic=topic, track=track, code=code, title=mt["title"][:255], order=last + 1, status="draft"
            ).id
            totals["micro_themes_created"] += 1

        already = {
            (stage, year, _norm(text))
            for stage, year, text in Question.objects.filter(track=track).values_list("stage", "year", "text")
        }
        fields = ("text", "option_a", "option_b", "option_c", "option_d", "correct_option", "explanation",
                  "directive", "marks", "model_answer", "keywords", "status")
        touched = []
        for q in data["questions"]:
            key = {"track": track, "stage": q["stage"], "year": q["year"], "paper_label": q["paper_label"], "question_no": q["question_no"]}
            obj = Question.objects.filter(**key).first()
            if obj is None and (q["stage"], q["year"], _norm(q["text"])) in already:
                totals["questions_already_present"] += 1
                continue
            if obj is None:
                obj = Question(**key)
                totals["questions_created"] += 1
            else:
                totals["questions_updated"] += 1
            for f in fields:
                if f in q:
                    setattr(obj, f, q[f])
            obj.micro_theme_id = mt_ids.get(q["micro_theme"])
            obj.model_answer_text = doc_to_text(obj.model_answer) if q["stage"] == "mains" else ""
            obj.save()
            touched.append(obj.pk)
        # the same search index Question.save() maintains (migration models don't run custom save())
        weights = SearchVector("text", weight="A", config="english") + SearchVector("keywords", weight="B", config="english") \
            + SearchVector("option_a", "option_b", "option_c", "option_d", weight="C", config="english") \
            + SearchVector("explanation", "model_answer_text", weight="D", config="english")
        for i in range(0, len(touched), 200):
            Question.objects.filter(pk__in=touched[i:i + 200]).update(search_vector=weights)
        log(f"  {slug}: {len(touched)} questions written")
    for k, v in sorted(totals.items()):
        log(f"  {k}: {v}")
    return dict(totals)


def publish(bundle, get_model, log=print):
    """
    Publish what `load` created hidden: the bundle's micro-themes, the chapters made only of them,
    and the topics `load` added hidden (Ethics, Essay, Mental Ability, Current Affairs). Anything an
    admin made or hid is left alone: a chapter that also holds other sections keeps its status.
    """
    Track, Subject, Topic, MicroTheme = (get_model(n) for n in ("Track", "Subject", "Topic", "MicroTheme"))
    totals = defaultdict(int)
    for slug, data in bundle["tracks"].items():
        commission, group = slug.split("/")
        track = Track.objects.filter(commission__slug=commission, group__slug=group).first()
        if track is None:
            continue
        codes = {m["code"] for m in data["micro_themes"]} | {f"{m['code']}-PYQ" for m in data["micro_themes"]}
        ours = MicroTheme.objects.filter(track=track, code__in=codes)
        topic_ids = set(ours.values_list("topic_id", flat=True))
        mixed = set(MicroTheme.objects.filter(topic_id__in=topic_ids).exclude(code__in=codes).values_list("topic_id", flat=True))
        chapters = Topic.objects.filter(id__in=topic_ids - mixed)
        totals["micro_themes_published"] += ours.filter(status="draft").update(status="published")
        totals["chapters_published"] += chapters.filter(status="draft").update(status="published")
        regional = commission == "tgpsc"
        titles = [SUBJECTS[k][1 if regional else 0] for k in NEW_SUBJECTS_HIDDEN]
        new_subjects = Subject.objects.filter(paper__track=track, code__in=NEW_SUBJECTS_HIDDEN, title__in=titles, status="draft")
        totals["topics_published"] += new_subjects.update(status="published")
        log(f"  {slug}: published")
    for k, v in sorted(totals.items()):
        log(f"  {k}: {v}")
    return dict(totals)
