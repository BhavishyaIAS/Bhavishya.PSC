import re
import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from content.models import MicroTheme, Question, Stage, Status, StudyMaterial

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}
TMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class ApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def login(self, email, password):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": email, "password": password}, format="json", **XHR)
        self.assertEqual(res.status_code, 200, res.content)
        return client

    def student(self):
        return self.login("student@bhavishya.app", "Student@2026")

    def admin(self):
        return self.login("admin@bhavishya.app", "Admin@2026")

    # ── auth ──────────────────────────────────────────────────────────

    def test_anonymous_cannot_read_study_content(self):
        res = APIClient().get("/api/tracks/appsc/group-1/questions/?stage=prelims")
        self.assertEqual(res.status_code, 401)

    def test_signup_creates_student_and_logs_in(self):
        c = APIClient()
        res = c.post("/api/auth/signup/", {"email": "New@Example.com", "password": "a-Long-pass-123"}, format="json", **XHR)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["user"]["role"], "student")
        self.assertEqual(c.get("/api/auth/me/").json()["user"]["email"], "new@example.com")

    def test_cookie_auth_requires_xhr_header_for_writes(self):
        c = self.student()
        res = c.post("/api/tracks/appsc/group-1/micro-themes/PRE-PI-HC-001/progress/")
        self.assertEqual(res.status_code, 403)
        res = c.post("/api/tracks/appsc/group-1/micro-themes/PRE-PI-HC-001/progress/", **XHR)
        self.assertEqual(res.status_code, 200)

    # ── role enforcement ─────────────────────────────────────────────

    def test_student_cannot_reach_admin_endpoints(self):
        c = self.student()
        for url in ["/api/manage/stats/", "/api/manage/questions/", "/api/manage/papers/", "/api/manage/materials/"]:
            self.assertEqual(c.get(url).status_code, 403, url)
        res = c.post("/api/manage/papers/", {"title": "x"}, format="json", **XHR)
        self.assertEqual(res.status_code, 403)

    def test_admin_can_reach_admin_endpoints(self):
        self.assertEqual(self.admin().get("/api/manage/stats/").status_code, 200)

    # ── draft visibility ─────────────────────────────────────────────

    def test_student_never_sees_drafts(self):
        draft_q = Question.objects.filter(status=Status.DRAFT).first()
        self.assertIsNotNone(draft_q)
        c = self.student()
        ids = [q["id"] for q in c.get("/api/tracks/appsc/group-1/questions/?stage=prelims&page_size=100").json()["results"]]
        self.assertNotIn(draft_q.id, ids)
        self.assertEqual(c.get(f"/api/tracks/appsc/group-1/questions/?stage=prelims&id={draft_q.id}").json()["count"], 0)
        # Draft micro-theme is 404 by direct URL
        self.assertEqual(c.get("/api/tracks/appsc/group-1/micro-themes/PRE-PII-MA-002/").status_code, 404)
        # ...but admins see it
        self.assertEqual(self.admin().get("/api/tracks/appsc/group-1/micro-themes/PRE-PII-MA-002/").status_code, 200)

    def test_unpublishing_a_paper_hides_its_whole_subtree(self):
        mt = MicroTheme.objects.get(code="PRE-PI-HC-001")
        paper = mt.topic.subject.paper
        paper.status = Status.DRAFT
        paper.save()
        c = self.student()
        self.assertEqual(c.get("/api/tracks/appsc/group-1/micro-themes/PRE-PI-HC-001/").status_code, 404)
        tree = c.get("/api/tracks/appsc/group-1/syllabus/").json()
        self.assertNotIn(paper.id, [p["id"] for p in tree["papers"]])
        hits = c.get("/api/search/?q=dockyard").json()
        self.assertFalse([g for g in hits["groups"] if g["type"] == "note"])

    # ── segregation ──────────────────────────────────────────────────

    def test_tracks_do_not_leak(self):
        c = self.student()
        appsc = c.get("/api/tracks/appsc/group-1/questions/?stage=prelims&page_size=100").json()
        tg = c.get("/api/tracks/tgpsc/group-1/questions/?stage=prelims&page_size=100").json()
        empty = c.get("/api/tracks/appsc/group-2/questions/?stage=prelims").json()
        self.assertTrue(appsc["count"] > 0 and tg["count"] > 0)
        self.assertEqual(empty["count"], 0)
        self.assertFalse({q["id"] for q in appsc["results"]} & {q["id"] for q in tg["results"]})
        # A micro-theme code from one track isn't reachable through another track's URL
        self.assertEqual(c.get("/api/tracks/tgpsc/group-1/micro-themes/PRE-PI-HC-001/").status_code, 404)

    def test_question_cannot_map_to_other_tracks_micro_theme(self):
        c = self.admin()
        appsc_track = MicroTheme.objects.get(code="PRE-PI-HC-001").track_id
        tg_mt = MicroTheme.objects.get(code="TG-PRE-TH-001")
        res = c.post("/api/manage/questions/", {
            "track": appsc_track, "stage": "mains", "year": 2024, "paper_label": "Paper II", "question_no": 99,
            "micro_theme": tg_mt.id, "text": "x", "status": "draft",
        }, format="json", **XHR)
        self.assertEqual(res.status_code, 400)

    # ── bulk import ──────────────────────────────────────────────────

    def test_import_preview_commit_and_idempotent_rerun(self):
        c = self.admin()
        rows = [
            {"question_no": 501, "year": 2024, "paper_label": "Paper I", "micro_theme_code": "PRE-PI-PO-002",
             "question": "Which Article guarantees equality before law?", "option_a": "14", "option_b": "15",
             "option_c": "16", "option_d": "17", "correct_option": "A", "tags": "polity, fundamental-rights"},
            {"question_no": 502, "year": 2024, "paper_label": "Paper I", "micro_theme_code": "NOPE-001",
             "question": "Bad row", "option_a": "1", "option_b": "2", "option_c": "3", "option_d": "4", "correct_option": "E"},
        ]
        body = {"track": "appsc/group-1", "stage": "prelims", "rows": rows}
        preview = c.post("/api/manage/questions/import/", body, format="json", **XHR).json()
        self.assertEqual((preview["valid"], preview["invalid"]), (1, 1))
        self.assertTrue(any("micro_theme_code" in e for e in preview["rows"][1]["errors"]))
        before = Question.objects.count()

        first = c.post("/api/manage/questions/import/", {**body, "commit": True}, format="json", **XHR).json()
        self.assertEqual(first["result"], {"created": 1, "updated": 0, "failed": 1})
        rows[0]["question"] = "Which Article guarantees equality before law? (edited)"
        second = c.post("/api/manage/questions/import/", {**body, "rows": rows, "commit": True}, format="json", **XHR).json()
        self.assertEqual(second["result"], {"created": 0, "updated": 1, "failed": 1})
        self.assertEqual(Question.objects.count(), before + 1)
        q = Question.objects.get(question_no=501, year=2024, stage=Stage.PRELIMS)
        self.assertTrue(q.text.endswith("(edited)"))
        self.assertEqual(sorted(q.tags.values_list("slug", flat=True)), ["fundamental-rights", "polity"])

    def test_student_cannot_import(self):
        res = self.student().post("/api/manage/questions/import/", {"track": "appsc/group-1", "stage": "prelims",
                                                                   "rows": [{}]}, format="json", **XHR)
        self.assertEqual(res.status_code, 403)

    # ── materials ────────────────────────────────────────────────────

    def test_material_download_link_is_signed_and_rechecks_visibility(self):
        m = StudyMaterial.objects.first()
        c = self.student()
        link = c.post(f"/api/materials/{m.id}/link/", **XHR).json()["url"]
        anon = APIClient()
        res = anon.get(link)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(b"".join(res.streaming_content).startswith(b"%PDF"))
        # Tampered token
        self.assertEqual(anon.get(re.sub(r"/m/.", "/m/X", link)).status_code, 404)
        # Unpublished after the link was issued → no longer downloadable by the student
        m.status = Status.DRAFT
        m.save()
        self.assertEqual(anon.get(link).status_code, 404)
        self.assertEqual(c.post(f"/api/materials/{m.id}/link/", **XHR).status_code, 404)

    def test_material_upload_rejects_disguised_files(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        c = self.admin()
        track = MicroTheme.objects.get(code="PRE-PI-HC-001").track_id
        fake = SimpleUploadedFile("notes.pdf", b"MZ\x90\x00 not a pdf", content_type="application/pdf")
        res = c.post("/api/manage/materials/", {"track": track, "category": "prelims", "title": "x", "file": fake}, **XHR)
        self.assertEqual(res.status_code, 400)
        exe = SimpleUploadedFile("tool.exe", b"MZ", content_type="application/octet-stream")
        res = c.post("/api/manage/materials/", {"track": track, "category": "prelims", "title": "x", "file": exe}, **XHR)
        self.assertEqual(res.status_code, 400)

    # ── coverage & search ────────────────────────────────────────────

    def test_coverage_counts(self):
        data = self.student().get("/api/tracks/appsc/group-1/coverage/").json()
        self.assertEqual(data["micro_themes"], 17)  # 18 seeded, 1 draft hidden from students
        self.assertGreater(data["coverage_pct"], 0)
        self.assertEqual(data["prelims_questions"], 23)
        self.assertEqual(data["papers"][0]["stage"], "prelims")
        admin = self.admin().get("/api/tracks/appsc/group-1/coverage/").json()
        self.assertEqual(admin["micro_themes"], 18)

    def test_rich_text_validation_rejects_unknown_nodes(self):
        c = self.admin()
        mt = MicroTheme.objects.get(code="PRE-PI-HC-002")
        bad = {"type": "doc", "content": [{"type": "script", "content": []}]}
        res = c.put(f"/api/manage/micro-themes/{mt.id}/notes/prelims/", {"body": bad, "status": "published"},
                    format="json", **XHR)
        self.assertEqual(res.status_code, 400)
