"""
APPSC Group I, Syllabus-Wise Notes → Paper III → Ethics: bring back the syllabus chapters and sections that had been
deleted (0024 found nine sections missing, so their notes had nowhere to go), then place the ethics notes again —
the book's text replaces the same text in the 14 sections 0024 filled and fills the nine restored ones. Restored
sections get syllabus-link suggestions like every other (confirmed and rejected links are left alone).
"""

from pathlib import Path

from django.db import migrations

DATA = Path(__file__).resolve().parent.parent / "data"


def forwards(apps, schema_editor):
    from content import book_notes, notes_syllabus
    from content.syllabus_links import suggest_for_track

    get = lambda name: apps.get_model("content", name)  # noqa: E731
    bundle = book_notes.read(DATA / "appsc-g1-ethics-notes.json.gz")
    report = book_notes.tidy_syllabus_subject(
        get, track_ref=bundle["track"], kind="comprehensive", paper_code="P3", subject_index=3,
        syllabus=notes_syllabus.read(DATA / "appsc-g1-notes-syllabi.json.gz"), hide_subjects=r"ethic",
    )
    print(f"\n  APPSC Group I ethics chapters: {report}")
    print(f"  APPSC Group I ethics notes: {book_notes.load(bundle, get)}")
    if report.get("sections_restored"):
        Track = get("Track")
        track = Track.objects.get(commission__slug="appsc", group__slug="group-1")
        print(f"  Syllabus links: {suggest_for_track(track, get('SyllabusLink'), get('MicroTheme'))}")


class Migration(migrations.Migration):
    dependencies = [("content", "0024_appsc_g1_ethics_notes")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
