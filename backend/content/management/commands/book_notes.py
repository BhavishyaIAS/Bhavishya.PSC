"""
Whole books placed section by section into a Notes module (content/book_notes.py).

    manage.py book_notes build ANCIENT.docx MEDIEVAL.docx MODERN.docx [--out content/data/appsc-g1-history-notes.json.gz]
    manage.py book_notes economy ECONOMY.docx [--out content/data/appsc-g1-economy-notes.json.gz]
    manage.py book_notes ap-history AP_HISTORY.docx [--out content/data/appsc-g1-ap-history-mains-notes.json.gz]
    manage.py book_notes load [--bundle …] [--dry-run]

`build` cuts the three history books into APPSC Group I's Comprehensive Notes sections (and fails if any part
of a book is left out or placed twice); `economy` does the same for the Indian Economy topic notes (Paper IV), `ap-history` for the Andhra Pradesh
history revision notes (Mains Notes, Paper II);
`load` creates the notes, published, leaving alone any section whose
note already has text (migration 0013 does this on deploy).
"""

import gzip
import json

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import transaction

from content import book_notes
from content.richtext import doc_to_text

DEFAULT = "content/data/appsc-g1-history-notes.json.gz"


class Command(BaseCommand):
    help = "Build or load notes cut from whole books."

    def add_arguments(self, parser):
        sub = parser.add_subparsers(dest="action", required=True)
        b = sub.add_parser("build")
        b.add_argument("ancient")
        b.add_argument("medieval")
        b.add_argument("modern")
        b.add_argument("--out", default=DEFAULT)
        e = sub.add_parser("economy")
        e.add_argument("economy")
        e.add_argument("--out", default="content/data/appsc-g1-economy-notes.json.gz")
        a = sub.add_parser("ap-history")
        a.add_argument("ap_history")
        a.add_argument("--out", default="content/data/appsc-g1-ap-history-mains-notes.json.gz")
        ld = sub.add_parser("load")
        ld.add_argument("--bundle", default=DEFAULT)
        ld.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        if opts["action"] in ("build", "economy", "ap-history"):
            if opts["action"] == "build":
                bundle = book_notes.build_appsc_history(opts["ancient"], opts["medieval"], opts["modern"])
            elif opts["action"] == "economy":
                bundle = book_notes.build_appsc_economy(opts["economy"])
            else:
                bundle = book_notes.build_appsc_ap_history(opts["ap_history"])
            for code, doc in bundle["notes"].items():
                self.stdout.write(f"{code}  {len(doc_to_text(doc).split()):6d} words")
            with gzip.open(opts["out"], "wt", encoding="utf-8") as f:
                json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
            self.stdout.write(self.style.SUCCESS(f"Wrote {len(bundle['notes'])} notes to {opts['out']}"))
            return
        bundle = book_notes.read(opts["bundle"])
        with transaction.atomic():
            counts = book_notes.load(bundle, lambda name: apps.get_model("content", name))
            self.stdout.write(f"Notes: {counts}")
            if opts["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write("Dry run: rolled back.")
