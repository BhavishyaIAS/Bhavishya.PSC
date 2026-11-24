"""
A student's own learning: answering Prelims questions, keeping questions, writing Mains answers, the state of each
section (studying / completed / needs attention) with its revision schedule, and the dashboard that brings it all
together. Everything here is the student's own record; nothing is invented to fill a page.
"""

import re
from datetime import timedelta

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import (
    REVISION_DAYS,
    Activity,
    AnswerDraft,
    Attempt,
    Bookmark,
    MicroTheme,
    Note,
    Question,
    Stage,
    StudyProgress,
    SyllabusLink,
    TopicBookmark,
    live_links,
)
from .serializers import QuestionReadSerializer
from .views_read import get_track, track_ref, visible_mt_ids

SEARCH_CONFIG = "english"
GENERIC = {
    "only", "with", "their", "from", "into", "and", "the", "its", "rise", "role", "age", "ages", "era", "period", "early", "later",
    "india", "indian", "history", "culture", "cultural", "features", "society", "social", "development", "impact", "growth",
    "ancient", "medieval", "modern", "nature", "main", "major", "various", "important", "contribution", "contributions", "under",
    "issues", "concept", "concepts", "basic", "general", "introduction", "overview", "state", "states", "national",
    "empire", "empires", "dynasty", "dynasties", "kingdom", "kingdoms", "revolt", "movement", "movements", "reform", "reforms",
    "rule", "rulers", "policy", "policies", "administration", "religious", "life", "developments", "their", "advent", "conditions",
}


# ───────────────────────────── per-question ─────────────────────────────


def mine_for(user, question_ids) -> dict:
    """The student's own state on each question: last answer, bookmarked, a draft."""
    out = {qid: {"chosen": None, "correct": None, "attempts": 0, "bookmarked": False, "draft_words": 0, "self_score": None} for qid in question_ids}
    for a in Attempt.objects.filter(user=user, question_id__in=question_ids).order_by("created_at"):
        m = out[a.question_id]
        m["chosen"], m["correct"], m["attempts"] = a.chosen, a.correct, m["attempts"] + 1
    for qid in Bookmark.objects.filter(user=user, question_id__in=question_ids).values_list("question_id", flat=True):
        out[qid]["bookmarked"] = True
    for d in AnswerDraft.objects.filter(user=user, question_id__in=question_ids):
        out[d.question_id].update(draft_words=d.words, self_score=d.self_score)
    return out


def filter_mine(qs, user, mine: str):
    if mine == "bookmarked":
        return qs.filter(bookmarks__user=user)
    if mine == "unattempted":
        return qs.exclude(attempts__user=user)
    if mine == "incorrect":
        # questions whose latest answer was wrong
        wrong = {}
        for qid, correct in Attempt.objects.filter(user=user, question__in=qs).order_by("created_at").values_list("question_id", "correct"):
            wrong[qid] = not correct
        return qs.filter(id__in=[q for q, w in wrong.items() if w])
    if mine == "drafted":
        return qs.filter(answer_drafts__user=user)
    return qs


def _question(request, commission, group, pk):
    track = get_track(commission, group, request.user)
    return get_object_or_404(Question.objects.visible_to(request.user), track=track, pk=pk)


@api_view(["POST"])
def attempt(request, commission, group, pk):
    q = _question(request, commission, group, pk)
    chosen = str(request.data.get("option", "")).upper()[:1]
    if q.stage != Stage.PRELIMS or not q.correct_option:
        return Response({"detail": "This question has no answer to check against."}, status=400)
    if chosen not in {"A", "B", "C", "D"}:
        return Response({"detail": "Choose A, B, C or D."}, status=400)
    correct = chosen == q.correct_option
    Attempt.objects.create(user=request.user, question=q, chosen=chosen, correct=correct)
    return Response({"correct": correct, "correct_option": q.correct_option, "explanation": q.explanation})


