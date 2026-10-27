from django.utils.text import slugify
from rest_framework import serializers

from .models import (
    Commission,
    GlossaryTerm,
    MicroTheme,
    Note,
    Paper,
    Question,
    Stage,
    StudyMaterial,
    Subject,
    Tag,
    Topic,
    Track,
    Video,
)
from .richtext import RichTextError, validate_doc


class RichDocField(serializers.JSONField):
    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        try:
            return validate_doc(data)
        except RichTextError as exc:
            raise serializers.ValidationError(str(exc))


def track_ref(track: Track):
    return {
        "id": track.id,
        "commission": track.commission.slug,
        "commission_name": track.commission.short_name,
        "group": track.group.slug,
        "group_name": track.group.name,
        "label": str(track),
    }


# ───────────────────────────── Catalog ──────────────────────────────


class CommissionSerializer(serializers.ModelSerializer):
    tracks = serializers.SerializerMethodField()

    class Meta:
        model = Commission
        fields = ["id", "slug", "short_name", "name", "description", "status", "tracks"]

    def get_tracks(self, obj):
        counts = self.context.get("track_counts", {})
        return [
            {
                **track_ref(t),
                "tagline": t.tagline,
                "has_content": counts.get(t.id, 0) > 0,
            }
            for t in obj.tracks.all()
        ]


# ───────────────────────────── Syllabus ─────────────────────────────


class PaperSerializer(serializers.ModelSerializer):
    class Meta:
        model = Paper
        fields = ["id", "track", "stage", "code", "title", "description", "order", "status"]


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "paper", "code", "title", "order", "status"]


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ["id", "subject", "code", "title", "order", "status"]


class MicroThemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MicroTheme
        fields = [
            "id", "topic", "track", "code", "title", "order", "status",
            "priority", "estimated_minutes", "is_dual_stage",
        ]
        read_only_fields = ["track"]
        # The (track, code) unique constraint is checked in validate() because
        # `track` is derived from `topic`, not posted by the client.
        validators = []

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Code is required.")
        return value

    def validate(self, attrs):
        topic = attrs.get("topic") or (self.instance.topic if self.instance else None)
        code = attrs.get("code") or (self.instance.code if self.instance else "")
        if topic is not None:
            track_id = topic.subject.paper.track_id
            clash = MicroTheme.objects.filter(track_id=track_id, code=code)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError({"code": f"Code {code} already exists in this exam track."})
        return attrs


# ──────────────────────── Micro-theme content ───────────────────────


class NoteSerializer(serializers.ModelSerializer):
    body = RichDocField()

    class Meta:
        model = Note
        fields = ["id", "kind", "body", "status", "updated_at"]
        read_only_fields = ["kind"]


class VideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Video
        fields = ["id", "micro_theme", "title", "url", "order"]

    def validate_url(self, value):
        if not value.lower().startswith(("https://", "http://")):
            raise serializers.ValidationError("Use an http(s) link.")
        return value


class GlossarySerializer(serializers.ModelSerializer):
    class Meta:
        model = GlossaryTerm
        fields = ["id", "micro_theme", "term", "definition", "order"]


# ─────────────────────────────── PYQs ───────────────────────────────


def mt_ref(mt: MicroTheme | None):
    if mt is None:
        return None
    topic = mt.topic
    subject = topic.subject
    paper = subject.paper
    return {
        "id": mt.id,
        "code": mt.code,
        "title": mt.title,
        "topic": {"id": topic.id, "title": topic.title},
        "subject": {"id": subject.id, "title": subject.title},
        "paper": {"id": paper.id, "title": paper.title, "stage": paper.stage},
    }


class QuestionReadSerializer(serializers.ModelSerializer):
    tags = serializers.SlugRelatedField(slug_field="name", many=True, read_only=True)
    micro_theme = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id", "track", "stage", "year", "paper_label", "question_no", "text", "options",
            "correct_option", "explanation", "directive", "marks", "model_answer",
            "keywords", "tags", "micro_theme", "status",
        ]

    def get_micro_theme(self, obj):
        visible_ids = self.context.get("visible_mt_ids")
        if obj.micro_theme_id and (visible_ids is None or obj.micro_theme_id in visible_ids):
            return mt_ref(obj.micro_theme)
        return None

    def get_options(self, obj):
        if obj.stage != Stage.PRELIMS:
            return None
        return [
            {"key": "A", "text": obj.option_a},
            {"key": "B", "text": obj.option_b},
            {"key": "C", "text": obj.option_c},
            {"key": "D", "text": obj.option_d},
        ]


