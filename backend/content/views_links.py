"""
Manage → Syllabus links: an editor reviews the links between a Notes module's own syllabus and the general one
(content/syllabus_links.py), confirming, rejecting or adding them. Admins only.
"""

from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsAdminRole

from .models import MicroTheme, Subject, SyllabusLink, Track
from .syllabus_links import STRONG, suggest_for_track

ADMIN = [IsAdminRole]


def _track(ref: str) -> Track:
    commission, _, group = (ref or "").partition("/")
    return get_object_or_404(Track, commission__slug=commission, group__slug=group)


def _general(mt):
    return {"code": mt.code, "title": mt.title, "topic": mt.topic.title, "subject": mt.topic.subject.title, "paper": mt.topic.subject.paper.title, "questions": getattr(mt, "q_count", None)}


@api_view(["GET", "POST"])
@permission_classes(ADMIN)
def links(request):
    """GET ?track=appsc/group-1&kind=comprehensive&subject=<id>&show=unreviewed|all · POST {track, notes_code, general_code}"""
    track = _track(request.query_params.get("track") or request.data.get("track"))
    if request.method == "POST":
        notes = get_object_or_404(MicroTheme.objects.exclude(topic__subject__paper__notes_kind=""), track=track, code=str(request.data.get("notes_code", "")).upper())
        general = get_object_or_404(MicroTheme.objects.filter(topic__subject__paper__notes_kind=""), track=track, code=str(request.data.get("general_code", "")).strip().upper())
        link, _ = SyllabusLink.objects.update_or_create(notes_mt=notes, general_mt=general, defaults={"status": "confirmed", "updated_by": request.user})
        return Response({"id": link.id, "status": link.status})

    kind = request.query_params.get("kind", "comprehensive")
    subjects = list(
        Subject.objects.filter(paper__track=track, paper__notes_kind=kind)
        .annotate(n=Count("topics__micro_themes"))
        .order_by("paper__order", "order", "id")
        .values("id", "title", "n", "paper__title")
    )
    sid = request.query_params.get("subject")
    subject = next((s for s in subjects if str(s["id"]) == sid), subjects[0] if subjects else None)
    show = request.query_params.get("show", "all")
    rows = []
    if subject:
        general = MicroTheme.objects.select_related("topic__subject__paper").annotate(q_count=Count("questions"))
        mts = (
            MicroTheme.objects.filter(track=track, topic__subject_id=subject["id"])
            .select_related("topic")
            .prefetch_related(Prefetch("links_out", queryset=SyllabusLink.objects.prefetch_related(Prefetch("general_mt", queryset=general)).order_by("-score")))
            .order_by("topic__order", "topic_id", "order", "id")
        )
        for mt in mts:
            ls = [link for link in mt.links_out.all()]
            if show == "unreviewed" and not any(link.status == "suggested" for link in ls):
                continue
            rows.append({
                "code": mt.code, "title": mt.title, "chapter": mt.topic.title,
                "links": [{"id": link.id, "status": link.status, "score": link.score, "live": link.status == "confirmed" or (link.status == "suggested" and link.score >= STRONG), "general": _general(link.general_mt)} for link in ls],
            })
    totals = dict(SyllabusLink.objects.filter(notes_mt__track=track).values_list("status").annotate(n=Count("id")))
    return Response({"kind": kind, "subjects": subjects, "subject": subject, "rows": rows, "totals": totals, "strong": STRONG})


@api_view(["POST"])
@permission_classes(ADMIN)
def review(request):
    """{ids: [...], status: confirmed|rejected|suggested}"""
    status = request.data.get("status")
    if status not in ("confirmed", "rejected", "suggested"):
        return Response({"detail": "Unknown status."}, status=400)
    ids = [int(i) for i in request.data.get("ids", []) if str(i).isdigit()]
    n = SyllabusLink.objects.filter(id__in=ids).update(status=status, updated_by=request.user)
    return Response({"updated": n})


@api_view(["POST"])
@permission_classes(ADMIN)
def suggest(request):
    """Suggest again from the titles (after the syllabus changed). Confirmed and rejected links stay as they are."""
    track = _track(request.data.get("track"))
    return Response(suggest_for_track(track, SyllabusLink, MicroTheme))


@api_view(["GET"])
@permission_classes(ADMIN)
def general_sections(request):
    """General-syllabus sections matching ?q (code or words), for adding a link by hand."""
    track = _track(request.query_params.get("track"))
    q = (request.query_params.get("q") or "").strip()
    qs = MicroTheme.objects.filter(track=track, topic__subject__paper__notes_kind="").select_related("topic__subject__paper").annotate(q_count=Count("questions"))
    if q:
        qs = qs.filter(Q(code__icontains=q) | Q(title__icontains=q) | Q(topic__title__icontains=q))
    return Response({"results": [_general(m) for m in qs.order_by("code")[:20]]})