@api_view(["POST", "DELETE"])
def bookmark(request, commission, group, pk):
    q = _question(request, commission, group, pk)
    if request.method == "POST":
        Bookmark.objects.get_or_create(user=request.user, question=q)
    else:
        Bookmark.objects.filter(user=request.user, question=q).delete()
    return Response({"bookmarked": request.method == "POST"})


@api_view(["GET", "PUT"])
def answer(request, commission, group, pk):
    q = _question(request, commission, group, pk)
    if request.method == "PUT":
        text = str(request.data.get("text", ""))[:30000]
        score = request.data.get("self_score")
        score = int(score) if str(score).isdigit() and 1 <= int(score) <= 5 else None
        d, _ = AnswerDraft.objects.update_or_create(user=request.user, question=q, defaults={"text": text, "words": len(text.split()), "self_score": score})
    else:
        d = AnswerDraft.objects.filter(user=request.user, question=q).first()
    return Response({"text": d.text if d else "", "words": d.words if d else 0, "self_score": d.self_score if d else None, "updated_at": d.updated_at if d else None})


# ───────────────────────────── a section's state ─────────────────────────────


def progress_out(p):
    if not p:
        return {"status": None, "next_due": None, "revisions": 0}
    return {"status": p.status, "next_due": p.next_due, "revisions": p.revisions}


@api_view(["GET", "PUT"])
def topic_status(request, commission, group, code):
    """studying · completed (revision 1 day later) · revised (the next interval) · attention (again tomorrow) · none"""
    track = get_track(commission, group, request.user)
    mt = get_object_or_404(MicroTheme.objects.visible_to(request.user), track=track, code=code.upper())
    p = StudyProgress.objects.filter(user=request.user, micro_theme=mt).first()
    if request.method == "PUT":
        want, today = request.data.get("status"), timezone.localdate()
        if want == "none":
            StudyProgress.objects.filter(user=request.user, micro_theme=mt).delete()
            p = None
        elif want in ("studying", "completed", "revised", "attention"):
            p = p or StudyProgress(user=request.user, micro_theme=mt)
            if want == "studying":
                p.status, p.next_due = "studying", None
            elif want == "completed":
                p.status, p.revisions, p.next_due = "completed", 0, today + timedelta(days=REVISION_DAYS[0])
            elif want == "revised":
                p.status = "completed"
                p.revisions = min(p.revisions + 1, 99)
                p.next_due = today + timedelta(days=REVISION_DAYS[min(p.revisions, len(REVISION_DAYS) - 1)])
            else:
                p.status, p.next_due = "attention", today + timedelta(days=1)
            p.save()
        else:
            return Response({"detail": "Unknown status."}, status=400)
    return Response(progress_out(p))


@api_view(["GET"])
def related_questions(request, commission, group, code):
    """
    PYQs for a section. Those mapped to it exactly; for a section of a Notes module's own syllabus, which PYQs are
    not mapped to, the questions that best match its title's words (and the reply says that is how they were found).
    """
    track = get_track(commission, group, request.user)
    mt = get_object_or_404(MicroTheme.objects.visible_to(request.user).select_related("topic__subject__paper"), track=track, code=code.upper())
    stage = request.query_params.get("stage")
    qs = Question.objects.visible_to(request.user).filter(track=track).select_related("micro_theme")
    if stage in Stage.values:
        qs = qs.filter(stage=stage)
    exact = qs.filter(micro_theme=mt)
    how = "mapped"
    links = list(live_links(SyllabusLink.objects.filter(notes_mt=mt)).values_list("general_mt_id", "status"))
    if exact.exists():
        found = list(exact.order_by("-year", "question_no")[:12])
    else:
        found = []
        if links:
            # a notes topic: the PYQs of the general sections it covers
            found = list(qs.filter(micro_theme_id__in=[g for g, _ in links]).order_by("-year", "question_no")[:16])
            if found:
                how = "linked" if all(st == "confirmed" for _, st in links) else "linked-suggested"
        if len(found) < 8:
            # and the questions that name the topic, when the linked sections have few
            seen = {q.id for q in found}
            named = [q for q in name_matches(qs, mt.title) if q.id not in seen]
            if named and not found:
                how = "matched"
            found += named[: 8 - len(found)]
    data = QuestionReadSerializer(found, many=True, context={"visible_mt_ids": visible_mt_ids(request.user, track)}).data
    mine = mine_for(request.user, [q.id for q in found])
    return Response({"how": how, "results": data, "mine": {str(k): v for k, v in mine.items()}})


