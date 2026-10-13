"""
Admin-only content management. Every view here requires `IsAdminRole`; the
permission is checked on the server for every request, regardless of what the
UI shows.
"""

import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.api import serialize_user
from accounts.models import Profile, Role
from accounts.permissions import IsAdminRole

from .importer import MAX_ROWS, columns_for, commit_rows, validate_rows
from .models import (
    GlossaryTerm,
    MicroTheme,
    Note,
    NoteKind,
    Paper,
    Question,
    Stage,
    Status,
    StudyMaterial,
    Subject,
    Tag,
    Topic,
    Track,
    Video,
)
from .serializers import (
    GlossarySerializer,
    MaterialSerializer,
    MicroThemeSerializer,
    NoteSerializer,
    PaperSerializer,
    QuestionReadSerializer,
    QuestionWriteSerializer,
    SubjectSerializer,
    TopicSerializer,
    VideoSerializer,
    track_ref,
)
from .uploads import validate_image, validate_material_file
from .views_read import filter_questions, get_track

ADMIN = [IsAdminRole]


def track_from_param(request):
    """`?track=appsc/group-1` → Track (or None)."""
    value = request.query_params.get("track")
    if not value or "/" not in str(value):
        return None
    c, g = str(value).split("/", 1)
    return Track.objects.filter(commission__slug=c, group__slug=g).first()


class AdminViewSet(viewsets.ModelViewSet):
    permission_classes = ADMIN


class SyllabusViewSet(AdminViewSet):
    """New nodes go to the end of their parent's list unless an order is given."""

    parent_field = None

    def perform_create(self, serializer):
        if "order" not in self.request.data:
            parent = serializer.validated_data[self.parent_field]
            last = serializer.Meta.model.objects.filter(**{self.parent_field: parent}).order_by("-order").first()
            serializer.save(order=(last.order + 1) if last else 1)
        else:
            serializer.save()


# ───────────────────────────── Dashboard ────────────────────────────


@api_view(["GET"])
@permission_classes(ADMIN)
def stats(request):
    User = get_user_model()
    per_track = []
    for t in Track.objects.select_related("commission", "group"):
        per_track.append({
            **track_ref(t),
            "papers": Paper.objects.filter(track=t).count(),
            "micro_themes": MicroTheme.objects.filter(track=t).count(),
            "notes": Note.objects.filter(micro_theme__track=t).count(),
            "prelims": Question.objects.filter(track=t, stage=Stage.PRELIMS).count(),
            "mains": Question.objects.filter(track=t, stage=Stage.MAINS).count(),
            "materials": StudyMaterial.objects.filter(track=t).count(),
        })
    return Response({
        "totals": {
            "micro_themes": MicroTheme.objects.count(),
            "published_micro_themes": MicroTheme.objects.filter(status=Status.PUBLISHED).count(),
            "notes": Note.objects.count(),
            "questions": Question.objects.count(),
            "draft_questions": Question.objects.filter(status=Status.DRAFT).count(),
            "materials": StudyMaterial.objects.count(),
            "students": User.objects.filter(profile__role=Role.STUDENT).count(),
            "admins": User.objects.filter(Q(profile__role=Role.ADMIN) | Q(is_superuser=True)).distinct().count(),
        },
        "tracks": per_track,
        "recent_questions": QuestionReadSerializer(
            Question.objects.select_related("micro_theme__topic__subject__paper").prefetch_related("tags")
            .order_by("-updated_at")[:6],
            many=True,
        ).data,
    })


# ───────────────────────────── Syllabus ─────────────────────────────


class PaperViewSet(SyllabusViewSet):
    serializer_class = PaperSerializer
    parent_field = "track"

    def get_queryset(self):
        qs = Paper.objects.all()
        if track := track_from_param(self.request):
            qs = qs.filter(track=track)
        return qs


class SubjectViewSet(SyllabusViewSet):
    serializer_class = SubjectSerializer
    parent_field = "paper"
    queryset = Subject.objects.all()


class TopicViewSet(SyllabusViewSet):
    serializer_class = TopicSerializer
    parent_field = "subject"
    queryset = Topic.objects.all()


class MicroThemeViewSet(SyllabusViewSet):
    serializer_class = MicroThemeSerializer
    parent_field = "topic"
    queryset = MicroTheme.objects.select_related("topic__subject__paper__track__commission", "topic__subject__paper__track__group")

    @action(detail=True, methods=["get"])
    def content(self, request, pk=None):
        mt = self.get_object()
        topic, subject, paper = mt.topic, mt.topic.subject, mt.topic.subject.paper
        notes = {n.kind: NoteSerializer(n).data for n in mt.notes.all()}
        return Response({
            "micro_theme": MicroThemeSerializer(mt).data,
            "track": track_ref(mt.track),
            "breadcrumb": {
                "paper": {"id": paper.id, "title": paper.title, "stage": paper.stage},
                "subject": {"id": subject.id, "title": subject.title},
                "topic": {"id": topic.id, "title": topic.title},
            },
            "notes": notes,
            "videos": VideoSerializer(mt.videos.all(), many=True).data,
            "glossary": GlossarySerializer(mt.glossary.all(), many=True).data,
        })

    @action(detail=True, methods=["put", "delete"], url_path=r"notes/(?P<kind>[a-z]+)")
    def note(self, request, pk=None, kind=None):
        mt = self.get_object()
        if kind not in NoteKind.values:
            return Response({"detail": "Unknown note kind."}, status=404)
        if request.method == "DELETE":
            Note.objects.filter(micro_theme=mt, kind=kind).delete()
            return Response(status=204)
        note = Note.objects.filter(micro_theme=mt, kind=kind).first()
        ser = NoteSerializer(note, data=request.data, partial=note is not None)
        ser.is_valid(raise_exception=True)
        ser.save(micro_theme=mt, kind=kind, updated_by=request.user)
        return Response(ser.data)


