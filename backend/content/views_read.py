"""
Read endpoints for authenticated users. Every queryset goes through
`visible_to(request.user)`, so students only ever receive published content.
"""

import mimetypes

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.postgres.search import SearchHeadline, SearchQuery, SearchRank, SearchVector
from django.core import signing
from django.db.models import Case, Count, IntegerField, Prefetch, Q, Value, When
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.models import is_admin

from .coverage import track_coverage
from .models import (
    SEARCH_CONFIG,
    Commission,
    GlossaryTerm,
    MicroTheme,
    Note,
    NoteKind,
    Paper,
    Question,
    Stage,
    StudyMaterial,
    StudyProgress,
    Subject,
    Topic,
    Track,
    mt_visible_q,
)
from .pagination import StandardPagination
from .serializers import (
    CommissionSerializer,
    MaterialSerializer,
    NoteSerializer,
    QuestionReadSerializer,
    track_ref,
)

DOWNLOAD_SALT = "material-download"
STAGE_RANK = Case(
    When(topic__subject__paper__stage=Stage.PRELIMS, then=Value(0)), default=Value(1), output_field=IntegerField()
)


def get_track(commission: str, group: str) -> Track:
    return get_object_or_404(
        Track.objects.select_related("commission", "group"),
        commission__slug=commission,
        commission__is_active=True,
        group__slug=group,
    )


def visible_mt_ids(user, track):
    return set(MicroTheme.objects.visible_to(user).filter(track=track).values_list("id", flat=True))


# ───────────────────────────── Catalog ──────────────────────────────


@api_view(["GET"])
@permission_classes([AllowAny])
def commissions(request):
    qs = Commission.objects.filter(is_active=True).prefetch_related(
        Prefetch("tracks", queryset=Track.objects.select_related("commission", "group"))
    )
    # "has content" = any published micro-theme or question in the track.
    counts = {}
    for row in Question.objects.filter(status="published").values("track").annotate(n=Count("id")):
        counts[row["track"]] = counts.get(row["track"], 0) + row["n"]
    for row in MicroTheme.objects.filter(mt_visible_q()).values("track").annotate(n=Count("id")):
        counts[row["track"]] = counts.get(row["track"], 0) + row["n"]
    data = CommissionSerializer(qs, many=True, context={"track_counts": counts}).data
    return Response({"results": data})


@api_view(["GET"])
@permission_classes([AllowAny])
def track_detail(request, commission, group):
    track = get_track(commission, group)
    siblings = Track.objects.filter(commission=track.commission).select_related("commission", "group")
    return Response({
        **track_ref(track),
        "tagline": track.tagline,
        "commission_full_name": track.commission.name,
        "siblings": [track_ref(t) for t in siblings],
    })


# ───────────────────────────── Syllabus ─────────────────────────────


@api_view(["GET"])
def syllabus_tree(request, commission, group):
    """Paper → Subject → Topic → MicroTheme, with per-micro-theme content flags."""
    track = get_track(commission, group)
    user = request.user
    stage = request.query_params.get("stage")

    papers = Paper.objects.visible_to(user).filter(track=track)
    if stage in Stage.values:
        papers = papers.filter(stage=stage)
    papers = list(papers.order_by(Case(When(stage=Stage.PRELIMS, then=0), default=1), "order", "id"))
    paper_ids = [p.id for p in papers]
    subjects = list(Subject.objects.visible_to(user).filter(paper_id__in=paper_ids))
    topics = list(Topic.objects.visible_to(user).filter(subject__paper_id__in=paper_ids))
    mts = list(MicroTheme.objects.visible_to(user).filter(topic__subject__paper_id__in=paper_ids))

    note_kinds = {}
    for mt_id, kind in Note.objects.visible_to(user).filter(micro_theme__in=mts).values_list("micro_theme_id", "kind"):
        note_kinds.setdefault(mt_id, []).append(kind)
    q_counts = dict(
        Question.objects.visible_to(user).filter(micro_theme__in=mts).values_list("micro_theme").annotate(n=Count("id"))
    )
    studied = set(StudyProgress.objects.filter(user=user, micro_theme__in=mts).values_list("micro_theme_id", flat=True))

    def node(obj, **extra):
        return {"id": obj.id, "code": obj.code, "title": obj.title, "order": obj.order, "status": obj.status, **extra}

    mt_by_topic, topic_by_subject, subject_by_paper = {}, {}, {}
    for mt in mts:
        mt_by_topic.setdefault(mt.topic_id, []).append(node(
            mt,
            priority=mt.priority,
            estimated_minutes=mt.estimated_minutes,
            is_dual_stage=mt.is_dual_stage,
            note_kinds=sorted(note_kinds.get(mt.id, [])),
            question_count=q_counts.get(mt.id, 0),
            studied=mt.id in studied,
        ))
    for t in topics:
        topic_by_subject.setdefault(t.subject_id, []).append(node(t, micro_themes=mt_by_topic.get(t.id, [])))
    for s in subjects:
        subject_by_paper.setdefault(s.paper_id, []).append(node(s, topics=topic_by_subject.get(s.id, [])))
    tree = [
        node(p, stage=p.stage, description=p.description, subjects=subject_by_paper.get(p.id, []))
        for p in papers
    ]
    return Response({"track": track_ref(track), "papers": tree})


