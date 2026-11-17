"""
Load UPSC Civil Services Prelims (General Studies Paper I) previous-year questions, 1979–2026:
5,930 questions with answer keys and explanations, from the content team's year-wise and
subject-wise Word editions (content/data/upsc-prelims-2026-11.json.gz, built with
`manage.py pyq_bundle build-upsc-docx`; content/pyq_docx.py describes the build).

Each question is filed under one of the UPSC exam's topics so the PYQ page filters by subject as
well as by year; the filing entries themselves are hidden. Skipped if UPSC isn't set up here.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "upsc-prelims-2026-11.json.gz"


def forwards(apps, schema_editor):
    from content import pyq_bundle

    print()
    pyq_bundle.load(pyq_bundle.read(BUNDLE), lambda name: apps.get_model("content", name))


class Migration(migrations.Migration):
    dependencies = [("content", "0009_question_none_of_the_options")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