LEVELS = {"paper": Paper, "subject": Subject, "topic": Topic, "micro_theme": MicroTheme}


@api_view(["POST"])
@permission_classes(ADMIN)
def reorder(request):
    """Persist a drag-and-drop order: {level, ids:[...]} — ids must share one parent."""
    model = LEVELS.get(request.data.get("level"))
    ids = request.data.get("ids") or []
    if model is None or not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        return Response({"detail": "Expected {level, ids: [int]}"}, status=400)
    parent_field = {Paper: "track_id", Subject: "paper_id", Topic: "subject_id", MicroTheme: "topic_id"}[model]
    objs = list(model.objects.filter(pk__in=ids))
    if len(objs) != len(set(ids)) or len({getattr(o, parent_field) for o in objs}) > 1:
        return Response({"detail": "Items must exist and share the same parent."}, status=400)
    with transaction.atomic():
        for position, pk in enumerate(ids):
            model.objects.filter(pk=pk).update(order=position + 1)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes(ADMIN)
def set_status(request):
    """Publish/unpublish a syllabus node; `cascade: true` applies to every descendant too."""
    model = LEVELS.get(request.data.get("level"))
    new_status = request.data.get("status")
    if model is None or new_status not in Status.values:
        return Response({"detail": "Expected {level, id, status}"}, status=400)
    obj = get_object_or_404(model, pk=request.data.get("id"))
    with transaction.atomic():
        model.objects.filter(pk=obj.pk).update(status=new_status)
        if request.data.get("cascade"):
            if model is Paper:
                Subject.objects.filter(paper=obj).update(status=new_status)
                Topic.objects.filter(subject__paper=obj).update(status=new_status)
                MicroTheme.objects.filter(topic__subject__paper=obj).update(status=new_status)
            elif model is Subject:
                Topic.objects.filter(subject=obj).update(status=new_status)
                MicroTheme.objects.filter(topic__subject=obj).update(status=new_status)
            elif model is Topic:
                MicroTheme.objects.filter(topic=obj).update(status=new_status)
    return Response({"ok": True})


class VideoViewSet(AdminViewSet):
    serializer_class = VideoSerializer
    queryset = Video.objects.all()


class GlossaryViewSet(AdminViewSet):
    serializer_class = GlossarySerializer
    queryset = GlossaryTerm.objects.all()


# ─────────────────────────────── PYQs ───────────────────────────────