def name_matches(qs, title: str):
    """Questions whose own text names the topic: its proper nouns, by stem (Mughal/Mughals, Magadha/Magadhan)."""
    words = [w for w in "".join(ch if ch.isalnum() else " " for ch in title).split() if len(w) > 3 and w.lower() not in GENERIC]
    if not words:
        return []
    for w in [w for w in words if w[0].isupper()] or words:
        stem = w.lower()[: max(5, len(w) - 2)]
        qs = qs.filter(Q(text__iregex=r"\m" + re.escape(stem)) | Q(keywords__iregex=r"\m" + re.escape(stem)))
    return list(qs.order_by("-year", "question_no")[:8])


def _topic(request, commission, group, code):
    track = get_track(commission, group, request.user)
    return track, get_object_or_404(MicroTheme.objects.visible_to(request.user), track=track, code=code.upper())


@api_view(["PUT"])
def reading_position(request, commission, group, code):
    """How far down a topic's notes the student has read (0 to 1), so "Continue" opens there."""
    track, mt = _topic(request, commission, group, code)
    try:
        pos = min(1.0, max(0.0, float(request.data.get("position", 0))))
    except (TypeError, ValueError):
        return Response({"detail": "position is a number from 0 to 1."}, status=400)
    kind = str(request.data.get("kind", ""))[:16]
    Activity.objects.update_or_create(user=request.user, micro_theme=mt, defaults={"track": track, "note_kind": kind, "position": pos})
    return Response({"position": pos})


@api_view(["POST", "DELETE"])
def keep_topic(request, commission, group, code):
    """Keep a topic (its notes) to come back to."""
    _, mt = _topic(request, commission, group, code)
    if request.method == "POST":
        TopicBookmark.objects.get_or_create(user=request.user, micro_theme=mt)
    else:
        TopicBookmark.objects.filter(user=request.user, micro_theme=mt).delete()
    return Response({"kept": request.method == "POST"})


def record_reading(user, track, mt, kind=""):
    if user.is_authenticated:
        Activity.objects.update_or_create(user=user, micro_theme=mt, defaults={"track": track, "note_kind": kind})


# ───────────────────────────── the dashboard ─────────────────────────────


