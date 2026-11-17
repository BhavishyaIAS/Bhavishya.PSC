import tempfile
from pathlib import Path

import docx
from django.apps import apps
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from content import pyq_bundle as pb
from content.models import Question
from content.pyq_docx import build_upsc

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


def edition(path, blocks):
    d = docx.Document()
    for kind, text in blocks:
        if kind == "h1":
            d.add_heading(text, level=1)
        elif kind == "h2":
            d.add_heading(text, level=2)
        else:
            d.add_paragraph(text)
    d.save(path)


def question(head, text, opts, answer, expl, *more):
    return [("p", head), ("p", text)] + [("p", f"({k}) {v}") for k, v in zip("abcd", opts)] + \
        [("p", f"Answer: {answer}"), ("p", f"Explanation: {expl}")] + [("p", m) for m in more]


Q1 = ("Solar eclipse occurs when", ["Earth between", "Right angle", "Moon between", "Sun between"])
Q2 = ("Anti-sterility vitamin is", ["A", "B", "C", "D"])
Q3 = ("Which statements are correct?\n1. One\n2. Two", ["1 only", "2 only", "Both", "Neither"])


class UpscDocxTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))

    def files(self):
        d = Path(tempfile.mkdtemp())
        edition(d / "y.docx", [("h1", "UPSC Prelims 1979"), ("p", "General Studies Paper I · 3 questions")]
                + question("Q1. [Geography]", Q1[0], Q1[1], "(c) Moon between", "The Moon's shadow.", "Fig: Eclipse diagram", "-   umbra")
                + question("Q2. [Science and Technology]  New  low confidence", Q2[0], Q2[1], "None of the options is correct as framed (see explanation)", "It is Vitamin E.")
                + [("h2", "Answer key: UPSC Prelims 1979")]
                + [("h1", "UPSC Prelims 2024")]
                + question("Q25. [International Relations and Current Affairs]  Repeat", Q3[0], Q3[1], "(b) 2 only   (UPSC's official key: (c); see explanation)", "Only 2 holds.")
                + [("h1", "Questions with year not stated")]
                + question("Q1. [Science and Technology]", "[year not stated] Assertion (A): x", ["a", "b", "c", "d"], "(a) a", "x"))
        edition(d / "s.docx", [("h1", "Geography"), ("h2", "UPSC 1979")]
                + question("Q1. [UPSC 1979]", Q1[0], Q1[1], "(c) Moon between", "The Moon's shadow.")
                + [("h1", "Science and Technology"), ("h2", "UPSC 1979")]
                + question("Q2. [UPSC 1979]  New  low confidence", Q2[0], Q2[1], "None of the options is correct as framed (see explanation)", "It is Vitamin E.")
                + [("h1", "International Relations and Current Affairs"), ("h2", "UPSC 2024")]
                + question("Q3. [UPSC 2024]  Repeat", Q3[0], Q3[1], "(b) 2 only   (UPSC's official key: (c); see explanation)", "Only 2 holds."))
        return d / "y.docx", d / "s.docx"

    def test_build(self):
        y, s = self.files()
        bundle, report = build_upsc(y, s)
        qs = bundle["tracks"]["upsc/civil-services"]["questions"]
        self.assertEqual(len(qs), 3)
        self.assertEqual(len(report["skipped_no_year"]), 1)
        self.assertEqual(report.get("editions_disagree", []), [])
        q1, q2, q3 = qs
        self.assertEqual((q1["year"], q1["question_no"], q1["correct_option"], q1["micro_theme"]), (1979, 1, "C", "UPSC-PRE-GEO"))
        self.assertEqual(q1["explanation"], "The Moon's shadow.\n• umbra")  # figure caption dropped, list kept
        self.assertEqual((q2["correct_option"], q2["tags"]), ("N", ["low-confidence key"]))
        self.assertEqual(q3["correct_option"], "B")
        self.assertTrue(q3["explanation"].startswith("(UPSC's official key: (c); see explanation)"))
        self.assertEqual((q3["tags"], q3["micro_theme"]), (["asked again"], "UPSC-PRE-CUR"))

    def test_load_and_students_filter_by_year_and_subject(self):
        y, s = self.files()
        bundle, _ = build_upsc(y, s)
        Commission = apps.get_model("content", "Commission")
        if not Commission.objects.filter(slug="upsc").exists():
            c = APIClient()
            c.post("/api/auth/login/", {"email": "admin@bhavishya.app", "password": "Admin@2026"}, format="json", **XHR)
            self.assertIn(c.post("/api/manage/site/starter/", {"kind": "upsc"}, format="json", **XHR).status_code, (200, 201))
            Commission.objects.filter(slug="upsc").update(status="published")
        pb.load(bundle, lambda n: apps.get_model("content", n), log=lambda *_: None)
        self.assertEqual(Question.objects.filter(track__commission__slug="upsc").count(), 3)
        c = APIClient()
        c.post("/api/auth/login/", {"email": "student@bhavishya.app", "password": "Student@2026"}, format="json", **XHR)
        base = "/api/tracks/upsc/civil-services/questions/?stage=prelims"
        self.assertEqual(c.get(base + "&year=1979").json()["count"], 2)
        geo = Question.objects.get(text=Q1[0]).micro_theme.topic.subject_id
        self.assertEqual(c.get(base + f"&subject={geo}").json()["count"], 1)
        none = next(r for r in c.get(base + "&year=1979").json()["results"] if r["text"] == Q2[0])
        self.assertEqual(none["correct_option"], "N")
        self.assertEqual(len(none["options"]), 4)
