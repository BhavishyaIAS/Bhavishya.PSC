"""
Admin control over the shape of the platform itself:

* exams   — add / edit / remove commissions (APPSC, TGPSC, UPSC…) and the exams
            inside each (Group 1, Group 2, Civil Services…);
* topics  — the catalogue of syllabus topics a learner picks from;
* site    — home-page wording, how notes are presented, and the switch that
            dedicates the whole platform to one exam.
"""

from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.permissions import IsAdminRole

from .models import Commission, ExamGroup, MicroTheme, NoteKind, Paper, SiteSettings, Stage, Status, Subject, Track
from .serializers import SubjectSerializer, track_ref

ADMIN = [IsAdminRole]
PUB, DRAFT = Status.PUBLISHED, Status.DRAFT

# Colour palettes for commission cards and "looks" for topics; the frontend holds the actual colours and scenes.
THEMES = ["red", "blue", "navy", "green", "teal", "violet", "orange", "gold"]
LOOKS = ["history", "geography", "polity", "economy", "science", "environment", "general"]

NOTE_KIND_DEFAULTS = {
    NoteKind.COMPREHENSIVE: ("Comprehensive Notes", "Complete syllabus-linked reference notes"),
    NoteKind.PRELIMS: ("Prelims Notes", "Concise, fact-focused revision notes per micro-theme"),
    NoteKind.MAINS: ("Mains Notes", "Condensed analytical notes & answer frameworks"),
}


def note_kinds(settings: SiteSettings):
    """The three note types as the site presents them: admin's wording over the defaults."""
    out = []
    for key, (label, blurb) in NOTE_KIND_DEFAULTS.items():
        custom = settings.note_kinds.get(key) or {}
        out.append({
            "key": key,
            "label": custom.get("label") or label,
            "blurb": custom.get("blurb") if "blurb" in custom else blurb,
            "enabled": custom.get("enabled", True),
        })
    return out


def site_payload(settings: SiteSettings):
    focus = settings.focus_commission
    return {
        "focus": focus.slug if focus else None,
        "focus_name": focus.short_name if focus else "",
        "hero_eyebrow": settings.hero_eyebrow,
        "hero_lead": settings.hero_lead,
        "note_kinds": note_kinds(settings),
        "reader_font": settings.reader_font,
        "reader_size": settings.reader_size,
        "show_codes": settings.show_codes,
        "show_contents": settings.show_contents,
        "backdrops": settings.backdrops,
    }


# ───────────────────────────── Site settings ─────────────────────────────


class SiteSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = ["hero_eyebrow", "hero_lead", "note_kinds", "reader_font", "reader_size", "show_codes", "show_contents", "backdrops"]

    def validate_reader_size(self, value):
        if not 1 <= value <= 4:
            raise serializers.ValidationError("Choose a size from 1 to 4.")
        return value

    def validate_note_kinds(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object keyed by note type.")
        clean = {}
        for key, cfg in value.items():
            if key not in NoteKind.values or not isinstance(cfg, dict):
                raise serializers.ValidationError(f"Unknown note type: {key}")
            label = " ".join(str(cfg.get("label") or "").split())[:40]
            blurb = " ".join(str(cfg.get("blurb") or "").split())[:140]
            clean[key] = {"label": label, "blurb": blurb, "enabled": bool(cfg.get("enabled", True))}
        if clean and not any(clean.get(k, {}).get("enabled", True) for k in NoteKind.values):
            raise serializers.ValidationError("Keep at least one type of notes switched on.")
        return clean


@api_view(["GET"])
@permission_classes([AllowAny])
def site(request):
    """Public: what every page needs to know about how the site is set up."""
    return Response(site_payload(SiteSettings.load()))


@api_view(["GET", "PATCH"])
@permission_classes(ADMIN)
def manage_site(request):
    settings = SiteSettings.load()
    if request.method == "PATCH":
        ser = SiteSettingsSerializer(settings, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
    return Response(site_payload(settings))


@api_view(["POST"])
@permission_classes(ADMIN)
@transaction.atomic
def dedicate(request):
    """
    {commission: id} — dedicate the platform to that exam: show it, hide every other
    commission from students, and open the home page on it.
    {commission: null} — back to all exams: the ones that were visible before return
    (the exam the platform was dedicated to stays visible too).
    """
    settings = SiteSettings.load()
    target_id = request.data.get("commission")
    if target_id in (None, ""):
        Commission.objects.filter(pk__in=settings.restore_visible).update(status=PUB)
        settings.focus_commission, settings.restore_visible = None, []
    else:
        target = get_object_or_404(Commission, pk=target_id)
        if settings.focus_commission_id is None:
            settings.restore_visible = list(Commission.objects.filter(status=PUB).values_list("id", flat=True))
        Commission.objects.exclude(pk=target.pk).update(status=DRAFT)
        Commission.objects.filter(pk=target.pk).update(status=PUB, is_active=True)
        settings.focus_commission = target
    settings.save()
    return Response(site_payload(settings))


# ───────────────────────────── Exams ─────────────────────────────


def unique_slug(model, text, fallback):
    base = slugify(text)[:40] or fallback
    slug, n = base, 2
    while model.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


def group_for(name: str) -> ExamGroup:
    """The shared ExamGroup for a name ("Group 3" → group-3), created on first use."""
    slug = slugify(name)[:50]
    if not slug:
        raise serializers.ValidationError({"name": ["Give the exam a name."]})
    group = ExamGroup.objects.filter(slug=slug).first()
    if group is None:
        last = ExamGroup.objects.aggregate(m=Max("order"))["m"] or 0
        group = ExamGroup.objects.create(slug=slug, name=name, order=last + 1)
    return group


def exam_payload(track: Track):
    return {
        **track_ref(track),
        "tagline": track.tagline,
        "order": track.order,
        "papers": Paper.objects.filter(track=track).count(),
        "sections": MicroTheme.objects.filter(track=track).count(),
    }


def commission_payload(c: Commission):
    return {
        "id": c.id, "slug": c.slug, "short_name": c.short_name, "name": c.name, "description": c.description,
        "status": c.status, "theme": c.theme, "order": c.order,
        "exams": [exam_payload(t) for t in c.tracks.select_related("commission", "group")],
    }


def clean_name(value, limit):
    return " ".join(str(value or "").split())[:limit]


@api_view(["GET", "POST"])
@permission_classes(ADMIN)
@transaction.atomic
def exams(request):
    """List every commission with its exams, or add a commission (optionally with its first exams)."""
    if request.method == "POST":
        short = clean_name(request.data.get("short_name"), 20)
        name = clean_name(request.data.get("name"), 160)
        if not short or not name:
            return Response({"detail": "Give the exam body a short name (e.g. UPSC) and its full name."}, status=400)
        if Commission.objects.filter(short_name__iexact=short).exists():
            return Response({"detail": f"{short} already exists."}, status=400)
        theme = request.data.get("theme") or ""
        last = Commission.objects.aggregate(m=Max("order"))["m"] or 0
        c = Commission.objects.create(
            slug=unique_slug(Commission, short, "exam"), short_name=short, name=name,
            description=clean_name(request.data.get("description"), 400),
            theme=theme if theme in THEMES else "", order=last + 1,
            status=PUB if request.data.get("status") == PUB else DRAFT,
        )
        for i, exam_name in enumerate(request.data.get("exams") or [], start=1):
            if exam_name := clean_name(exam_name, 40):
                Track.objects.get_or_create(commission=c, group=group_for(exam_name), defaults={"order": i})
        return Response(commission_payload(c), status=201)
    settings = SiteSettings.load()
    return Response({
        "results": [commission_payload(c) for c in Commission.objects.prefetch_related("tracks")],
        "themes": THEMES,
        "focus": settings.focus_commission_id,
    })


@api_view(["PATCH", "DELETE"])
@permission_classes(ADMIN)
@transaction.atomic
def exam_body(request, pk):
    """Edit a commission (names, colour, visibility, position) or delete it with everything inside."""
    c = get_object_or_404(Commission, pk=pk)
    if request.method == "DELETE":
        if str(request.data.get("confirm") or request.query_params.get("confirm") or "").strip().lower() != c.short_name.lower():
            return Response({"detail": f"Type {c.short_name} to confirm. This deletes all its exams, notes and PYQs."}, status=400)
        groups = list(c.tracks.values_list("group_id", flat=True))
        c.delete()
        ExamGroup.objects.filter(pk__in=groups, tracks__isnull=True).delete()
        return Response(status=204)
    data = request.data
    if "short_name" in data:
        short = clean_name(data["short_name"], 20)
        if not short:
            return Response({"detail": "The short name can't be empty."}, status=400)
        if Commission.objects.exclude(pk=c.pk).filter(short_name__iexact=short).exists():
            return Response({"detail": f"{short} already exists."}, status=400)
        c.short_name = short
    if "name" in data:
        c.name = clean_name(data["name"], 160) or c.name
    if "description" in data:
        c.description = clean_name(data["description"], 400)
    if "theme" in data:
        c.theme = data["theme"] if data["theme"] in THEMES else ""
    if "status" in data:
        if data["status"] not in Status.values:
            return Response({"status": ["draft or published"]}, status=400)
        c.status = data["status"]
    c.save()
    if data.get("move") in ("up", "down"):
        move(list(Commission.objects.all()), c, data["move"])
    c.refresh_from_db()
    return Response(commission_payload(c))


def move(items, obj, direction):
    """Swap `obj` with its neighbour and renumber the list 1..n."""
    i = next(k for k, o in enumerate(items) if o.pk == obj.pk)
    j = i - 1 if direction == "up" else i + 1
    if 0 <= j < len(items):
        items[i], items[j] = items[j], items[i]
    for position, o in enumerate(items, start=1):
        type(o).objects.filter(pk=o.pk).update(order=position)


@api_view(["POST"])
@permission_classes(ADMIN)
@transaction.atomic
def exam_create(request, pk):
    """Add an exam (Group 3, Civil Services…) to a commission."""
    c = get_object_or_404(Commission, pk=pk)
    name = clean_name(request.data.get("name"), 40)
    group = group_for(name)
    if Track.objects.filter(commission=c, group=group).exists():
        return Response({"detail": f"{c.short_name} already has {group.name}."}, status=400)
    last = Track.objects.filter(commission=c).aggregate(m=Max("order"))["m"] or Track.objects.filter(commission=c).count()
    track = Track.objects.create(commission=c, group=group, order=last + 1, tagline=clean_name(request.data.get("tagline"), 200))
    return Response(exam_payload(track), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes(ADMIN)
@transaction.atomic
def exam_detail(request, pk):
    """Rename / describe / move one exam, or delete it with its syllabus, notes and PYQs."""
    track = get_object_or_404(Track.objects.select_related("commission", "group"), pk=pk)
    old_group = track.group
    if request.method == "DELETE":
        if str(request.data.get("confirm") or request.query_params.get("confirm") or "").strip().lower() != old_group.name.lower():
            return Response({"detail": f"Type {old_group.name} to confirm. This deletes its syllabus, notes and PYQs."}, status=400)
        track.delete()
        ExamGroup.objects.filter(pk=old_group.pk, tracks__isnull=True).delete()
        return Response(status=204)
    if "name" in request.data:
        name = clean_name(request.data["name"], 40)
        group = group_for(name)
        if group.pk != old_group.pk:
            if Track.objects.filter(commission=track.commission, group=group).exists():
                return Response({"detail": f"{track.commission.short_name} already has {group.name}."}, status=400)
            track.group = group
        elif not Track.objects.filter(group=group).exclude(pk=track.pk).exists():
            ExamGroup.objects.filter(pk=group.pk).update(name=name)  # same address, new spelling
    if "tagline" in request.data:
        track.tagline = clean_name(request.data["tagline"], 200)
    track.save()
    ExamGroup.objects.filter(pk=old_group.pk, tracks__isnull=True).delete()
    if request.data.get("move") in ("up", "down"):
        move(list(Track.objects.filter(commission=track.commission)), track, request.data["move"])
    track = Track.objects.select_related("commission", "group").get(pk=track.pk)
    return Response(exam_payload(track))


# ───────────────────────────── Topics catalogue ─────────────────────────────


@api_view(["POST"])
@permission_classes(ADMIN)
@transaction.atomic
def topic_create(request, pk):
    """Add a syllabus topic to an exam. It goes in the exam's first paper (made if there is none)."""
    track = get_object_or_404(Track, pk=pk)
    title = clean_name(request.data.get("title"), 255)
    if not title:
        return Response({"detail": "Give the topic a name."}, status=400)
    if Subject.objects.filter(paper__track=track, title__iexact=title).exists():
        return Response({"detail": f"“{title}” is already in this exam."}, status=400)
    paper = Paper.objects.filter(track=track).order_by("order", "id").first() or Paper.objects.create(
        track=track, code="GS", title="General Studies", stage=Stage.PRELIMS, order=1, status=PUB
    )
    last = Subject.objects.filter(paper=paper).aggregate(m=Max("order"))["m"] or 0
    look = request.data.get("look") or ""
    subject = Subject.objects.create(
        paper=paper, title=title, order=last + 1, look=look if look in LOOKS else "",
        status=DRAFT if request.data.get("status") == DRAFT else PUB,
    )
    return Response(SubjectSerializer(subject).data, status=201)


# ───────────────────────────── Starters ─────────────────────────────

UPSC_TOPICS = [
    ("Ancient History", "history"), ("Medieval History", "history"), ("Modern History", "history"),
    ("Art and Culture", "history"), ("Indian Society", "general"), ("Geography", "geography"),
    ("Polity and Governance", "polity"), ("International Relations", "general"), ("Economy", "economy"),
    ("Environment and Ecology", "environment"), ("Science and Technology", "science"),
    ("Internal Security", "general"), ("Ethics, Integrity and Aptitude", "general"), ("Current Affairs", "general"),
]


@api_view(["POST"])
@permission_classes(ADMIN)
@transaction.atomic
def starter(request):
    """
    {kind: "upsc"} — set up UPSC Civil Services with its usual General Studies topics.
    Hidden from students until an admin shows it or dedicates the platform to it. Safe to repeat.
    """
    if request.data.get("kind") != "upsc":
        return Response({"detail": "Unknown starter."}, status=400)
    last = Commission.objects.aggregate(m=Max("order"))["m"] or 0
    c, created = Commission.objects.get_or_create(
        slug="upsc",
        defaults={
            "short_name": "UPSC", "name": "Union Public Service Commission", "theme": "navy", "order": last + 1,
            "description": "Civil Services Examination — Prelims, Mains and Interview.", "status": DRAFT,
        },
    )
    track, _ = Track.objects.get_or_create(
        commission=c, group=group_for("Civil Services"),
        defaults={"order": 1, "tagline": "Complete preparation workspace for the UPSC Civil Services Examination."},
    )
    if not Subject.objects.filter(paper__track=track).exists():
        paper, _ = Paper.objects.get_or_create(
            track=track, code="GS", defaults={"title": "General Studies", "stage": Stage.PRELIMS, "order": 1, "status": PUB}
        )
        for order, (title, look) in enumerate(UPSC_TOPICS, start=1):
            Subject.objects.create(paper=paper, title=title, look=look, order=order, status=PUB)
    return Response({"created": created, **commission_payload(c)}, status=201 if created else 200)
