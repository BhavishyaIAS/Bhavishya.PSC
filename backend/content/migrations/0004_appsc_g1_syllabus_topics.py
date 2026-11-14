"""
APPSC Group 1: set up the eleven syllabus topics and remove the sample content.

Notes are read topic by topic (Material / Notes → topic → Comprehensive /
Prelims / Mains), so the track gets exactly these subjects, in this order, in
its General Studies paper. The sample content loaded by `seed_demo` at setup
(sample subjects, their notes, sample PYQs and sample PDFs) is removed. Real
content is kept: the imported "Medieval Indian History" notes become the
"Medieval History" topic, and any other subject an admin created stays, after
the eleven.

Runs once; a track that doesn't exist yet (fresh database) is left alone.
"""

from django.db import migrations

TOPICS = [
    ("ANC", "Ancient History"),
    ("MED", "Medieval History"),
    ("MOD", "Modern History"),
    ("APH", "AP History"),
    ("GEO", "Geography"),
    ("APG", "AP Geography"),
    ("POL", "Polity"),
    ("ECO", "Economy"),
    ("APE", "AP Economy"),
    ("SNT", "Science and Technology"),
    ("ENV", "Environment"),
]
# What seed_demo created: (paper code, subject code, subject title).
SAMPLE_SUBJECTS = [
    ("PI", "HC", "History & Culture"),
    ("PI", "PO", "Indian Polity"),
    ("PI", "GE", "Geography"),
    ("PII", "MA", "Mental Ability"),
    ("PIII", "GV", "Governance & Constitutional Bodies"),
    ("PIV", "EC", "Economy of Andhra Pradesh"),
]
SAMPLE_PAPERS = ["PII", "PIII", "PIV"]  # removed once empty; PI becomes the home of the topics
SAMPLE_MICRO_THEMES = [
    "PRE-PI-HC-001", "PRE-PI-HC-002", "PRE-PI-HC-003", "PRE-PI-HC-004", "PRE-PI-HC-005", "PRE-PI-HC-006",
    "PRE-PI-PO-001", "PRE-PI-PO-002", "PRE-PI-PO-003", "PRE-PI-PO-004", "PRE-PI-GE-001", "PRE-PI-GE-002",
    "PRE-PII-MA-001", "PRE-PII-MA-002", "MNS-PIII-GV-001", "MNS-PIII-GV-002", "MNS-PIV-EC-001", "MNS-PIV-EC-002",
]
SAMPLE_FILES = ["fundamental-rights-revision.pdf", "history-culture-reference.pdf", "governance-answer-templates.pdf"]
PUBLISHED = "published"


def forwards(apps, schema_editor):
    Track = apps.get_model("content", "Track")
    Paper = apps.get_model("content", "Paper")
    Subject = apps.get_model("content", "Subject")
    Question = apps.get_model("content", "Question")
    StudyMaterial = apps.get_model("content", "StudyMaterial")

    track = Track.objects.filter(commission__slug="appsc", group__slug="group-1").first()
    if track is None:
        return

    # 1. Sample content out: PYQs (by the sample micro-themes they map to), PDFs, subjects, empty papers.
    Question.objects.filter(track=track, micro_theme__code__in=SAMPLE_MICRO_THEMES).delete()
    for m in StudyMaterial.objects.filter(track=track, original_filename__in=SAMPLE_FILES):
        try:
            m.file.delete(save=False)
        except Exception:  # a missing file must not block the migration
            pass
        m.delete()
    for pcode, scode, stitle in SAMPLE_SUBJECTS:
        Subject.objects.filter(paper__track=track, paper__code=pcode, code=scode, title=stitle).delete()
    for pcode in SAMPLE_PAPERS:
        Paper.objects.filter(track=track, code=pcode, subjects__isnull=True).delete()

    # 2. The paper that holds the topics.
    home = (
        Paper.objects.filter(track=track, code="PI").first()
        or Paper.objects.filter(track=track).order_by("order", "id").first()
        or Paper.objects.create(
            track=track, code="GS", title="General Studies", stage="prelims", order=1, status=PUBLISHED
        )
    )

    # 3. The imported Medieval notes become the Medieval History topic.
    medieval = (
        Subject.objects.filter(paper__track=track, title__iexact="Medieval History").first()
        or Subject.objects.filter(paper__track=track, title__iexact="Medieval Indian History").first()
    )
    if medieval is not None:
        medieval.paper, medieval.title, medieval.code = home, "Medieval History", "MED"
        medieval.save(update_fields=["paper", "title", "code"])

    # 4. The eleven topics, in order (reusing a subject of the same name if one exists).
    done = set()
    for order, (code, title) in enumerate(TOPICS, start=1):
        subject = (
            Subject.objects.filter(paper__track=track, title__iexact=title).first()
            or Subject.objects.filter(paper=home, code=code).first()
        )
        if subject is None:
            subject = Subject.objects.create(paper=home, code=code, title=title, order=order, status=PUBLISHED)
        else:
            subject.paper, subject.code, subject.title, subject.order = home, code, title, order
            subject.save(update_fields=["paper", "code", "title", "order"])
        done.add(subject.id)

    # 5. Anything else an admin created goes after them, in its current order.
    for i, s in enumerate(Subject.objects.filter(paper=home).exclude(id__in=done).order_by("order", "id"), start=1):
        s.order = 100 + i
        s.save(update_fields=["order"])


class Migration(migrations.Migration):
    dependencies = [("content", "0003_commission_status")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
