"""
Domain model.

    Commission ─┐
                ├─ Track (commission × group)  ← every piece of content hangs off a track
    ExamGroup ──┘
        Track → Paper (stage: prelims/mains) → Subject → Topic → MicroTheme
        MicroTheme → Note (×3 kinds) / Video / GlossaryTerm
        Track → Question (prelims MCQ or mains descriptive) → MicroTheme
        Track → StudyMaterial (file) → optional Paper/Subject/Topic/MicroTheme

Visibility rules live in the `visible_to(user)` queryset methods below — every
read endpoint goes through them, so a student can never load draft content.
"""

import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector, SearchVectorField
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from accounts.models import is_admin

SEARCH_CONFIG = "english"


class Status(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"


class Stage(models.TextChoices):
    PRELIMS = "prelims", "Prelims"
    MAINS = "mains", "Mains"


class Priority(models.TextChoices):
    CORE = "core", "Core"
    IMPORTANT = "important", "Important"
    SUPPORTING = "supporting", "Supporting"


class NoteKind(models.TextChoices):
    COMPREHENSIVE = "comprehensive", "Comprehensive Notes"
    PRELIMS = "prelims", "Prelims Notes"
    MAINS = "mains", "Mains Notes"


class MaterialCategory(models.TextChoices):
    COMPREHENSIVE = "comprehensive", "Comprehensive / Full Notes"
    PRELIMS = "prelims", "Prelims Notes"
    MAINS = "mains", "Mains Notes"


P = Status.PUBLISHED


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ─────────────────────────────── Exams ────────────────────────────────


class Commission(TimeStamped):
    slug = models.SlugField(unique=True)  # "appsc"
    short_name = models.CharField(max_length=20)  # "APPSC"
    name = models.CharField(max_length=160)  # "Andhra Pradesh Public Service Commission"
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "short_name"]

    def __str__(self):
        return self.short_name


class ExamGroup(models.Model):
    slug = models.SlugField(unique=True)  # "group-1"
    name = models.CharField(max_length=40)  # "Group 1"
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.name


class Track(models.Model):
    """One exam = commission × group. The unit of content segregation."""

    commission = models.ForeignKey(Commission, on_delete=models.CASCADE, related_name="tracks")
    group = models.ForeignKey(ExamGroup, on_delete=models.PROTECT, related_name="tracks")
    tagline = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["commission", "group"], name="uniq_track")]
        ordering = ["commission__order", "group__order"]

    def __str__(self):
        return f"{self.commission.short_name} {self.group.name}"

    @property
    def key(self):
        return f"{self.commission.slug}/{self.group.slug}"


# ───────────────────────────── Syllabus ───────────────────────────────


class PaperQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(status=P)


class SubjectQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(status=P, paper__status=P)


class TopicQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(status=P, subject__status=P, subject__paper__status=P)


_MT_VISIBLE_FIELDS = ("status", "topic__status", "topic__subject__status", "topic__subject__paper__status")


def mt_visible_q(prefix: str = "") -> Q:
    """MicroTheme visibility (itself + every ancestor published), optionally relative to a relation."""
    return Q(**{f"{prefix}{field}": P for field in _MT_VISIBLE_FIELDS})


MT_VISIBLE = mt_visible_q()


class MicroThemeQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(MT_VISIBLE)


class SyllabusNode(TimeStamped):
    code = models.CharField(max_length=40, blank=True)
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)

    class Meta:
        abstract = True
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.code} {self.title}".strip()


class Paper(SyllabusNode):
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="papers")
    stage = models.CharField(max_length=10, choices=Stage.choices, db_index=True)
    description = models.TextField(blank=True)

    objects = PaperQuerySet.as_manager()

    class Meta(SyllabusNode.Meta):
        indexes = [models.Index(fields=["track", "stage", "order"])]


class Subject(SyllabusNode):
    paper = models.ForeignKey(Paper, on_delete=models.CASCADE, related_name="subjects")

    objects = SubjectQuerySet.as_manager()


class Topic(SyllabusNode):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="topics")

    objects = TopicQuerySet.as_manager()


class MicroTheme(SyllabusNode):
    """The atomic unit of the syllabus. Code is unique within its track (e.g. PRE-PI-HC-005)."""

    topic = models.ForeignKey(Topic, on_delete=models.CASCADE, related_name="micro_themes")
    # Denormalised for fast track-scoped lookups and the (track, code) uniqueness rule.
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="micro_themes", editable=False)
    priority = models.CharField(max_length=12, choices=Priority.choices, blank=True)
    estimated_minutes = models.PositiveIntegerField(null=True, blank=True)
    is_dual_stage = models.BooleanField(default=False, help_text="Relevant to both Prelims and Mains")

    objects = MicroThemeQuerySet.as_manager()

    class Meta(SyllabusNode.Meta):
        constraints = [
            models.UniqueConstraint(fields=["track", "code"], name="uniq_micro_theme_code_per_track"),
        ]
        indexes = [models.Index(fields=["track", "status"])]

    def clean(self):
        if not self.code:
            raise ValidationError({"code": "Micro-themes need a code."})

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.track_id = Topic.objects.values_list("subject__paper__track_id", flat=True).get(pk=self.topic_id)
        super().save(*args, **kwargs)


# ───────────────────────── Micro-theme content ────────────────────────


class NoteQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(mt_visible_q("micro_theme__"), status=P)