@api_view(["GET"])
def micro_theme_detail(request, commission, group, code):
    track = get_track(commission, group)
    user = request.user
    mt = get_object_or_404(
        MicroTheme.objects.visible_to(user).select_related("topic__subject__paper"),
        track=track,
        code=code.upper(),
    )
    notes = {n.kind: NoteSerializer(n).data for n in Note.objects.visible_to(user).filter(micro_theme=mt)}
    questions = (
        Question.objects.visible_to(user)
        .filter(micro_theme=mt)
        .select_related("micro_theme__topic__subject__paper")
        .prefetch_related("tags")
    )
    q_data = QuestionReadSerializer(questions, many=True, context={"visible_mt_ids": {mt.id}}).data

    ordered = list(
        MicroTheme.objects.visible_to(user)
        .filter(track=track)
        .annotate(stage_rank=STAGE_RANK)
        .order_by(
            "stage_rank", "topic__subject__paper__order", "topic__subject__paper_id",
            "topic__subject__order", "topic__subject_id", "topic__order", "topic_id", "order", "id",
        )
        .values("id", "code", "title")
    )
    idx = next(i for i, row in enumerate(ordered) if row["id"] == mt.id)
    prev_mt = ordered[idx - 1] if idx > 0 else None
    next_mt = ordered[idx + 1] if idx + 1 < len(ordered) else None

    topic, subject, paper = mt.topic, mt.topic.subject, mt.topic.subject.paper
    materials = StudyMaterial.objects.visible_to(user).filter(
        Q(micro_theme=mt) | Q(topic=topic, micro_theme=None)
    ).select_related("track__commission", "track__group")
    return Response({
        "track": track_ref(track),
        "micro_theme": {
            "id": mt.id, "code": mt.code, "title": mt.title, "status": mt.status, "priority": mt.priority,
            "estimated_minutes": mt.estimated_minutes, "is_dual_stage": mt.is_dual_stage,
        },
        "breadcrumb": {
            "paper": {"id": paper.id, "title": paper.title, "stage": paper.stage, "code": paper.code},
            "subject": {"id": subject.id, "title": subject.title},
            "topic": {"id": topic.id, "title": topic.title},
        },
        "notes": notes,
        "videos": list(mt.videos.values("id", "title", "url")),
        "glossary": list(mt.glossary.values("id", "term", "definition")),
        "questions": q_data,
        "materials": MaterialSerializer(materials, many=True).data,
        "studied": StudyProgress.objects.filter(user=user, micro_theme=mt).exists(),
        "prev": prev_mt,
        "next": next_mt,
        "position": {"index": idx + 1, "total": len(ordered)},
    })


