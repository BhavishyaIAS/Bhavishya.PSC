import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content.models import Commission, ExamGroup, Paper, SiteSettings, Subject, Track

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class SiteAdminTests(TestCase):
    """Admins shape the platform: exams, topics catalogue, presentation, and the one-exam switch."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def login(self, email, password):
        c = APIClient()
        self.assertEqual(c.post("/api/auth/login/", {"email": email, "password": password}, format="json", **XHR).status_code, 200)
        return c

    def admin(self):
        return self.login("admin@bhavishya.app", "Admin@2026")

    def student(self):
        return self.login("student@bhavishya.app", "Student@2026")

    def visible(self, client):
        return [c["slug"] for c in client.get("/api/commissions/").json()["results"]]

    def test_students_cannot_reach_any_of_it(self):
        s = self.student()
        for method, url in [("get", "/api/manage/exams/"), ("post", "/api/manage/exams/"), ("patch", "/api/manage/site/"),
                            ("post", "/api/manage/site/dedicate/"), ("post", "/api/manage/site/starter/")]:
            self.assertEqual(getattr(s, method)(url, {}, format="json", **XHR).status_code, 403, url)

    def test_add_edit_and_delete_a_commission(self):
        a = self.admin()
        res = a.post("/api/manage/exams/", {"short_name": "KPSC", "name": "Karnataka Public Service Commission", "theme": "green",
                                            "exams": ["Group A", "Group B"]}, format="json", **XHR)
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual((body["slug"], body["status"], [e["group_name"] for e in body["exams"]]), ("kpsc", "draft", ["Group A", "Group B"]))
        # hidden until shown; then students get it, with its exams
        self.assertNotIn("kpsc", self.visible(self.student()))
        self.assertEqual(a.patch(f"/api/manage/exams/{body['id']}/", {"status": "published", "name": "Karnataka PSC"}, format="json", **XHR).status_code, 200)
        self.assertIn("kpsc", self.visible(self.student()))
        self.assertEqual(self.student().get("/api/tracks/kpsc/group-a/").status_code, 200)
        # same short name twice is refused
        self.assertEqual(a.post("/api/manage/exams/", {"short_name": "kpsc", "name": "Again"}, format="json", **XHR).status_code, 400)
        # deleting needs the name typed
        self.assertEqual(a.delete(f"/api/manage/exams/{body['id']}/", {"confirm": "nope"}, format="json", **XHR).status_code, 400)
        self.assertEqual(a.delete(f"/api/manage/exams/{body['id']}/", {"confirm": "KPSC"}, format="json", **XHR).status_code, 204)
        self.assertFalse(Commission.objects.filter(slug="kpsc").exists())
        self.assertFalse(ExamGroup.objects.filter(slug__in=["group-a", "group-b"]).exists())  # unused groups are tidied away

    def test_add_rename_move_and_delete_an_exam(self):
        a = self.admin()
        appsc = Commission.objects.get(slug="appsc")
        res = a.post(f"/api/manage/exams/{appsc.id}/exams/", {"name": "Group 3", "tagline": "Panchayat Secretary"}, format="json", **XHR)
        self.assertEqual(res.status_code, 201, res.content)
        track_id = res.json()["id"]
        self.assertEqual(self.student().get("/api/tracks/appsc/group-3/").status_code, 200)
        self.assertEqual(a.post(f"/api/manage/exams/{appsc.id}/exams/", {"name": "group 3"}, format="json", **XHR).status_code, 400)
        # rename: its own address changes; Group 1 (shared with TGPSC) can't be taken
        self.assertEqual(a.patch(f"/api/manage/exam-tracks/{track_id}/", {"name": "Group 4"}, format="json", **XHR).json()["group"], "group-4")
        self.assertEqual(a.patch(f"/api/manage/exam-tracks/{track_id}/", {"name": "Group 1"}, format="json", **XHR).status_code, 400)
        # move to the top
        a.patch(f"/api/manage/exam-tracks/{track_id}/", {"move": "up"}, format="json", **XHR)
        a.patch(f"/api/manage/exam-tracks/{track_id}/", {"move": "up"}, format="json", **XHR)
        self.assertEqual(Track.objects.filter(commission=appsc).first().group.slug, "group-4")
        # delete with the name typed; TGPSC's Group 1 is untouched
        self.assertEqual(a.delete(f"/api/manage/exam-tracks/{track_id}/", {"confirm": "x"}, format="json", **XHR).status_code, 400)
        self.assertEqual(a.delete(f"/api/manage/exam-tracks/{track_id}/", {"confirm": "Group 4"}, format="json", **XHR).status_code, 204)
        self.assertTrue(Track.objects.filter(commission__slug="tgpsc", group__slug="group-1").exists())

    def test_upsc_starter_and_dedicating_the_platform(self):
        a = self.admin()
        res = a.post("/api/manage/site/starter/", {"kind": "upsc"}, format="json", **XHR)
        self.assertEqual(res.status_code, 201, res.content)
        upsc = Commission.objects.get(slug="upsc")
        self.assertEqual(Subject.objects.filter(paper__track__commission=upsc).count(), 14)
        self.assertEqual(a.post("/api/manage/site/starter/", {"kind": "upsc"}, format="json", **XHR).status_code, 200)  # repeat: nothing doubled
        self.assertEqual(Subject.objects.filter(paper__track__commission=upsc).count(), 14)
        self.assertEqual(self.visible(self.student()), ["appsc"])  # UPSC hidden so far; TGPSC is hidden by the seed

        site = a.post("/api/manage/site/dedicate/", {"commission": upsc.id}, format="json", **XHR).json()
        self.assertEqual((site["focus"], site["focus_name"]), ("upsc", "UPSC"))
        self.assertEqual(self.visible(self.student()), ["upsc"])
        self.assertEqual(self.student().get("/api/tracks/appsc/group-1/syllabus/").status_code, 404)
        self.assertEqual(self.student().get("/api/tracks/upsc/civil-services/syllabus/").status_code, 200)
        self.assertEqual(APIClient().get("/api/site/").json()["focus"], "upsc")  # public

        # back to all exams: what was visible before returns (APPSC), UPSC stays, and TGPSC — hidden before — stays hidden
        self.assertIsNone(a.post("/api/manage/site/dedicate/", {"commission": None}, format="json", **XHR).json()["focus"])
        self.assertEqual(self.visible(self.student()), ["appsc", "upsc"])

    def test_topics_catalogue(self):
        a = self.admin()
        appsc = Commission.objects.get(slug="appsc")
        g3 = a.post(f"/api/manage/exams/{appsc.id}/exams/", {"name": "Group 3"}, format="json", **XHR).json()
        self.assertFalse(Paper.objects.filter(track_id=g3["id"]).exists())
        res = a.post(f"/api/manage/exam-tracks/{g3['id']}/topics/", {"title": "Rural Development", "look": "economy"}, format="json", **XHR)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(Paper.objects.get(track_id=g3["id"]).title, "General Studies")  # made on the fly
        self.assertEqual(a.post(f"/api/manage/exam-tracks/{g3['id']}/topics/", {"title": "rural development"}, format="json", **XHR).status_code, 400)
        subjects = self.student().get("/api/tracks/appsc/group-3/syllabus/").json()["papers"][0]["subjects"]
        self.assertEqual([(s["title"], s["look"]) for s in subjects], [("Rural Development", "economy")])
        # rename + change look through the ordinary subject endpoint
        sid = res.json()["id"]
        self.assertEqual(a.patch(f"/api/manage/subjects/{sid}/", {"title": "Rural Economy", "look": "general"}, format="json", **XHR).json()["look"], "general")

    def test_site_settings_and_note_wording(self):
        a = self.admin()
        res = a.patch("/api/manage/site/", {
            "hero_eyebrow": "UPSC Civil Services", "reader_font": "serif", "reader_size": 3, "show_codes": False,
            "note_kinds": {"prelims": {"label": "Quick Revision", "blurb": "One-page revision", "enabled": True},
                           "mains": {"label": "", "blurb": "", "enabled": False}},
        }, format="json", **XHR)
        self.assertEqual(res.status_code, 200, res.content)
        site = APIClient().get("/api/site/").json()
        kinds = {k["key"]: k for k in site["note_kinds"]}
        self.assertEqual((kinds["prelims"]["label"], kinds["mains"]["enabled"], kinds["mains"]["label"]), ("Quick Revision", False, "Mains Notes"))
        self.assertEqual(kinds["comprehensive"]["label"], "Comprehensive Notes")
        self.assertEqual((site["hero_eyebrow"], site["reader_font"], site["reader_size"], site["show_codes"]), ("UPSC Civil Services", "serif", 3, False))
        # can't switch every type off, or pick a size that doesn't exist
        off = {k: {"enabled": False} for k in ("comprehensive", "prelims", "mains")}
        self.assertEqual(a.patch("/api/manage/site/", {"note_kinds": off}, format="json", **XHR).status_code, 400)
        self.assertEqual(a.patch("/api/manage/site/", {"reader_size": 9}, format="json", **XHR).status_code, 400)
        self.assertEqual(SiteSettings.load().reader_size, 3)
