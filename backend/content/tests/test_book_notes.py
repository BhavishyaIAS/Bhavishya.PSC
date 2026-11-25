from pathlib import Path

from django.apps import apps
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from content import book_notes as bn
from content import notes_syllabus as ns
from content.models import MicroTheme, Note

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}
DATA = Path(__file__).resolve().parent.parent / "data"
get = lambda name: apps.get_model("content", name)  # noqa: E731


def para(text):
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


class BuildTests(TestCase):
    def books(self):
        ch = bn.Chapter(1, "The Guptas")
        ch.head = [para("Intro.")]
        for p in (1, 2, 3):
            ch.parts[p] = [para(f"Part {p}.")]
            ch.order.append(p)
        return {"anc": {1: ch}}

    def test_every_part_is_placed_exactly_once(self):
        notes = bn.build(self.books(), {"A": [("anc", 1, [1, 2])], "B": [("anc", 1, [3])]})
        self.assertEqual([b["type"] for b in notes["A"]["content"]], ["heading", "paragraph", "paragraph", "paragraph"])
        self.assertEqual(notes["B"]["content"][0]["content"][0]["text"], "The Guptas")  # each piece opens with its chapter
        self.assertEqual(len(notes["B"]["content"]), 2)  # …but the chapter's introduction comes once
        with self.assertRaisesRegex(ValueError, "not placed"):
            bn.build(self.books(), {"A": [("anc", 1, [1, 2])]})
        with self.assertRaisesRegex(ValueError, "placed twice"):
            bn.build(self.books(), {"A": [("anc", 1, None)], "B": [("anc", 1, [3])]})
        with self.assertRaisesRegex(ValueError, "no part"):
            bn.build(self.books(), {"A": [("anc", 1, [1, 2, 3, 4])]})

    def test_all_caps_headings_become_title_case(self):
        self.assertEqual(bn.nice("THE DELHI SULTANATE (1206–1526)"), "The Delhi Sultanate (1206–1526)")
        self.assertEqual(bn.nice("Module 6 · The Rise of Magadha"), "Module 6 · The Rise of Magadha")

    def test_headings_keep_their_numbers_apart_and_start_with_a_capital(self):
        self.assertEqual(bn.tidy_heading("6.1Who They Were"), "6.1 Who They Were")
        self.assertEqual(bn.tidy_heading("Part 2 · the Timeline"), "Part 2 · The Timeline")
        self.assertEqual(bn.tidy_heading("3. the Toolkit"), "3. The Toolkit")
        self.assertEqual(bn.tidy_heading("1857 and after"), "1857 and after")
        doc = {"type": "doc", "content": [{"type": "heading", "attrs": {"level": 4}, "content": [{"type": "text", "text": "2.1Why"}]}]}
        self.assertTrue(bn.tidy_doc(doc))
        self.assertFalse(bn.tidy_doc(doc))  # once tidy, left alone


class HistoryNotesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))
        ns.load(ns.read(DATA / "appsc-g1-notes-syllabi.json.gz"), get)
        cls.bundle = bn.read(DATA / "appsc-g1-history-notes.json.gz")
        cls.counts = bn.load(cls.bundle, get)

    def test_the_books_fill_the_history_sections_once(self):
        self.assertEqual(self.counts, {"created": 64, "filled": 0, "kept": 0, "missing": 0})
        self.assertTrue(all(code.startswith("NC-P2-1-") for code in self.bundle["notes"]))
        self.assertEqual(bn.load(self.bundle, get), {"created": 0, "filled": 0, "kept": 64, "missing": 0})
        note = Note.objects.get(micro_theme__code="NC-P2-1-01-02", kind="comprehensive")
        self.assertEqual(note.status, "published")
        self.assertIn("Harappa", note.body_text)
        self.assertTrue(Note.objects.filter(pk=note.pk, search_vector__isnull=False).exists())
        # the sections the books don't cover stay empty
        self.assertFalse(Note.objects.filter(micro_theme__code__in=["NC-P2-1-02-07", "NC-P2-1-05-14"]).exists())

    def test_a_long_chapter_can_be_read_section_by_section(self):
        c = APIClient()
        self.assertEqual(c.post("/api/auth/login/", {"email": "student@bhavishya.app", "password": "Student@2026"}, format="json", **XHR).status_code, 200)
        topic = MicroTheme.objects.get(code="NC-P2-1-01-01").topic_id
        url = f"/api/tracks/appsc/group-1/notes/?kind=comprehensive&topic={topic}"
        outline = c.get(url + "&fields=outline").json()["results"]
        self.assertEqual(len(outline), 17)
        self.assertNotIn("body", outline[0]["note"])
        self.assertGreater(sum(r["note"]["size"] for r in outline), 90_000)
        one = c.get(url + f"&micro_theme={outline[3]['micro_theme']['id']}").json()["results"]
        self.assertEqual([r["micro_theme"]["code"] for r in one], ["NC-P2-1-01-04"])
        self.assertEqual(one[0]["note"]["body"]["type"], "doc")


class EconomyNotesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))
        ns.load(ns.read(DATA / "appsc-g1-notes-syllabi.json.gz"), get)
        cls.bundle = bn.read(DATA / "appsc-g1-economy-notes.json.gz")
        cls.counts = bn.load(cls.bundle, get)

    def test_the_book_fills_the_economy_sections_it_covers(self):
        self.assertEqual(self.counts, {"created": 72, "filled": 0, "kept": 0, "missing": 0})
        self.assertTrue(all(code.startswith("NC-P4-1-") for code in self.bundle["notes"]))
        note = Note.objects.get(micro_theme__code="NC-P4-1-02-04", kind="comprehensive")
        self.assertEqual(note.status, "published")
        self.assertIn("Balance of Payments", note.body_text)
        # text diagrams are kept line for line, in a fixed-width block
        self.assertTrue(any(b["type"] == "codeBlock" and "CURRENT ACCOUNT" in b["content"][0]["text"] for b in note.body["content"]))
        # a split section: land goes to land reforms, water to irrigation
        self.assertIn("operational holding", Note.objects.get(micro_theme__code="NC-P4-1-08-06").body_text)
        self.assertIn("4.2 Water and irrigation", Note.objects.get(micro_theme__code="NC-P4-1-08-05").body_text)
        # the sections the book doesn't cover stay empty, to be written later
        empty = ["NC-P4-1-01-01", "NC-P4-1-02-05", "NC-P4-1-03-09", "NC-P4-1-03-11", "NC-P4-1-04-01", "NC-P4-1-05-07",
                 "NC-P4-1-07-15", "NC-P4-1-10-13", "NC-P4-1-13-01"]
        self.assertFalse(Note.objects.filter(micro_theme__code__in=empty).exists())
        # loading again changes nothing, and a note someone has written is never replaced
        self.assertEqual(bn.load(self.bundle, get), {"created": 0, "filled": 0, "kept": 72, "missing": 0})
