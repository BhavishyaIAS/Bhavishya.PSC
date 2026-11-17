"""
Publish the chapters and sections that 0007 filed the previous-year questions under (they were
loaded hidden), and the four topics it added hidden: Ethics, Essay, Mental Ability, Current Affairs.
Only what 0007 created is touched; see pyq_bundle.publish.
"""

from pathlib import Path

from django.db import migrations

BUNDLE = Path(__file__).resolve().parent.parent / "data" / "pyqs-2026-11.json.gz"


def forwards(apps, schema_editor):
    from content import pyq_bundle

    print()
    pyq_bundle.publish(pyq_bundle.read(BUNDLE), lambda name: apps.get_model("content", name))


class Migration(migrations.Migration):
    dependencies = [("content", "0007_pyqs_appsc_tgpsc_2026_11")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