class QuestionWriteSerializer(serializers.ModelSerializer):
    model_answer = RichDocField(required=False)
    tags = serializers.ListField(child=serializers.CharField(max_length=60), required=False)
    micro_theme_code = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Question
        fields = [
            "id", "track", "stage", "year", "paper_label", "question_no", "micro_theme", "micro_theme_code",
            "text", "option_a", "option_b", "option_c", "option_d", "correct_option", "explanation",
            "directive", "marks", "model_answer", "keywords", "tags", "status",
        ]
        extra_kwargs = {"micro_theme": {"required": False, "allow_null": True}}

    def validate(self, attrs):
        track = attrs.get("track") or (self.instance.track if self.instance else None)
        stage = attrs.get("stage") or (self.instance.stage if self.instance else None)
        code = attrs.pop("micro_theme_code", None)
        if code:
            mt = MicroTheme.objects.filter(track=track, code=code.strip().upper()).first()
            if mt is None:
                raise serializers.ValidationError({"micro_theme_code": f"No micro-theme {code} in this track."})
            attrs["micro_theme"] = mt
        mt = attrs.get("micro_theme", self.instance.micro_theme if self.instance else None)
        if mt is not None and track is not None and mt.track_id != track.id:
            raise serializers.ValidationError({"micro_theme": "Micro-theme belongs to a different exam track."})
        if stage == Stage.PRELIMS:
            errors = {}
            for f in ("option_a", "option_b", "option_c", "option_d"):
                value = attrs.get(f, getattr(self.instance, f, "") if self.instance else "")
                if not (value or "").strip():
                    errors[f] = "Required for prelims questions."
            correct = attrs.get("correct_option", self.instance.correct_option if self.instance else "")
            if correct not in Question.Option.values:
                errors["correct_option"] = "Choose A, B, C or D."
            if errors:
                raise serializers.ValidationError(errors)
        # Natural-key uniqueness, with a friendlier message than the DB constraint.
        key = {
            f: attrs.get(f, getattr(self.instance, f, None) if self.instance else None)
            for f in ("track", "stage", "year", "paper_label", "question_no")
        }
        clash = Question.objects.filter(**key)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                {"question_no": "A question with this year, paper and number already exists in this track."}
            )
        return attrs

    def _save_tags(self, question, names):
        if names is None:
            return
        question.tags.set(get_or_create_tags(names))

    def create(self, validated):
        tags = validated.pop("tags", None)
        question = Question.objects.create(**validated)
        self._save_tags(question, tags)
        return question

    def update(self, instance, validated):
        tags = validated.pop("tags", None)
        for k, v in validated.items():
            setattr(instance, k, v)
        instance.save()
        self._save_tags(instance, tags)
        return instance


def get_or_create_tags(names):
    tags = []
    for raw in names:
        name = raw.strip()
        if not name:
            continue
        slug = slugify(name)[:70] or None
        if not slug:
            continue
        tag = Tag.objects.filter(slug=slug).first() or Tag.objects.create(name=name[:60], slug=slug)
        tags.append(tag)
    return tags


# ──────────────────────────── Materials ─────────────────────────────


class MaterialSerializer(serializers.ModelSerializer):
    track_info = serializers.SerializerMethodField()
    mapping = serializers.SerializerMethodField()

    class Meta:
        model = StudyMaterial
        fields = [
            "id", "track", "track_info", "category", "title", "description", "original_filename",
            "content_type", "size_bytes", "paper", "subject", "topic", "micro_theme", "mapping",
            "status", "created_at", "updated_at",
        ]
        read_only_fields = ["original_filename", "content_type", "size_bytes"]

    def get_track_info(self, obj):
        return track_ref(obj.track)

    def get_mapping(self, obj):
        """Breadcrumb of the most specific syllabus node this file is mapped to."""
        crumbs = []
        if obj.micro_theme_id:
            mt = obj.micro_theme
            crumbs = [mt.topic.subject.paper.title, mt.topic.subject.title, mt.topic.title, f"{mt.code} · {mt.title}"]
            return {"level": "micro_theme", "code": mt.code, "crumbs": crumbs}
        if obj.topic_id:
            t = obj.topic
            return {"level": "topic", "crumbs": [t.subject.paper.title, t.subject.title, t.title]}
        if obj.subject_id:
            s = obj.subject
            return {"level": "subject", "crumbs": [s.paper.title, s.title]}
        if obj.paper_id:
            return {"level": "paper", "crumbs": [obj.paper.title]}
        return None

    def validate(self, attrs):
        track = attrs.get("track") or (self.instance.track if self.instance else None)
        # Normalise: keep only the most specific mapping and make sure it's in this track.
        mt = attrs.get("micro_theme", getattr(self.instance, "micro_theme", None))
        topic = attrs.get("topic", getattr(self.instance, "topic", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        paper = attrs.get("paper", getattr(self.instance, "paper", None))
        node_track = None
        if mt:
            node_track = mt.track_id
        elif topic:
            node_track = topic.subject.paper.track_id
        elif subject:
            node_track = subject.paper.track_id
        elif paper:
            node_track = paper.track_id
        if node_track is not None and track is not None and node_track != track.id:
            raise serializers.ValidationError({"mapping": "Syllabus mapping belongs to a different exam track."})
        return attrs