@api_view(["GET"])
def dashboard(request, commission, group):
    """What to study next, what is done, what is due, where the student is weak: from their own record only."""
    track, user, today = get_track(commission, group, request.user), request.user, timezone.localdate()
    mts = MicroTheme.objects.visible_to(user).filter(track=track)
    progress = StudyProgress.objects.filter(user=user, micro_theme__track=track).select_related("micro_theme__topic__subject__paper")

    def ref(mt, extra=None):
        paper = mt.topic.subject.paper
        return {"code": mt.code, "id": mt.id, "title": mt.title, "subject": mt.topic.subject.title, "subject_id": mt.topic.subject_id, "notes_kind": paper.notes_kind, **(extra or {})}

    cont = [
        ref(a.micro_theme, {"note_kind": a.note_kind, "seen_at": a.seen_at, "position": round(a.position, 3)})
        for a in Activity.objects.filter(user=user, track=track).select_related("micro_theme__topic__subject__paper").order_by("-seen_at")[:5]
    ]
    due = [ref(p.micro_theme, {"next_due": p.next_due, "status": p.status, "revisions": p.revisions}) for p in progress.filter(next_due__lte=today).order_by("next_due")[:8]]
    attention = [ref(p.micro_theme) for p in progress.filter(status="attention").order_by("-updated_at")[:6]]
    counts = dict(progress.values_list("status").annotate(n=Count("id")))

    attempts = Attempt.objects.filter(user=user, question__track=track)
    total = attempts.count()
    right = attempts.filter(correct=True).count()
    by_subject = []
    for row in (
        attempts.exclude(question__micro_theme=None)
        .values("question__micro_theme__topic__subject_id", "question__micro_theme__topic__subject__title")
        .annotate(n=Count("id"), ok=Count("id", filter=Q(correct=True)))
        .order_by("-n")
    ):
        by_subject.append({"subject_id": row["question__micro_theme__topic__subject_id"], "subject": row["question__micro_theme__topic__subject__title"], "attempted": row["n"], "correct": row["ok"], "accuracy": round(100 * row["ok"] / row["n"])})
    weak = sorted([s for s in by_subject if s["attempted"] >= 5], key=lambda s: s["accuracy"])[:3]
    prelims_total = Question.objects.visible_to(user).filter(track=track, stage=Stage.PRELIMS).exclude(correct_option="").count()
    answered = attempts.values("question").distinct().count()
    week = attempts.filter(created_at__gte=timezone.now() - timedelta(days=7)).count()

    # streak: consecutive days, ending today or yesterday, with any learning recorded
    days = set(attempts.values_list("created_at__date", flat=True))
    days |= set(Activity.objects.filter(user=user, track=track).values_list("seen_at__date", flat=True))
    days |= set(progress.exclude(updated_at=None).values_list("updated_at__date", flat=True))
    streak, d = 0, today if today in days else today - timedelta(days=1)
    while d in days:
        streak, d = streak + 1, d - timedelta(days=1)

    general = mts.filter(topic__subject__paper__notes_kind="")
    with_notes = Note.objects.visible_to(user).filter(micro_theme__track=track).values("micro_theme").distinct().count()

    # what to do next, in order of what matters most
    nxt = []
    if due:
        nxt.append({"kind": "revise", "text": f"Revise {len(due)} topic{'s' if len(due) > 1 else ''} due today", "target": due[0]})
    if cont:
        nxt.append({"kind": "continue", "text": f"Continue reading “{cont[0]['title']}”", "target": cont[0]})
    if weak:
        nxt.append({"kind": "practise", "text": f"Practise {weak[0]['subject']}: {weak[0]['accuracy']}% so far", "subject_id": weak[0]["subject_id"]})
    if total == 0 and prelims_total:
        nxt.append({"kind": "start", "text": "Answer your first Prelims questions", "target": None})
    if attention:
        nxt.append({"kind": "attention", "text": f"Go back to “{attention[0]['title']}” (marked as needing attention)", "target": attention[0]})

    return Response({
        "track": track_ref(track),
        "today": today,
        "streak": streak,
        "topics": {
            "general": general.count(), "with_notes": with_notes,
            "completed": counts.get("completed", 0), "studying": counts.get("studying", 0), "attention": counts.get("attention", 0),
            "due": progress.filter(next_due__lte=today).count(),
        },
        "prelims": {"available": prelims_total, "answered": answered, "attempts": total, "correct": right, "accuracy": round(100 * right / total) if total else None, "this_week": week},
        "mains": {"drafts": AnswerDraft.objects.filter(user=user, question__track=track).count()},
        "bookmarks": Bookmark.objects.filter(user=user, question__track=track).count(),
        "kept_topics": [
            ref(b.micro_theme)
            for b in TopicBookmark.objects.filter(user=user, micro_theme__track=track).select_related("micro_theme__topic__subject__paper").order_by("-created_at")[:6]
        ],
        "continue": cont,
        "due": due,
        "attention": attention,
        "by_subject": by_subject[:8],
        "weak": weak,
        "next": nxt[:4],
    })
