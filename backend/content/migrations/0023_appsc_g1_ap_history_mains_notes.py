"""
APPSC Group I, Mains Notes → Paper II → History and Culture of Andhra Pradesh: the "Andhra Pradesh History —
Revision Notes" book, placed section by section (content/data/appsc-g1-ap-history-mains-notes.json.gz, built with
`manage.py book_notes ap-history`; APPSC_AP_HISTORY in content/book_notes.py holds the placement). Sections the book
doesn't cover stay empty.

Notes are created published. A section whose mains note already has text is left alone, and the migration is
skipped if APPSC Group I isn't set up here.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "appsc-g1-ap-history-mains-notes.json.gz"


def forwards(apps, schema_editor):
    from content import book_notes

    counts = book_notes.load(book_notes.read(BUNDLE), lambda name: apps.get_model("content", name))
    print(f"\n  APPSC Group I A.P. history mains notes: {counts}")


class Migration(migrations.Migration):
    dependencies = [("content", "0022_appsc_g1_economy_notes")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
