"""
Hide APPSC Group 2 from students, found by its name this time: 0027 looked for the address appsc/group-2 and found
nothing on the live site, where the exam is stored under another address. Any APPSC exam named "Group 2" / "Group II"
(the commission found by its address or short name) is set to draft; the log lists what was found, and every APPSC
exam, so nothing is left to guess. Its syllabus, notes and PYQs are kept; Manage → Exams → Show brings it back.
"""

import re

from django.db import migrations
from django.db.models import Q

GROUP_2 = re.compile(r"^\s*group[\s-]*(2|ii)\b", re.I)


def hide(apps, schema_editor):
    Track = apps.get_model("content", "Track")
    appsc = Track.objects.select_related("commission", "group").filter(
        Q(commission__slug__iexact="appsc") | Q(commission__short_name__iexact="APPSC")
    )
    print("\n  APPSC exams: " + ", ".join(f"{t.commission.slug}/{t.group.slug} ({t.group.name}, {t.status})" for t in appsc))
    hidden = [t for t in appsc if GROUP_2.match(t.group.name) or GROUP_2.match(t.group.slug.replace("-", " "))]
    for t in hidden:
        t.status = "draft"
        t.save(update_fields=["status"])
    print(f"  APPSC Group 2 hidden from students: {[f'{t.commission.slug}/{t.group.slug}' for t in hidden]}")


class Migration(migrations.Migration):
    dependencies = [("content", "0027_track_status")]
    operations = [migrations.RunPython(hide, migrations.RunPython.noop)]
