"""
UPSC takes its place beside APPSC: the landing page opens on the two of them.

Creates UPSC Civil Services with its General Studies topics (the same set as the
admin's "UPSC starter"), published and listed first. Topics only: no notes or
questions are invented. Nothing is touched when UPSC already exists (an admin's
own choices stand), or on an empty database (a fresh install starts clean).
"""

from django.db import migrations

TOPICS = [
    ("Ancient History", "history"), ("Medieval History", "history"), ("Modern History", "history"),
    ("Art and Culture", "history"), ("Indian Society", "general"), ("Geography", "geography"),
    ("Polity and Governance", "polity"), ("International Relations", "general"), ("Economy", "economy"),
    ("Environment and Ecology", "environment"), ("Science and Technology", "science"),
    ("Internal Security", "general"), ("Ethics, Integrity and Aptitude", "general"), ("Current Affairs", "general"),
]


def add_upsc(apps, schema_editor):
    Commission = apps.get_model("content", "Commission")
    ExamGroup = apps.get_model("content", "ExamGroup")
    Track = apps.get_model("content", "Track")
    Paper = apps.get_model("content", "Paper")
    Subject = apps.get_model("content", "Subject")
    if not Commission.objects.exists() or Commission.objects.filter(slug="upsc").exists():
        return
    # UPSC first; everything else keeps its order, one place further down
    for c in Commission.objects.all():
        c.order += 1
        c.save(update_fields=["order"])
    upsc = Commission.objects.create(
        slug="upsc", short_name="UPSC", name="Union Public Service Commission", theme="navy", order=0,
        description="Civil Services Examination: Prelims, Mains and Interview.", status="published",
    )
    group = ExamGroup.objects.filter(slug="civil-services").first()
    if group is None:
        last = max(ExamGroup.objects.values_list("order", flat=True), default=0)
        group = ExamGroup.objects.create(slug="civil-services", name="Civil Services", order=last + 1)
    track = Track.objects.create(
        commission=upsc, group=group, order=1,
        tagline="Complete preparation workspace for the UPSC Civil Services Examination.",
    )
    paper = Paper.objects.create(track=track, code="GS", title="General Studies", stage="prelims", order=1, status="published")
    for order, (title, look) in enumerate(TOPICS, start=1):
        Subject.objects.create(paper=paper, title=title, look=look, order=order, status="published")


class Migration(migrations.Migration):
    dependencies = [("content", "0005_exams_topics_site")]
    operations = [migrations.RunPython(add_upsc, migrations.RunPython.noop)]
