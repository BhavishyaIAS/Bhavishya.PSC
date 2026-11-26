"""
APPSC Group I, Syllabus-Wise Notes → Paper III → Ethics in Public Service and Knowledge of Law.

1. The subject is put back in its syllabus's shape (content/data/appsc-g1-notes-syllabi.json.gz): its five
   chapters in order with their syllabus titles and numbers (3.1–3.5), each section under its chapter. Chapters
   the syllabus doesn't have — one a Word import added, say — and other "Ethics" subjects an import added to the
   paper are hidden (set to draft, with their sections and notes), never deleted; the log lists them.
2. "Ethics, Integrity and Aptitude — Complete Notes" is placed section by section
   (content/data/appsc-g1-ethics-notes.json.gz, built with `manage.py book_notes ethics`; APPSC_ETHICS in
   content/book_notes.py holds the placement). As asked, these notes replace whatever the sections held.
   Chapter 5 (Basic Knowledge of Laws) isn't in the book and stays as it is.

Skipped if APPSC Group I isn't set up here.
"""

from pathlib import Path

from django.db import migrations

DATA = Path(__file__).resolve().parent.parent / "data"


def forwards(apps, schema_editor):
    from content import book_notes, notes_syllabus

    get = lambda name: apps.get_model("content", name)  # noqa: E731
    bundle = book_notes.read(DATA / "appsc-g1-ethics-notes.json.gz")
    report = book_notes.tidy_syllabus_subject(
        get, track_ref=bundle["track"], kind="comprehensive", paper_code="P3", subject_index=3,
        syllabus=notes_syllabus.read(DATA / "appsc-g1-notes-syllabi.json.gz"), hide_subjects=r"ethic",
    )
    print(f"\n  APPSC Group I ethics chapters: {report}")
    print(f"  APPSC Group I ethics notes: {book_notes.load(bundle, get)}")


class Migration(migrations.Migration):
    dependencies = [("content", "0023_appsc_g1_ap_history_mains_notes")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