@api_view(["POST", "DELETE"])
def micro_theme_progress(request, commission, group, code):
    track = get_track(commission, group)
    mt = get_object_or_404(MicroTheme.objects.visible_to(request.user), track=track, code=code.upper())
    if request.method == "POST":
        StudyProgress.objects.get_or_create(user=request.user, micro_theme=mt)
    else:
        StudyProgress.objects.filter(user=request.user, micro_theme=mt).delete()
    return Response({"studied": request.method == "POST"})


@api_view(["GET"])
def track_notes(request, commission, group):
    """
    Notes of one kind for a subject (or topic), in syllabus order — the
    "topic-wise condensed notes" reader. `?kind=prelims&subject=<id>` or `&topic=<id>`.
    """
    track = get_track(commission, group)
    user = request.user
    kind = request.query_params.get("kind", NoteKind.COMPREHENSIVE)
    if kind not in NoteKind.values:
        return Response({"detail": "Unknown note kind."}, status=400)
    notes = Note.objects.visible_to(user).filter(micro_theme__track=track, kind=kind)
    subject, topic = request.query_params.get("subject", ""), request.query_params.get("topic", "")
    if topic.isdigit():
        notes = notes.filter(micro_theme__topic_id=int(topic))
    elif subject.isdigit():
        notes = notes.filter(micro_theme__topic__subject_id=int(subject))
    else:
        return Response({"detail": "Pass subject or topic."}, status=400)
    notes = notes.select_related("micro_theme__topic").order_by(
        "micro_theme__topic__order", "micro_theme__topic_id", "micro_theme__order", "micro_theme_id"
    )
    return Response({
        "kind": kind,
        "results": [
            {
                "micro_theme": {"id": n.micro_theme.id, "code": n.micro_theme.code, "title": n.micro_theme.title},
                "topic": {"id": n.micro_theme.topic.id, "title": n.micro_theme.topic.title},
                "note": NoteSerializer(n).data,
            }
            for n in notes
        ],
    })


# ───────────────────────────── Coverage ─────────────────────────────


@api_view(["GET"])
def coverage(request, commission, group):
    return Response(track_coverage(get_track(commission, group), request.user))


@api_view(["GET"])
def coverage_overview(request):
    tracks = Track.objects.filter(commission__is_active=True).select_related("commission", "group")
    return Response({"results": [track_coverage(t, request.user, include_papers=False) for t in tracks]})


# ─────────────────────────────── PYQs ───────────────────────────────


def filter_questions(qs, params):
    if qid := params.get("id"):
        return qs.filter(pk=qid) if str(qid).isdigit() else qs.none()
    if year := params.get("year"):
        if year.isdigit():
            qs = qs.filter(year=int(year))
    if label := params.get("paper_label"):
        qs = qs.filter(paper_label=label)
    if paper := params.get("paper"):
        qs = qs.filter(micro_theme__topic__subject__paper_id=paper) if paper.isdigit() else qs.none()
    if subject := params.get("subject"):
        qs = qs.filter(micro_theme__topic__subject_id=subject) if subject.isdigit() else qs.none()
    if topic := params.get("topic"):
        qs = qs.filter(micro_theme__topic_id=topic) if topic.isdigit() else qs.none()
    if micro := params.get("micro"):
        qs = qs.filter(micro_theme__code=micro.upper())
    if tag := params.get("tag"):
        qs = qs.filter(tags__slug=tag)
    if status := params.get("status"):
        qs = qs.filter(status=status)
    if q := (params.get("q") or "").strip():
        query = SearchQuery(q, search_type="websearch", config=SEARCH_CONFIG)
        qs = (
            qs.filter(Q(search_vector=query) | Q(text__icontains=q) | Q(keywords__icontains=q))
            .annotate(rank=SearchRank("search_vector", query))
            .order_by("-rank", "-year", "question_no")
        )
    return qs.distinct()


