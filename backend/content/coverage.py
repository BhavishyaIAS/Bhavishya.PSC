"""
Coverage metrics for an exam track.

  syllabus coverage = micro-themes that have at least one *published* note
                      ÷ micro-themes in scope
  "in scope" is every micro-theme for admins, and only published ones for
  students (they never learn that drafts exist).

Personal progress = micro-themes the user marked as studied ÷ micro-themes in scope.
"""

from collections import defaultdict

from django.db.models import Case, Count, Exists, OuterRef, When

from accounts.models import is_admin

from .models import MicroTheme, Note, Paper, Question, Stage, Status, StudyMaterial, StudyProgress, Track
from .serializers import track_ref


def pct(part, whole):
    return round(100 * part / whole) if whole else 0


def track_coverage(track: Track, user, include_papers=True):
    admin = is_admin(user)
    mts = (
        MicroTheme.objects.visible_to(user)
        .filter(track=track)
        .annotate(
            has_content=Exists(Note.objects.filter(micro_theme=OuterRef("pk"), status=Status.PUBLISHED)),
            studied=Exists(StudyProgress.objects.filter(micro_theme=OuterRef("pk"), user_id=user.id)),
        )
        .values("id", "status", "has_content", "studied", "topic__subject__paper_id")
    )
    per_paper = defaultdict(lambda: {"micro_themes": 0, "covered": 0, "studied": 0, "published": 0})
    totals = {"micro_themes": 0, "covered": 0, "studied": 0, "published": 0}
    for mt in mts:
        bucket = per_paper[mt["topic__subject__paper_id"]]
        for target in (bucket, totals):
            target["micro_themes"] += 1
            target["covered"] += int(mt["has_content"])
            target["studied"] += int(mt["studied"])
            target["published"] += int(mt["status"] == Status.PUBLISHED)

    questions = Question.objects.filter(track=track, status=Status.PUBLISHED)
    q_by_stage = dict(questions.values_list("stage").annotate(n=Count("id")))
    q_by_paper = defaultdict(lambda: {Stage.PRELIMS: 0, Stage.MAINS: 0})
    for row in questions.exclude(micro_theme=None).values("stage", "micro_theme__topic__subject__paper_id").annotate(
        n=Count("id")
    ):
        q_by_paper[row["micro_theme__topic__subject__paper_id"]][row["stage"]] = row["n"]

    result = {
        "track": track_ref(track),
        "micro_themes": totals["micro_themes"],
        "published_micro_themes": totals["published"],
        "covered_micro_themes": totals["covered"],
        "coverage_pct": pct(totals["covered"], totals["micro_themes"]),
        "studied_micro_themes": totals["studied"],
        "studied_pct": pct(totals["studied"], totals["micro_themes"]),
        "prelims_questions": q_by_stage.get(Stage.PRELIMS, 0),
        "mains_questions": q_by_stage.get(Stage.MAINS, 0),
        "materials": StudyMaterial.objects.visible_to(user).filter(track=track).count(),
        "has_content": totals["micro_themes"] > 0 or sum(q_by_stage.values()) > 0,
    }
    if admin:
        result["draft_micro_themes"] = totals["micro_themes"] - totals["published"]
        result["draft_questions"] = Question.objects.filter(track=track, status=Status.DRAFT).count()

    if include_papers:
        rows = []
        for paper in Paper.objects.visible_to(user).filter(track=track).order_by(Case(When(stage=Stage.PRELIMS, then=0), default=1), "order", "id"):
            b = per_paper.get(paper.id, {"micro_themes": 0, "covered": 0, "studied": 0, "published": 0})
            q = q_by_paper.get(paper.id, {Stage.PRELIMS: 0, Stage.MAINS: 0})
            rows.append({
                "id": paper.id,
                "code": paper.code,
                "title": paper.title,
                "stage": paper.stage,
                "status": paper.status,
                "micro_themes": b["micro_themes"],
                "covered": b["covered"],
                "coverage_pct": pct(b["covered"], b["micro_themes"]),
                "studied": b["studied"],
                "studied_pct": pct(b["studied"], b["micro_themes"]),
                "prelims_questions": q[Stage.PRELIMS],
                "mains_questions": q[Stage.MAINS],
            })
        result["papers"] = rows
    return result