class Note(TimeStamped):
    """A rich document (TipTap/ProseMirror JSON). One per micro-theme per kind."""

    micro_theme = models.ForeignKey(MicroTheme, on_delete=models.CASCADE, related_name="notes")
    kind = models.CharField(max_length=16, choices=NoteKind.choices)
    body = models.JSONField(default=dict)
    body_text = models.TextField(blank=True, editable=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    search_vector = SearchVectorField(null=True, editable=False)

    objects = NoteQuerySet.as_manager()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["micro_theme", "kind"], name="uniq_note_kind")]
        indexes = [GinIndex(fields=["search_vector"])]

    def save(self, *args, **kwargs):
        from .richtext import doc_to_text

        self.body_text = doc_to_text(self.body)
        super().save(*args, **kwargs)
        Note.objects.filter(pk=self.pk).update(
            search_vector=SearchVector("body_text", config=SEARCH_CONFIG)
        )


class Video(models.Model):
    micro_theme = models.ForeignKey(MicroTheme, on_delete=models.CASCADE, related_name="videos")
    title = models.CharField(max_length=200)
    url = models.URLField(max_length=500)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class GlossaryTerm(models.Model):
    micro_theme = models.ForeignKey(MicroTheme, on_delete=models.CASCADE, related_name="glossary")
    term = models.CharField(max_length=160)
    definition = models.TextField()
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "term"]
        indexes = [models.Index(fields=["term"])]


class StudyProgress(models.Model):
    """A student marking a micro-theme as studied (powers their personal progress)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="study_progress")
    micro_theme = models.ForeignKey(MicroTheme, on_delete=models.CASCADE, related_name="progress")
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "micro_theme"], name="uniq_progress")]


# ─────────────────────────────── PYQs ────────────────────────────────


class Tag(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=70, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


def question_search_vector():
    return (
        SearchVector("text", weight="A", config=SEARCH_CONFIG)
        + SearchVector("keywords", weight="B", config=SEARCH_CONFIG)
        + SearchVector("option_a", "option_b", "option_c", "option_d", weight="C", config=SEARCH_CONFIG)
        + SearchVector("explanation", "model_answer_text", weight="D", config=SEARCH_CONFIG)
    )


class QuestionQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(status=P)

    def update_search_vectors(self):
        return self.update(search_vector=question_search_vector())


class Question(TimeStamped):
    """
    A previous-year question. Prelims rows use the option/answer fields; Mains
    rows use directive/marks/model_answer.

    (track, stage, year, paper_label, question_no) is the natural key used by the
    bulk importer — re-importing a sheet updates rows instead of duplicating them.
    """

    class Option(models.TextChoices):
        A = "A", "A"
        B = "B", "B"
        C = "C", "C"
        D = "D", "D"

    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="questions")
    stage = models.CharField(max_length=10, choices=Stage.choices)
    year = models.PositiveSmallIntegerField()
    paper_label = models.CharField(max_length=80)
    question_no = models.PositiveIntegerField()
    micro_theme = models.ForeignKey(
        MicroTheme, null=True, blank=True, on_delete=models.SET_NULL, related_name="questions"
    )
    text = models.TextField()

    option_a = models.TextField(blank=True)
    option_b = models.TextField(blank=True)
    option_c = models.TextField(blank=True)
    option_d = models.TextField(blank=True)
    correct_option = models.CharField(max_length=1, choices=Option.choices, blank=True)
    explanation = models.TextField(blank=True)

    directive = models.CharField(max_length=40, blank=True)
    marks = models.PositiveSmallIntegerField(null=True, blank=True)
    model_answer = models.JSONField(default=dict, blank=True)
    model_answer_text = models.TextField(blank=True, editable=False)

    keywords = models.CharField(max_length=400, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="questions")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    search_vector = SearchVectorField(null=True, editable=False)

    objects = QuestionQuerySet.as_manager()

    class Meta:
        ordering = ["-year", "paper_label", "question_no"]
        constraints = [
            models.UniqueConstraint(
                fields=["track", "stage", "year", "paper_label", "question_no"], name="uniq_question_natural_key"
            ),
        ]
        indexes = [
            models.Index(fields=["track", "stage", "status", "year"]),
            models.Index(fields=["micro_theme"]),
            GinIndex(fields=["search_vector"]),
        ]

    def clean(self):
        errors = {}
        if self.stage == Stage.PRELIMS:
            for f in ("option_a", "option_b", "option_c", "option_d"):
                if not (getattr(self, f) or "").strip():
                    errors[f] = "Required for prelims questions."
            if self.correct_option not in self.Option.values:
                errors["correct_option"] = "Choose A, B, C or D."
        if self.micro_theme_id and self.micro_theme.track_id != self.track_id:
            errors["micro_theme"] = "Micro-theme belongs to a different exam track."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        from .richtext import doc_to_text

        self.model_answer_text = doc_to_text(self.model_answer)
        super().save(*args, **kwargs)
        Question.objects.filter(pk=self.pk).update_search_vectors()


# ──────────────────────────── Materials ──────────────────────────────


def material_upload_to(instance, filename):
    ext = Path(filename).suffix.lower()
    return f"private/materials/{instance.track_id}/{uuid.uuid4().hex}{ext}"


class MaterialQuerySet(models.QuerySet):
    def visible_to(self, user):
        return self if is_admin(user) else self.filter(status=P)


class StudyMaterial(TimeStamped):
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="materials")
    category = models.CharField(max_length=16, choices=MaterialCategory.choices, db_index=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to=material_upload_to, max_length=255)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    # Optional mapping to any one level of the syllabus (most specific wins).
    paper = models.ForeignKey(Paper, null=True, blank=True, on_delete=models.SET_NULL, related_name="materials")
    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name="materials")
    topic = models.ForeignKey(Topic, null=True, blank=True, on_delete=models.SET_NULL, related_name="materials")
    micro_theme = models.ForeignKey(
        MicroTheme, null=True, blank=True, on_delete=models.SET_NULL, related_name="materials"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    objects = MaterialQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["track", "category", "status"])]

    def __str__(self):
        return self.title
