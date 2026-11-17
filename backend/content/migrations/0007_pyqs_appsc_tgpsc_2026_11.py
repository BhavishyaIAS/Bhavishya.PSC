"""
Load the APPSC and TGPSC Group 1 previous-year questions (November 2026 spreadsheets):
APPSC Prelims 2016–2024 and Mains 2008–2025, TGPSC Mains 2016 and 2024, with model answers.

The bundle (content/data/pyqs-2026-11.json.gz) was built with `manage.py pyq_bundle build`;
content/pyq_bundle.py describes exactly what was cleaned and how questions are filed. Exams that
don't exist here (a fresh install) are skipped. Re-running is harmless.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "pyqs-2026-11.json.gz"


def forwards(apps, schema_editor):
    from content import pyq_bundle

    print()
    pyq_bundle.load(pyq_bundle.read(BUNDLE), lambda name: apps.get_model("content", name))


class Migration(migrations.Migration):
    dependencies = [("content", "0006_upsc_examination")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