@api_view(["GET"])
def track_questions(request, commission, group):
    track = get_track(commission, group)
    stage = request.query_params.get("stage", Stage.PRELIMS)
    if stage not in Stage.values:
        return Response({"detail": "stage must be prelims or mains"}, status=400)
    qs = (
        Question.objects.visible_to(request.user)
        .filter(track=track, stage=stage)
        .select_related("micro_theme__topic__subject__paper")
        .prefetch_related("tags")
    )
    params = request.query_params.copy()
    if not is_admin(request.user):
        params.pop("status", None)
    qs = filter_questions(qs, params)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    ctx = {"visible_mt_ids": visible_mt_ids(request.user, track)}
    return paginator.get_paginated_response(QuestionReadSerializer(page, many=True, context=ctx).data)


@api_view(["GET"])
def question_facets(request, commission, group):
    track = get_track(commission, group)
    stage = request.query_params.get("stage", Stage.PRELIMS)
    qs = Question.objects.visible_to(request.user).filter(track=track, stage=stage)
    return Response({
        "total": qs.count(),
        "years": sorted(set(qs.values_list("year", flat=True)), reverse=True),
        "paper_labels": sorted(set(qs.values_list("paper_label", flat=True))),
        "tags": list(
            qs.filter(tags__isnull=False)
            .values("tags__slug", "tags__name")
            .annotate(n=Count("id"))
            .order_by("tags__name")
            .values("tags__slug", "tags__name", "n")
        ),
    })


# ──────────────────────────── Materials ─────────────────────────────


@api_view(["GET"])
def track_materials(request, commission, group):
    track = get_track(commission, group)
    qs = StudyMaterial.objects.visible_to(request.user).filter(track=track).select_related(
        "track__commission", "track__group", "paper", "subject__paper", "topic__subject__paper",
        "micro_theme__topic__subject__paper",
    )
    if (category := request.query_params.get("category")) in NoteKind.values:
        qs = qs.filter(category=category)
    if q := (request.query_params.get("q") or "").strip():
        qs = qs.filter(Q(title__icontains=q) | Q(description__icontains=q))
    return Response({"results": MaterialSerializer(qs, many=True).data})


@api_view(["POST"])
def material_link(request, pk):
    """Issue a short-lived, user-bound download link for a material the caller may see."""
    material = get_object_or_404(StudyMaterial.objects.visible_to(request.user), pk=pk)
    if not material.file or not material.file.storage.exists(material.file.name):
        return Response({"detail": "This file is no longer available on the server. Ask an admin to re-upload it."}, status=410)
    token = signing.dumps({"m": material.pk, "u": request.user.pk}, salt=DOWNLOAD_SALT)
    return Response({
        "url": f"/api/files/m/{token}/",
        "expires_in": settings.DOWNLOAD_LINK_TTL_SECONDS,
        "filename": material.original_filename,
    })


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def material_download(request, token):
    try:
        payload = signing.loads(token, salt=DOWNLOAD_SALT, max_age=settings.DOWNLOAD_LINK_TTL_SECONDS)
    except signing.SignatureExpired:
        return Response({"detail": "This download link has expired. Please request a new one."}, status=410)
    except signing.BadSignature:
        raise Http404
    user = get_user_model().objects.filter(pk=payload.get("u"), is_active=True).first()
    if user is None:
        raise Http404
    # Re-check visibility at download time: an unpublished file stops downloading immediately.
    material = StudyMaterial.objects.visible_to(user).filter(pk=payload.get("m")).first()
    if material is None or not material.file:
        raise Http404
    if not material.file.storage.exists(material.file.name):
        # e.g. a host whose disk was wiped by a restart (Render's free tier).
        return Response({"detail": "This file is no longer available on the server. Ask an admin to re-upload it."}, status=410)
    content_type = material.content_type or mimetypes.guess_type(material.original_filename)[0]
    response = FileResponse(
        material.file.open("rb"),
        as_attachment=request.query_params.get("inline") != "1",
        filename=material.original_filename,
        content_type=content_type or "application/octet-stream",
    )
    response["Cache-Control"] = "private, no-store"
    return response


# ────────────────────────────── Search ──────────────────────────────


def _clean(text):
    return " ".join((text or "").split())


def _snippet(text, q, length=180):
    text = _clean(text)
    lower = text.lower()
    i = lower.find(q.lower().split()[0]) if q.split() else -1
    start = max(0, i - 60) if i >= 0 else 0
    out = text[start:start + length].replace("\n", " ").strip()
    return ("… " if start else "") + out + (" …" if start + length < len(text) else "")


