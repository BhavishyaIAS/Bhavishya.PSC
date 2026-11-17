"""
Previous-year questions from the content team's spreadsheets.

    python manage.py pyq_bundle build prelims.csv mains.csv content/data/pyqs-<date>.json.gz
    python manage.py pyq_bundle load content/data/pyqs-<date>.json.gz [--dry-run]

`build` cleans and structures the spreadsheets (see content/pyq_bundle.py) and writes a bundle;
commit it with a migration that loads it, and every deploy brings it in once. `load` loads a bundle
into this database directly (idempotent).
"""

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from content import pyq_bundle


class Command(BaseCommand):
    help = "Build a PYQ bundle from spreadsheets, or load one into the database."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        b = sub.add_parser("build")
        b.add_argument("prelims_csv")
        b.add_argument("mains_csv")
        b.add_argument("out")
        lo = sub.add_parser("load")
        lo.add_argument("bundle")
        lo.add_argument("--dry-run", action="store_true", help="Show what would happen, change nothing.")

    def handle(self, *args, **opts):
        if opts["action"] == "build":
            bundle, report = pyq_bundle.build(opts["prelims_csv"], opts["mains_csv"])
            pyq_bundle.write(bundle, opts["out"])
            for slug, t in bundle["tracks"].items():
                stages = {}
                for q in t["questions"]:
                    stages[q["stage"]] = stages.get(q["stage"], 0) + 1
                self.stdout.write(f"{slug}: {stages} · {len(t['micro_themes'])} micro-themes")
            for key, items in report.items():
                self.stdout.write(f"{key}: {len(items)}")
                for item in items[:50] if key != "answer_only" else []:
                    self.stdout.write(f"    {item}")
            self.stdout.write(self.style.SUCCESS(f"Wrote {opts['out']}"))
            return

        bundle = pyq_bundle.read(opts["bundle"])
        try:
            with transaction.atomic():
                pyq_bundle.load(bundle, lambda name: apps.get_model("content", name), log=self.stdout.write)
                if opts["dry_run"]:
                    raise CommandError("Dry run: nothing was saved.")
        except CommandError as e:
            self.stdout.write(self.style.WARNING(str(e)))
            return
        self.stdout.write(self.style.SUCCESS("Loaded."))
