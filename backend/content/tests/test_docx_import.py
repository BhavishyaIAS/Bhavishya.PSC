import io
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from docx import Document
from rest_framework.test import APIClient

from content.docx_import import parse_docx, title_case
from content.models import MicroTheme, Note, Paper, Stage, Subject, Topic

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


def make_docx(extra_section=False):
    d = Document()
    d.add_heading("Medieval Indian History", level=0)  # Title
    d.add_heading("THE DELHI SULTANATE (1206–1526)", level=1)
    d.add_heading("Society, Economy and Culture", level=2)  # chapter subtitle
    d.add_heading("1. The Horse, the Road and the New Capital", level=2)
    p = d.add_paragraph("In 1192 at ")
    p.add_run("Tarain").bold = True
    p.add_run(" a battle was lost.")
    d.add_paragraph("A state trying to survive", style="List Bullet")
    d.add_paragraph("A state trying to expand", style="List Bullet")
    d.add_heading("Key officers", level=3)
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "Department", "Head"
    t.cell(1, 0).text, t.cell(1, 1).text = "Diwan-i-wizarat", "Wazir"
    d.add_heading("PART I — ADMINISTRATION", level=1)
    d.add_heading("2. How the Sultanate Was Governed", level=2)
    d.add_paragraph("Iqta and revenue.")
    if extra_section:
        d.add_heading("3. The Economy", level=2)
        d.add_paragraph("Markets of Alauddin.")
    d.add_heading("THE KAKATIYAS", level=1)
    d.add_paragraph("Warangal was the capital.")  # intro text before any section
    d.add_heading("1. Rudramadevi", level=2)
    d.add_paragraph("The woman who was called king.")
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def upload(data, name="notes.docx"):
    return SimpleUploadedFile(name, data, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class DocxImportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))
        cls.paper = Paper.objects.get(track__commission__slug="appsc", track__group__slug="group-1", stage=Stage.PRELIMS, code="PI")

    def client_for(self, email, password):
        c = APIClient()
        self.assertEqual(c.post("/api/auth/login/", {"email": email, "password": password}, format="json", **XHR).status_code, 200)
        return c

    def test_title_case(self):
        self.assertEqual(title_case("THE DELHI SULTANATE (1206–1526)"), "The Delhi Sultanate (1206–1526)")
        self.assertEqual(title_case("PART I — ADMINISTRATION"), "Part I — Administration")
        self.assertEqual(title_case("Already Mixed case"), "Already Mixed case")

    def test_parser_structure(self):
        parsed = parse_docx(upload(make_docx()))
        self.assertEqual(parsed.title, "Medieval Indian History")
        self.assertEqual([c.full_title() for c in parsed.chapters],
                         ["The Delhi Sultanate (1206–1526): Society, Economy and Culture", "The Kakatiyas"])
        sultanate, kakatiyas = parsed.chapters
        self.assertEqual([s.title for s in sultanate.sections], ["The Horse, the Road and the New Capital", "How the Sultanate Was Governed"])
        types = [b["type"] for b in sultanate.sections[0].blocks]
        self.assertEqual(types, ["paragraph", "bulletList", "heading", "table"])
        bold = sultanate.sections[0].blocks[0]["content"][1]
        self.assertEqual((bold["text"], bold["marks"]), ("Tarain", [{"type": "bold"}]))
        table = sultanate.sections[0].blocks[3]
        self.assertEqual(table["content"][0]["content"][0]["type"], "tableHeader")
        # "PART I" stays inside the chapter, as a heading at the top of the next section
        part = sultanate.sections[1].blocks[0]
        self.assertEqual((part["type"], part["content"][0]["text"]), ("heading", "Part I — Administration"))
        # text before a chapter's first section becomes an Introduction section
        self.assertEqual([s.title for s in kakatiyas.sections], ["Introduction", "Rudramadevi"])

    def test_rejects_non_docx(self):
        with self.assertRaisesMessage(Exception, ".docx"):
            parse_docx(upload(b"%PDF-1.4", name="notes.pdf"))
        with self.assertRaisesMessage(Exception, "valid .docx"):
            parse_docx(upload(b"not a zip", name="notes.docx"))

    def test_preview_import_and_idempotent_reimport(self):
        admin = self.client_for("admin@bhavishya.app", "Admin@2026")
        url = "/api/manage/import-docx/"
        preview = admin.post(url, {"file": upload(make_docx()), "paper": self.paper.id}, **XHR).json()
        # "Medieval Indian History" goes into the paper's "Medieval History" syllabus topic
        self.assertEqual((preview["subject"], preview["prefix"], preview["sections"]), ("Medieval History", "MH", 4))
        self.assertTrue(preview["existing_subject"])
        self.assertEqual(preview["subjects"][:3], ["Ancient History", "Medieval History", "Modern History"])
        self.assertEqual(preview["chapters"][0]["sections"][0]["code"], "MH-01-01")
        self.assertFalse(MicroTheme.objects.filter(code__startswith="MH-").exists())  # preview writes nothing

        res = admin.post(url, {"file": upload(make_docx()), "paper": self.paper.id, "prefix": "MIH", "commit": "true", "status": "published"}, **XHR)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual((res.json()["result"]["topics_created"], res.json()["result"]["micro_themes_created"]), (2, 4))
        subject = Subject.objects.get(paper=self.paper, title="Medieval History")
        self.assertEqual(list(Topic.objects.filter(subject=subject).order_by("order").values_list("title", flat=True)),
                         ["The Delhi Sultanate (1206–1526): Society, Economy and Culture", "The Kakatiyas"])
        mt = MicroTheme.objects.get(track=self.paper.track, code="MIH-01-01")
        note = Note.objects.get(micro_theme=mt, kind="comprehensive")
        self.assertIn("Tarain", note.body_text)

        # Students read it straight away (published) through the normal notes reader
        student = self.client_for("student@bhavishya.app", "Student@2026")
        topic = mt.topic
        notes = student.get(f"/api/tracks/appsc/group-1/notes/?kind=comprehensive&topic={topic.id}").json()["results"]
        self.assertEqual([r["micro_theme"]["code"] for r in notes], ["MIH-01-01", "MIH-01-02"])

        # Re-import an edited book without naming subject or prefix: same topic, same codes (MIH),
        # updates in place, adds the new section, no duplicates
        res = admin.post(url, {"file": upload(make_docx(extra_section=True)), "paper": self.paper.id, "commit": "true"}, **XHR).json()
        self.assertEqual((res["subject"], res["prefix"]), ("Medieval History", "MIH"))
        self.assertEqual((res["result"]["micro_themes_created"], res["result"]["micro_themes_updated"]), (1, 4))
        self.assertEqual(Subject.objects.filter(paper=self.paper, title__icontains="Medieval").count(), 1)
        self.assertEqual(MicroTheme.objects.filter(track=self.paper.track, code__startswith="MIH-").count(), 5)

    def test_prefix_clash_with_another_subject_is_refused(self):
        admin = self.client_for("admin@bhavishya.app", "Admin@2026")
        # PRE-PI-HC-001.. belong to the seeded Ancient History subject: its codes can't be reused
        MicroTheme.objects.filter(code="PRE-PI-HC-001").update(code="CLASH-01-01")
        res = admin.post("/api/manage/import-docx/", {"file": upload(make_docx()), "paper": self.paper.id, "prefix": "CLASH", "commit": "true"}, **XHR)
        self.assertEqual(res.status_code, 400)
        self.assertIn("CLASH-01-01", res.json()["conflicts"])
        self.assertFalse(MicroTheme.objects.filter(code__startswith="CLASH-01-02").exists())

    def test_students_cannot_import(self):
        student = self.client_for("student@bhavishya.app", "Student@2026")
        res = student.post("/api/manage/import-docx/", {"file": upload(make_docx()), "paper": self.paper.id, "commit": "true"}, **XHR)
        self.assertEqual(res.status_code, 403)