@api_view(["GET"])
def search(request):
    """Global search across micro-themes, notes, glossary terms and PYQs."""
    q = (request.query_params.get("q") or "").strip()
    user = request.user
    if len(q) < 2:
        return Response({"query": q, "total": 0, "groups": []})
    query = SearchQuery(q, search_type="websearch", config=SEARCH_CONFIG)
    track = None
    if scope := request.query_params.get("track"):
        parts = scope.split("/")
        if len(parts) == 2:
            track = Track.objects.filter(commission__slug=parts[0], group__slug=parts[1]).first()
    limit = 12

    def scoped(qs, field="track"):
        return qs.filter(**{field: track}) if track else qs

    def mt_link(mt):
        t = mt.track
        return {"commission": t.commission.slug, "group": t.group.slug, "code": mt.code, "track_label": str(t)}

    groups = []

    mts = scoped(MicroTheme.objects.visible_to(user)).select_related(
        "track__commission", "track__group", "topic__subject"
    ).filter(Q(title__icontains=q) | Q(code__iexact=q) | Q(topic__title__icontains=q))[:limit]
    groups.append({"type": "micro_theme", "label": "Syllabus", "items": [
        {**mt_link(mt), "title": f"{mt.code} · {mt.title}", "snippet": f"{mt.topic.subject.title} › {mt.topic.title}"}
        for mt in mts
    ]})

    notes = (
        scoped(Note.objects.visible_to(user), "micro_theme__track")
        .filter(Q(search_vector=query) | Q(body_text__icontains=q))
        .annotate(
            rank=SearchRank("search_vector", query),
            headline=SearchHeadline(
                "body_text", query, config=SEARCH_CONFIG, max_words=30, min_words=12,
                start_sel="«", stop_sel="»",
            ),
        )
        .select_related("micro_theme__track__commission", "micro_theme__track__group")
        .order_by("-rank")[:limit]
    )
    groups.append({"type": "note", "label": "Notes", "items": [
        {
            **mt_link(n.micro_theme),
            "kind": n.kind,
            "title": f"{n.micro_theme.title} — {NoteKind(n.kind).label}",
            "snippet": _clean(n.headline) if "«" in (n.headline or "") else _snippet(n.body_text, q),
        }
        for n in notes
    ]})

    gloss_qs = GlossaryTerm.objects.filter(micro_theme__in=MicroTheme.objects.visible_to(user))
    if track:
        gloss_qs = gloss_qs.filter(micro_theme__track=track)
    gloss = (
        gloss_qs.annotate(sv=SearchVector("term", weight="A", config=SEARCH_CONFIG)
                          + SearchVector("definition", weight="B", config=SEARCH_CONFIG))
        .filter(Q(sv=query) | Q(term__icontains=q))
        .select_related("micro_theme__track__commission", "micro_theme__track__group")[:limit]
    )
    groups.append({"type": "glossary", "label": "Glossary", "items": [
        {**mt_link(g.micro_theme), "title": g.term, "snippet": _snippet(g.definition, q)} for g in gloss
    ]})

    for stage, label in ((Stage.PRELIMS, "Prelims PYQs"), (Stage.MAINS, "Mains PYQs")):
        qs = filter_questions(
            scoped(Question.objects.visible_to(user)).filter(stage=stage), {"q": q}
        ).select_related("track__commission", "track__group")[:limit]
        groups.append({"type": f"{stage}_question", "label": label, "items": [
            {
                "id": x.id,
                "commission": x.track.commission.slug,
                "group": x.track.group.slug,
                "track_label": str(x.track),
                "stage": stage,
                "title": f"{x.year} · {x.paper_label} · Q{x.question_no}",
                "snippet": _snippet(x.text, q, 220),
            }
            for x in qs
        ]})

    groups = [g for g in groups if g["items"]]
    return Response({"query": q, "total": sum(len(g["items"]) for g in groups), "groups": groups})
