from django.db import migrations


def create_groups(apps, schema_editor):
    ExamGroup = apps.get_model("content", "ExamGroup")
    for order, (slug, name) in enumerate([("group-1", "Group 1"), ("group-2", "Group 2")], start=1):
        ExamGroup.objects.update_or_create(slug=slug, defaults={"name": name, "order": order})


class Migration(migrations.Migration):
    dependencies = [("content", "0001_initial")]
    operations = [migrations.RunPython(create_groups, migrations.RunPython.noop)]
