"""
APPSC Group I: the Notes modules get syllabi of their own, from the commission's documents as supplied:
Prelims Notes ← the Prelims syllabus, Mains Notes ← the Mains syllabus, Comprehensive Notes ← the
integrated Prelims + Mains syllabus (content/data/appsc-g1-notes-syllabi.json.gz, built with
`manage.py notes_syllabus build`; content/notes_syllabus.py describes the build).

The track's general syllabus is untouched: the PYQs stay filed under it and the Syllabus and Progress
pages keep showing it. Skipped if APPSC Group I isn't set up here, and for any Notes module that already
has a syllabus of its own.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "appsc-g1-notes-syllabi.json.gz"


def forwards(apps, schema_editor):
    from content import notes_syllabus

    counts = notes_syllabus.load(notes_syllabus.read(BUNDLE), lambda name: apps.get_model("content", name))
    print(f"\n  APPSC Group I Notes syllabi: {counts}")


class Migration(migrations.Migration):
    dependencies = [("content", "0011_paper_notes_kind")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
