"""
The history notes loaded by 0013 had section numbers run into their headings ("1.1Who They Were") and a
lower-case word after "Part 2 ·". This tidies the headings of those notes in place (only the headings; any
edits made since are kept). The bundle is rebuilt with the same fix, so a fresh database gets it from 0013.
"""

from django.contrib.postgres.search import SearchVector
from django.db import migrations


def forwards(apps, schema_editor):
    from content.book_notes import tidy_doc
    from content.richtext import doc_to_text

    Note = apps.get_model("content", "Note")
    fixed = 0
    for note in Note.objects.filter(kind="comprehensive", micro_theme__code__startswith="NC-P2-1-"):
        if tidy_doc(note.body):
            note.body_text = doc_to_text(note.body)
            note.save(update_fields=["body", "body_text"])
            Note.objects.filter(pk=note.pk).update(search_vector=SearchVector("body_text", config="english"))
            fixed += 1
    print(f"\n  History notes with tidied headings: {fixed}")


class Migration(migrations.Migration):
    dependencies = [("content", "0013_appsc_g1_history_notes")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
