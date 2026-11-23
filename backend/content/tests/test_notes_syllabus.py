from pathlib import Path

from django.apps import apps
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from content import notes_syllabus as ns
from content.models import MicroTheme, Note, Paper

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}
BUNDLE = Path(__file__).resolve().parent.parent / "data" / "appsc-g1-notes-syllabi.json.gz"
get = lambda name: apps.get_model("content", name)  # noqa: E731


class CleaningTests(TestCase):
    def test_titles_lose_list_punctuation_but_keep_abbreviations(self):
        self.assertEqual(ns.clean("the Kakatiyas and"), "The Kakatiyas")
        self.assertEqual(ns.clean("Fundamental Rights,"), "Fundamental Rights")
        self.assertEqual(ns.clean("Biodiversity—"), "Biodiversity")
        self.assertEqual(ns.clean("Andhradesa 1000 to 1565 A.D."), "Andhradesa 1000 to 1565 A.D.")
        self.assertEqual(ns.clean("H.C.F. and L.C.M."), "H.C.F. and L.C.M.")
        self.assertEqual(ns.clean("Child rights, etc."), "Child rights, etc.")

    def test_a_unit_bullet_becomes_a_chapter_and_its_items_sections(self):
        head, items = ns.split_unit("Agricultural Development: Role of agriculture; Contribution to GDP; Rainbow revolution.")
        self.assertEqual(head, "Agricultural Development")
        self.assertEqual(items, ["Role of agriculture", "Contribution to GDP", "Rainbow revolution"])
        head, items = ns.split_unit("Indian Space Programme — Past, Present and Future; ISRO — its activities")
        self.assertEqual((head, items[0]), ("Indian Space Programme", "Past, Present and Future"))
        _, items = ns.split_unit("Attitude: Content; role of Social influence and persuasion. Emotional intelligence — Concepts.")
        self.assertEqual(items[-2:], ["Role of Social influence and persuasion", "Emotional intelligence — Concepts"])
        _, items = ns.split_unit("Resource mobilization in Andhra Pradesh — fulfillment of the conditions of A.P. Bifurcation Act; physical resources")
        self.assertEqual(items[0], "Fulfillment of the conditions of A.P. Bifurcation Act")


class NotesSyllabusTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))
        cls.counts = ns.load(ns.read(BUNDLE), get)

    def login(self, email, password):
        c = APIClient()
        self.assertEqual(c.post("/api/auth/login/", {"email": email, "password": password}, format="json", **XHR).status_code, 200)
        return c

    def test_the_bundle_creates_three_syllabi_once(self):
        self.assertEqual(self.counts, {"comprehensive": 537, "prelims": 216, "mains": 466})
        self.assertEqual(ns.load(ns.read(BUNDLE), get), {})  # a second run leaves them alone
        self.assertEqual(Paper.objects.filter(notes_kind="mains").count(), 7)
        self.assertTrue(MicroTheme.objects.filter(code="NM-P4-1-01-01", title="Inconsistent growth rate").exists())

    def test_each_notes_module_gets_its_own_syllabus_and_the_general_one_stays(self):
        c = self.login("student@bhavishya.app", "Student@2026")
        general = c.get("/api/tracks/appsc/group-1/syllabus/").json()
        self.assertEqual(general["notes_kind"], "")
        self.assertEqual(general["notes_syllabi"], ["comprehensive", "prelims", "mains"])
        self.assertTrue(all(p["notes_kind"] == "" for p in general["papers"]))
        prelims = c.get("/api/tracks/appsc/group-1/syllabus/?notes=prelims").json()
        self.assertEqual(prelims["notes_kind"], "prelims")
        self.assertEqual([p["title"] for p in prelims["papers"]], ["Paper I — General Studies", "Paper II — General Aptitude"])
        first = prelims["papers"][0]["subjects"][0]
        self.assertEqual(first["title"], "History & Culture")
        self.assertEqual(first["topics"][0]["micro_themes"][0]["title"], "Indus Valley Civilization: Features, Sites, Society, Cultural History, Art and Religion")
        comp = c.get("/api/tracks/appsc/group-1/syllabus/?notes=comprehensive").json()
        self.assertEqual(comp["papers"][0]["title"], "English (Qualifying)")  # its own order, not prelims-first
        every = c.get("/api/tracks/appsc/group-1/syllabus/?notes=all").json()["papers"]
        kinds = [p["notes_kind"] for p in every]
        self.assertEqual(kinds, sorted(kinds, key=["", "comprehensive", "prelims", "mains"].index))  # general first, then each module
        self.assertEqual([p["title"] for p in every if p["notes_kind"] == "comprehensive"][-1], "Mental & Psychological Abilities (Prelims)")
        # a track without its own Notes syllabi falls back to the general one
        other = c.get("/api/tracks/tgpsc/group-1/syllabus/?notes=prelims")
        if other.status_code == 200:
            self.assertEqual(other.json()["notes_kind"], "")

    def test_coverage_counts_the_general_syllabus_only(self):
        c = self.login("admin@bhavishya.app", "Admin@2026")
        cov = c.get("/api/tracks/appsc/group-1/coverage/").json()
        general = MicroTheme.objects.filter(track__commission__slug="appsc", track__group__slug="group-1", topic__subject__paper__notes_kind="").count()
        self.assertEqual(cov["micro_themes"], general)

    def test_a_section_holds_its_own_modules_notes_only(self):
        c = self.login("admin@bhavishya.app", "Admin@2026")
        mt = MicroTheme.objects.get(code="NP-P1-1-01-01")
        body = {"body": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Harappa."}]}]}, "status": "published"}
        res = c.put(f"/api/manage/micro-themes/{mt.id}/notes/mains/", body, format="json", **XHR)
        self.assertEqual(res.status_code, 400)
        res = c.put(f"/api/manage/micro-themes/{mt.id}/notes/prelims/", body, format="json", **XHR)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(Note.objects.filter(micro_theme=mt, kind="prelims").exists())
        # and its page moves on within the Prelims Notes syllabus
        page = c.get(f"/api/tracks/appsc/group-1/micro-themes/{mt.code}/").json()
        self.assertEqual(page["breadcrumb"]["paper"]["notes_kind"], "prelims")
        self.assertTrue(page["next"]["code"].startswith("NP-"))
