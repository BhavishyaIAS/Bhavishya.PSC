import csv
import tempfile
from pathlib import Path

from django.apps import apps
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from content import pyq_bundle as pb
from content.models import MicroTheme, Question, Subject, Topic

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}
COMMON = ["stage", "commission", "exam_group", "year", "paper_label", "microtheme_code", "microtheme_name", "question_text", "keywords", "status"]

ANSWER = "\n".join([
    "Introduction",
    "The monsoon is a seasonal reversal of winds.",
    "The Himalayas — the mechanical role",
    "As a thermal barrier: the range blocks cold air from the north, which is why the plains stay warm in the",
    "winter months.",
    "Stage — Ages · Anchor",
    "Foundational — 3–8 · NCF-FS",
    "Preparatory — 8–11 · NCF-SE",
    "Conclusion",
    "Together they make the monsoon.",
    "Value addition",
    "Onset criteria: 60 per cent of stations.",
    "AP split: 556 mm south-west, 296 mm north-east.",
    "C I V I C C E N T R E I A S | M A I N S P Y Q B O O K L E T 5 / 5",
    "APPSC / TGPSC Group-I Mains",
    "Another booklet answer that must not survive.",
])


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


class CleaningTests(SimpleTestCase):
    def test_pasted_booklet_after_the_answer_is_cut(self):
        text, cut = pb.clean_answer(ANSWER)
        self.assertIsNotNone(cut)
        self.assertTrue(text.endswith("296 mm north-east."))
        self.assertNotIn("C I V I C", text)
        self.assertNotIn("must not survive", text)

    def test_nothing_before_the_conclusion_is_cut(self):
        text, _ = pb.clean_answer("Introduction\nAPPSC / TGPSC Group-I Mains are tough.\nConclusion\nDone.")
        self.assertIn("APPSC / TGPSC Group-I Mains are tough.", text)

    def test_editor_notes_inside_an_answer_are_removed_but_answer_text_is_kept(self):
        text, _ = pb.clean_answer(
            "Introduction\nCORRECTION (booklet): the source says X.\nDevulapalli Krishna Sastry, as the source booklet does, ...\n"
            "A note on length: these run long.\nConclusion\nEnd."
        )
        self.assertNotIn("CORRECTION", text)
        self.assertNotIn("note on length", text)
        self.assertIn("Devulapalli Krishna Sastry", text)

    def test_structure_is_rebuilt_without_changing_words(self):
        text, _ = pb.clean_answer(ANSWER)
        doc = pb.answer_to_doc(text)
        types = [n["type"] for n in doc["content"]]
        self.assertEqual(types[0], "heading")
        self.assertIn("table", types)
        self.assertEqual(types[-1], "bulletList")
        para = next(n for n in doc["content"] if n["type"] == "paragraph" and n["content"][0]["text"] == "As a thermal barrier:")
        self.assertEqual(para["content"][0]["marks"], [{"type": "bold"}])
        # the line broken mid-sentence is one paragraph again
        self.assertTrue(para["content"][1]["text"].endswith("plains stay warm in the winter months."))
        # every word of the kept answer is still there
        flat = " ".join(pb.doc_to_text(doc).split())
        for word in text.replace("—", " ").replace("·", " ").split():
            self.assertIn(word.strip(":"), flat)

    def test_subjects(self):
        self.assertEqual(pb.subject_for("PRE-PI-HC-001", "Indus Valley Civilization", "x"), "ANC")
        self.assertEqual(pb.subject_for("PRE-PI-HC-027", "South Indian Dynasties", "Cholas: administration"), "MED")
        self.assertEqual(pb.subject_for("PRE-PI-HC-023", "South Indian Dynasties", "Badami Chalukyas"), "ANC")
        self.assertEqual(pb.subject_for("MN-PII-HCOI-037", "Phases", "x"), "MOD")
        self.assertEqual(pb.subject_for("MN-PII-HCOA-045", "Early Dynasties", "x"), "REGH")
        self.assertEqual(pb.subject_for("MN-PIV-ADA-036", "Diversification", "x"), "REGE")
        self.assertEqual(pb.subject_for("MN-PIV-IEC-001", "Growth", "x"), "ECO")
        self.assertEqual(pb.subject_for("PRE-PII-ST-048", "Biodiversity", "x"), "ENV")
        self.assertEqual(pb.subject_for("MN-PV-HB-043", "Vaccines", "x"), "SNT")
        self.assertEqual(pb.subject_for("MN-PIII-EIPS-001", "Attitude", "x"), "ETH")


class LoadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def bundle(self):
        d = Path(tempfile.mkdtemp())
        write_csv(d / "p.csv", COMMON + ["option_a", "option_b", "option_c", "option_d", "correct_option", "explanation"], [
            ["prelims", "appsc", "1", "2016", "Prelims Paper-I", "PRE-PI-HC-901", "Vedic Age — Later Vedic changes", "Which Veda?", "", "published", "Rig", "Sama", "Yajur", "Atharva", "A", ""],
            ["prelims", "appsc", "1", "2016", "Prelims Paper-I", "PRE-PI-HC-901", "Vedic Age — Later Vedic changes", "Beads were made at", "PRE-PI-HC-070", "published", "Chanhudaro", "", "", "", "A", ""],
        ])
        write_csv(d / "m.csv", COMMON + ["directive_word", "marks", "model_answer_text"], [
            ["mains", "appsc", "1", "2023", "Paper-II: History", "MN-PII-G-075", "Soils & Rivers — Soil types", "Describe soils.", "", "published", "describe", "10", ANSWER],
            ["mains", "appsc", "1", "2016", "Paper-V: Science (TGPSC)", "MN-PV-HB-043", "Vaccines — Types", "What is an antibody?", "", "published", "", "10", ANSWER],
            ["mains", "appsc", "1", "0", "Paper-II: History (TGPSC)", "MN-PII-HCOI-030", "Gandhian Era — Phases", "Bring out the Gandhian era. (TGPSC, 2016", "", "published", "", "10", ANSWER],
        ])
        bundle, report = pb.build(d / "p.csv", d / "m.csv")
        return bundle, report

    def test_build_and_load(self):
        bundle, report = self.bundle()
        self.assertEqual(set(bundle["tracks"]), {"appsc/group-1", "tgpsc/group-1"})
        self.assertEqual(len(report["answer_only"]), 1)
        tg = bundle["tracks"]["tgpsc/group-1"]["questions"]
        self.assertEqual({q["paper_label"] for q in tg}, {"Paper-V: Science", "Paper-II: History"})
        self.assertEqual(sorted(q["year"] for q in tg), [2016, 2016])
        self.assertIn("Bring out the Gandhian era.", [q["text"] for q in tg])

        tg_before = Question.objects.filter(track__commission__slug="tgpsc").count()
        totals = pb.load(bundle, lambda n: apps.get_model("content", n), log=lambda *_: None)
        self.assertEqual(totals["questions_created"], 5)
        q = Question.objects.get(text="Describe soils.")
        self.assertEqual(q.track.commission.slug, "appsc")
        self.assertEqual(q.directive, "Describe")
        self.assertNotIn("C I V I C", q.model_answer_text)
        self.assertTrue(Question.objects.filter(search_vector__isnull=False, pk=q.pk).exists())
        # filed under the existing notes topic, in a new hidden chapter
        mt = q.micro_theme
        self.assertEqual(mt.topic.subject.title, "Geography")
        self.assertEqual((mt.status, mt.topic.status), ("draft", "draft"))
        # the misplaced code in the keywords column is dropped
        self.assertEqual(Question.objects.get(text="Beads were made at").keywords, "")
        # TGPSC questions are filed in TGPSC Group 1
        self.assertEqual(Question.objects.filter(track__commission__slug="tgpsc").count() - tg_before, 2)

        again = pb.load(bundle, lambda n: apps.get_model("content", n), log=lambda *_: None)
        self.assertEqual(again.get("questions_created", 0), 0)
        self.assertEqual(again["questions_updated"], 5)

    def test_an_existing_code_with_another_meaning_is_not_reused(self):
        bundle, _ = self.bundle()
        bundle["tracks"]["appsc/group-1"]["micro_themes"][0]["code"] = "PRE-PI-HC-001"  # seed: Indus Valley
        for q in bundle["tracks"]["appsc/group-1"]["questions"]:
            if q["micro_theme"] == "PRE-PI-HC-901":
                q["micro_theme"] = "PRE-PI-HC-001"
        pb.load(bundle, lambda n: apps.get_model("content", n), log=lambda *_: None)
        self.assertEqual(Question.objects.get(text="Which Veda?").micro_theme.code, "PRE-PI-HC-001-PYQ")
        self.assertTrue(MicroTheme.objects.filter(code="PRE-PI-HC-001", title__icontains="Indus").exists())

    def test_answer_only_question_reaches_students_with_just_its_answer(self):
        bundle, _ = self.bundle()
        pb.load(bundle, lambda n: apps.get_model("content", n), log=lambda *_: None)
        c = APIClient()
        c.post("/api/auth/login/", {"email": "student@bhavishya.app", "password": "Student@2026"}, format="json", **XHR)
        res = c.get("/api/tracks/appsc/group-1/questions/?stage=prelims&q=Beads&page_size=50").json()
        q = next(r for r in res["results"] if r["text"] == "Beads were made at")
        self.assertEqual(q["options"], [{"key": "A", "text": "Chanhudaro"}])
        # its hidden chapter is not linked for a student
        self.assertIsNone(q["micro_theme"])
        # and the new chapters don't appear in the student's syllabus
        self.assertFalse(Topic.objects.filter(title="Vedic Age", status="published").exists())
        self.assertTrue(Subject.objects.filter(title="Geography", status="published").exists())


class AnswerOnlyValidationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def test_admin_can_save_answer_only_but_not_half_filled(self):
        c = APIClient()
        c.post("/api/auth/login/", {"email": "admin@bhavishya.app", "password": "Admin@2026"}, format="json", **XHR)
        track = Question.objects.filter(stage="prelims").first().track_id
        base = {"track": track, "stage": "prelims", "year": 2019, "paper_label": "Prelims Paper-I", "question_no": 999, "text": "Q?", "status": "published"}
        ok = c.post("/api/manage/questions/", {**base, "option_a": "Answer", "correct_option": "A"}, format="json", **XHR)
        self.assertEqual(ok.status_code, 201, ok.content)
        half = c.post("/api/manage/questions/", {**base, "question_no": 998, "option_a": "x", "option_b": "y", "correct_option": "A"}, format="json", **XHR)
        self.assertEqual(half.status_code, 400)
        self.assertIn("option_c", half.json())
        wrong = c.post("/api/manage/questions/", {**base, "question_no": 997, "option_a": "Answer", "correct_option": "B"}, format="json", **XHR)
        self.assertEqual(wrong.status_code, 400)
