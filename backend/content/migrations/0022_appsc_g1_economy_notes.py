"""
APPSC Group I, Comprehensive Notes → Paper IV → Economy & Development: the "Indian Economy — Topic Notes" book,
placed section by section (content/data/appsc-g1-economy-notes.json.gz, built with `manage.py book_notes economy`;
APPSC_ECONOMY in content/book_notes.py holds the placement). Sections the book doesn't cover stay empty.

Notes are created published. A section whose comprehensive note already has text is left alone, and the
migration is skipped if APPSC Group I isn't set up here.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "appsc-g1-economy-notes.json.gz"


def forwards(apps, schema_editor):
    from content import book_notes

    counts = book_notes.load(book_notes.read(BUNDLE), lambda name: apps.get_model("content", name))
    print(f"\n  APPSC Group I economy notes: {counts}")


class Migration(migrations.Migration):
    dependencies = [("content", "0021_syllabus_wise_notes")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
