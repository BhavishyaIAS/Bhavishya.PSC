"""
Bulk PYQ import.

The browser parses the spreadsheet and posts the rows as JSON. The server is the
authority: it re-validates every row, reports per-row errors, and (on commit)
upserts only the valid rows inside a single transaction.

Idempotency: rows are keyed on (track, stage, year, paper_label, question_no),
so re-running the same sheet updates questions instead of duplicating them.
"""

from django.db import transaction

from .models import MicroTheme, Question, Stage, Status, Track
from .richtext import text_to_doc
from .serializers import get_or_create_tags

MAX_ROWS = 5000
COMMON_COLUMNS = ["question_no", "year", "paper_label", "micro_theme_code", "question", "keywords", "tags", "status"]
PRELIMS_COLUMNS = ["option_a", "option_b", "option_c", "option_d", "correct_option", "explanation"]
MAINS_COLUMNS = ["directive", "marks", "model_answer"]


def columns_for(stage):
    extra = PRELIMS_COLUMNS if stage == Stage.PRELIMS else MAINS_COLUMNS
    return COMMON_COLUMNS[:5] + extra + COMMON_COLUMNS[5:]


def _s(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _int(v):
    s = _s(v)
    try:
        return int(float(s)) if s else None
    except ValueError:
        return "bad"


def validate_rows(track: Track, stage: str, rows: list, default_status: str):
    mt_by_code = {code: mt_id for code, mt_id in MicroTheme.objects.filter(track=track).values_list("code", "id")}
    existing = set(
        Question.objects.filter(track=track, stage=stage).values_list("year", "paper_label", "question_no")
    )
    seen = {}
    results = []
    for i, raw in enumerate(rows):
        raw = {str(k).strip().lower().replace(" ", "_"): v for k, v in (raw or {}).items()}
        row_no = _int(raw.pop("__row", None))
        row_no = row_no if isinstance(row_no, int) else i + 2  # header is row 1
        errors = []

        qno = _int(raw.get("question_no"))
        year = _int(raw.get("year"))
        paper_label = _s(raw.get("paper_label"))
        text = _s(raw.get("question"))
        code = _s(raw.get("micro_theme_code")).upper()
        status = _s(raw.get("status")).lower() or default_status

        if qno in (None, "bad") or (isinstance(qno, int) and qno < 1):
            errors.append("question_no must be a positive whole number")
        if year in (None, "bad") or (isinstance(year, int) and not 1950 <= year <= 2100):
            errors.append("year must be a 4-digit year")
        if not paper_label:
            errors.append("paper_label is required")
        elif len(paper_label) > 80:
            errors.append("paper_label is too long (max 80)")
        if not text:
            errors.append("question text is required")
        if not code:
            errors.append("micro_theme_code is required")
        elif code not in mt_by_code:
            errors.append(f"micro_theme_code {code} does not exist in {track}")
        if status not in Status.values:
            errors.append("status must be draft or published")

        data = {
            "question_no": qno, "year": year, "paper_label": paper_label, "text": text,
            "micro_theme_id": mt_by_code.get(code), "status": status,
            "keywords": _s(raw.get("keywords"))[:400],
            "tags": [t for t in (_s(raw.get("tags")).replace(";", ",").split(",")) if t.strip()],
        }
        if stage == Stage.PRELIMS:
            for f in ("option_a", "option_b", "option_c", "option_d"):
                data[f] = _s(raw.get(f))
                if not data[f]:
                    errors.append(f"{f} is required")
            correct = _s(raw.get("correct_option")).upper().replace("OPTION", "").strip("() .")
            if correct in ("1", "2", "3", "4"):
                correct = "ABCD"[int(correct) - 1]
            if correct not in ("A", "B", "C", "D"):
                errors.append("correct_option must be A, B, C or D")
            data["correct_option"] = correct
            data["explanation"] = _s(raw.get("explanation"))
        else:
            data["directive"] = _s(raw.get("directive")).title()[:40]
            marks = _int(raw.get("marks"))
            if marks == "bad" or (isinstance(marks, int) and not 0 < marks <= 250):
                errors.append("marks must be a number between 1 and 250")
                marks = None
            data["marks"] = marks
            data["model_answer"] = text_to_doc(_s(raw.get("model_answer")))

        key = (year, paper_label, qno)
        if not errors:
            if key in seen:
                errors.append(f"duplicate of row {seen[key]} in this file (same year, paper and question number)")
            else:
                seen[key] = row_no
        results.append({
            "row": row_no,
            "ok": not errors,
            "errors": errors,
            "action": ("update" if key in existing else "create") if not errors else None,
            "summary": f"{year or '?'} · {paper_label or '?'} · Q{qno if isinstance(qno, int) else '?'}",
            "text": text[:160],
            "data": data,
        })
    return results


def commit_rows(track: Track, stage: str, results: list):
    """Upsert every valid row atomically. Returns counts."""
    valid = [r for r in results if r["ok"]]
    created = updated = 0
    touched = []
    with transaction.atomic():
        for r in valid:
            d = dict(r["data"])
            tags = d.pop("tags")
            key = {"track": track, "stage": stage, "year": d.pop("year"),
                   "paper_label": d.pop("paper_label"), "question_no": d.pop("question_no")}
            obj = Question.objects.filter(**key).first()
            if obj is None:
                obj = Question(**key)
                created += 1
            else:
                updated += 1
            for k, v in d.items():
                setattr(obj, k, v)
            obj.save()
            obj.tags.set(get_or_create_tags(tags))
            touched.append(obj.pk)
    return {"created": created, "updated": updated, "failed": len(results) - len(valid), "ids": touched}
