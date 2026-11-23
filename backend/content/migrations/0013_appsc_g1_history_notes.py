"""
APPSC Group I, Comprehensive Notes → Paper II → History and Culture of India: the Ancient, Medieval and Modern
Indian History books, placed section by section (content/data/appsc-g1-history-notes.json.gz, built with
`manage.py book_notes build`; content/book_notes.py holds the section-by-section placement).

Notes are created published. A section whose comprehensive note already has text is left alone, and the
migration is skipped if APPSC Group I isn't set up here.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "appsc-g1-history-notes.json.gz"


def forwards(apps, schema_editor):
    from content import book_notes

    counts = book_notes.load(book_notes.read(BUNDLE), lambda name: apps.get_model("content", name))
    print(f"\n  APPSC Group I history notes: {counts}")


class Migration(migrations.Migration):
    dependencies = [("content", "0012_appsc_g1_notes_syllabi")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
