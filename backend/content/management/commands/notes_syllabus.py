"""
The Notes modules' own syllabi (content/notes_syllabus.py).

    manage.py notes_syllabus build PRELIMS.docx MAINS.docx COMPREHENSIVE.docx [--out content/data/appsc-g1-notes-syllabi.json.gz]
    manage.py notes_syllabus load [--bundle …] [--dry-run]

`build` turns the commission's three Word syllabi into a bundle (and checks the comprehensive one against the
document's own topic counts); `load` creates the trees for the bundle's track (migration 0012 does this on deploy).
"""

import gzip
import json

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction

from content import notes_syllabus

DEFAULT = "content/data/appsc-g1-notes-syllabi.json.gz"


class Command(BaseCommand):
    help = "Build or load the Notes modules' own syllabi."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        b = sub.add_parser("build")
        b.add_argument("prelims")
        b.add_argument("mains")
        b.add_argument("comprehensive")
        b.add_argument("--out", default=DEFAULT)
        ld = sub.add_parser("load")
        ld.add_argument("--bundle", default=DEFAULT)
        ld.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        if opts["action"] == "build":
            bundle = notes_syllabus.build_appsc_g1(opts["prelims"], opts["mains"], opts["comprehensive"])
            with gzip.open(opts["out"], "wt", encoding="utf-8") as f:
                json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
            for kind, papers in bundle["syllabi"].items():
                n = sum(len(t["sections"]) for p in papers for s in p["subjects"] for t in s["topics"])
                self.stdout.write(f"{kind}: {len(papers)} papers, {n} sections")
            self.stdout.write(self.style.SUCCESS(f"Wrote {opts['out']}"))
            return
        bundle = notes_syllabus.read(opts["bundle"])
        with transaction.atomic():
            counts = notes_syllabus.load(bundle, lambda name: apps.get_model("content", name))
            self.stdout.write(f"Created: {counts or 'nothing (already there)'}")
            if opts["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("Dry run: rolled back.")