class QuestionViewSet(AdminViewSet):
    def get_serializer_class(self):
        return QuestionReadSerializer if self.action in ("list", "retrieve") else QuestionWriteSerializer

    def get_queryset(self):
        qs = Question.objects.select_related(
            "track__commission", "track__group", "micro_theme__topic__subject__paper"
        ).prefetch_related("tags")
        if self.action == "list":
            if track := track_from_param(self.request):
                qs = qs.filter(track=track)
            if (stage := self.request.query_params.get("stage")) in Stage.values:
                qs = qs.filter(stage=stage)
            qs = filter_questions(qs, self.request.query_params)
        return qs

    def retrieve(self, request, *args, **kwargs):
        q = self.get_object()
        data = QuestionReadSerializer(q).data
        data["track"] = track_ref(q.track)
        data["micro_theme_code"] = q.micro_theme.code if q.micro_theme else ""
        data.update({f: getattr(q, f) for f in ("option_a", "option_b", "option_c", "option_d")})
        return Response(data)

    def _write(self, request, instance=None, partial=False):
        ser = QuestionWriteSerializer(instance, data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        q = ser.save()
        return Response(QuestionReadSerializer(q).data, status=201 if instance is None else 200)

    def create(self, request, *args, **kwargs):
        return self._write(request)

    def update(self, request, *args, **kwargs):
        return self._write(request, self.get_object(), partial=kwargs.get("partial", False))

    @action(detail=False, methods=["post"], url_path="bulk-status")
    def bulk_status(self, request):
        ids = request.data.get("ids") or []
        new_status = request.data.get("status")
        if new_status not in Status.values or not isinstance(ids, list):
            return Response({"detail": "Expected {ids, status}"}, status=400)
        n = Question.objects.filter(pk__in=ids).update(status=new_status)
        return Response({"updated": n})


class ImportRequest(serializers.Serializer):
    track = serializers.CharField()
    stage = serializers.ChoiceField(choices=Stage.choices)
    default_status = serializers.ChoiceField(choices=Status.choices, default=Status.PUBLISHED)
    rows = serializers.ListField(child=serializers.DictField(), max_length=MAX_ROWS, allow_empty=False)
    commit = serializers.BooleanField(default=False)


@api_view(["POST"])
@permission_classes(ADMIN)
def import_questions(request):
    ser = ImportRequest(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data
    try:
        c, g = d["track"].split("/", 1)
    except ValueError:
        return Response({"track": ["Expected commission/group"]}, status=400)
    track = get_track(c, g)
    results = validate_rows(track, d["stage"], d["rows"], d["default_status"])
    payload = {
        "track": track_ref(track),
        "stage": d["stage"],
        "columns": columns_for(d["stage"]),
        "valid": sum(r["ok"] for r in results),
        "invalid": sum(not r["ok"] for r in results),
        "rows": [{k: v for k, v in r.items() if k != "data"} for r in results],
    }
    if d["commit"]:
        if payload["valid"] == 0:
            return Response({**payload, "detail": "No valid rows to import."}, status=400)
        counts = commit_rows(track, d["stage"], results)
        payload["result"] = {k: v for k, v in counts.items() if k != "ids"}
    return Response(payload)


@api_view(["GET"])
@permission_classes(ADMIN)
def import_reference(request):
    """Micro-theme codes for a track — used to build the downloadable template."""
    track = track_from_param(request)
    if track is None:
        return Response({"detail": "track required"}, status=400)
    stage = request.query_params.get("stage")
    mts = MicroTheme.objects.filter(track=track).select_related("topic__subject__paper")
    if stage in Stage.values:
        mts = mts.filter(Q(topic__subject__paper__stage=stage) | Q(is_dual_stage=True))
    return Response({
        "columns": columns_for(stage or Stage.PRELIMS),
        "micro_themes": [
            {"code": m.code, "title": m.title, "paper": m.topic.subject.paper.title,
             "subject": m.topic.subject.title, "topic": m.topic.title}
            for m in mts.order_by("topic__subject__paper__order", "topic__subject__order", "topic__order", "order")
        ],
    })


@api_view(["GET"])
@permission_classes(ADMIN)
def tags(request):
    return Response({"results": list(Tag.objects.annotate(n=Count("questions")).values("id", "name", "slug", "n"))})


# ──────────────────────────── Materials ─────────────────────────────


class MaterialViewSet(AdminViewSet):
    serializer_class = MaterialSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = StudyMaterial.objects.select_related(
            "track__commission", "track__group", "paper", "subject__paper", "topic__subject__paper",
            "micro_theme__topic__subject__paper",
        )
        if track := track_from_param(self.request):
            qs = qs.filter(track=track)
        if (cat := self.request.query_params.get("category")) in NoteKind.values:
            qs = qs.filter(category=cat)
        return qs

    def perform_create(self, serializer):
        upload = self.request.FILES.get("file")
        if upload is None:
            raise serializers.ValidationError({"file": "Choose a file to upload."})
        content_type = validate_material_file(upload)
        serializer.save(
            file=upload,
            original_filename=Path(upload.name).name[:255],
            content_type=content_type,
            size_bytes=upload.size,
            uploaded_by=self.request.user,
        )

    def perform_update(self, serializer):
        upload = self.request.FILES.get("file")
        if upload is not None:
            content_type = validate_material_file(upload)
            old = serializer.instance.file
            serializer.save(file=upload, original_filename=Path(upload.name).name[:255],
                            content_type=content_type, size_bytes=upload.size)
            if old:
                old.storage.delete(old.name)
        else:
            serializer.save()

    def perform_destroy(self, instance):
        f = instance.file
        instance.delete()
        if f:
            f.storage.delete(f.name)


# ───────────────────────────── Uploads ──────────────────────────────


@api_view(["POST"])
@permission_classes(ADMIN)
def upload_image(request):
    """Images embedded in notes / model answers. Stored under public media."""
    upload = request.FILES.get("file")
    if upload is None:
        return Response({"file": ["Choose an image."]}, status=400)
    ext = validate_image(upload)
    name = default_storage.save(f"public/images/{uuid.uuid4().hex}{ext}", upload)
    return Response({"url": f"/api/media/{name}"}, status=status.HTTP_201_CREATED)


# ─────────────────────────────── Users ──────────────────────────────


class UserViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = ADMIN

    def get_queryset(self):
        qs = get_user_model().objects.select_related("profile").order_by("-date_joined")
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(email__icontains=q) | Q(profile__display_name__icontains=q))
        return qs

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response([
            {**serialize_user(u), "date_joined": u.date_joined} for u in page
        ])

    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        role = request.data.get("role")
        if role not in Role.values:
            return Response({"role": ["admin or student"]}, status=400)
        if user == request.user and role != Role.ADMIN:
            return Response({"detail": "You can't remove your own admin role."}, status=400)
        Profile.objects.update_or_create(user=user, defaults={"role": role})
        return Response(serialize_user(user))
