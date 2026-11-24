from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from content import notes_syllabus as ns
from content.models import MicroTheme, Question, StudyProgress, SyllabusLink, Track
from content.syllabus_links import STRONG, stems, suggest_for_track
from content.tests.test_notes_syllabus import BUNDLE, get

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


class StemTests(TestCase):
    def test_names_meet_across_their_forms(self):
        self.assertEqual(stems("The Kushans (P & M)"), ["kushan"])
        self.assertEqual(stems("Foreign invasions & the Kushanas")[-1], "kushan")
        self.assertEqual(stems("Rise of Magadha")[-1], stems("Magadhan imperialism")[0])


class LinkTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))
        ns.load(ns.read(BUNDLE), get)
        cls.track = Track.objects.get(commission__slug="appsc", group__slug="group-1")
        cls.counts = suggest_for_track(cls.track, SyllabusLink, MicroTheme)

    def admin(self):
        c = APIClient()
        self.assertEqual(c.post("/api/auth/login/", {"email": "admin@bhavishya.app", "password": "Admin@2026"}, format="json", **XHR).status_code, 200)
        return c

    def test_suggestions_link_notes_topics_to_general_sections(self):
        self.assertGreater(self.counts["suggested"], 0)
        link = SyllabusLink.objects.filter(status="suggested").select_related("notes_mt__topic__subject__paper", "general_mt__topic__subject__paper").first()
        self.assertNotEqual(link.notes_mt.topic.subject.paper.notes_kind, "")
        self.assertEqual(link.general_mt.topic.subject.paper.notes_kind, "")

    def test_reviewed_links_survive_a_new_suggestion(self):
        a, b = SyllabusLink.objects.all()[:2]
        c = self.admin()
        c.post("/api/manage/syllabus-links/review/", {"ids": [a.id], "status": "confirmed"}, format="json", **XHR)
        c.post("/api/manage/syllabus-links/review/", {"ids": [b.id], "status": "rejected"}, format="json", **XHR)
        c.post("/api/manage/syllabus-links/suggest/", {"track": "appsc/group-1"}, format="json", **XHR)
        self.assertEqual(SyllabusLink.objects.get(notes_mt=a.notes_mt, general_mt=a.general_mt).status, "confirmed")
        self.assertEqual(SyllabusLink.objects.get(notes_mt=b.notes_mt, general_mt=b.general_mt).status, "rejected")

    def test_a_linked_notes_topic_shows_its_sections_pyqs_and_counts_for_progress(self):
        q = Question.objects.filter(track=self.track, status="published").exclude(micro_theme=None).exclude(micro_theme__topic__subject__paper__notes_kind__gt="").first()
        notes = MicroTheme.objects.filter(track=self.track).exclude(topic__subject__paper__notes_kind="").exclude(questions__isnull=False).first()
        c = self.admin()
        self.assertEqual(c.post("/api/manage/syllabus-links/", {"track": "appsc/group-1", "notes_code": notes.code, "general_code": q.micro_theme.code}, format="json", **XHR).status_code, 200)
        s = APIClient()
        s.post("/api/auth/login/", {"email": "student@bhavishya.app", "password": "Student@2026"}, format="json", **XHR)
        r = s.get(f"/api/tracks/appsc/group-1/micro-themes/{notes.code}/related-questions/").json()
        self.assertIn(r["how"], ("linked", "linked-suggested"))
        self.assertIn(q.id, [x["id"] for x in r["results"]])
        before = s.get("/api/tracks/appsc/group-1/coverage/").json()["studied_micro_themes"]
        s.put(f"/api/tracks/appsc/group-1/micro-themes/{notes.code}/status/", {"status": "completed"}, format="json", **XHR)
        self.assertEqual(StudyProgress.objects.filter(micro_theme=notes).count(), 1)
        self.assertEqual(s.get("/api/tracks/appsc/group-1/coverage/").json()["studied_micro_themes"], before + 1)

    def test_only_admins_review(self):
        s = APIClient()
        s.post("/api/auth/login/", {"email": "student@bhavishya.app", "password": "Student@2026"}, format="json", **XHR)
        self.assertEqual(s.get("/api/manage/syllabus-links/?track=appsc/group-1").status_code, 403)
        self.assertTrue(0 < STRONG < 1)
