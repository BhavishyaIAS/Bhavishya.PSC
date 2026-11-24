from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from content.models import Activity, AnswerDraft, Attempt, Bookmark, MicroTheme, Question, StudyProgress, TopicBookmark

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


class LearningTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", stdout=open("/dev/null", "w"))
        q = Question.objects.filter(stage="prelims", status="published").exclude(correct_option="").exclude(micro_theme=None).select_related("track__commission", "track__group").first()
        cls.q = q
        cls.base = f"/api/tracks/{q.track.commission.slug}/{q.track.group.slug}"

    def setUp(self):
        self.c = APIClient()
        self.assertEqual(self.c.post("/api/auth/login/", {"email": "student@bhavishya.app", "password": "Student@2026"}, format="json", **XHR).status_code, 200)

    def test_an_answer_is_checked_and_recorded(self):
        wrong = next(k for k in "ABCD" if k != self.q.correct_option)
        r = self.c.post(f"{self.base}/questions/{self.q.id}/attempt/", {"option": wrong}, format="json", **XHR).json()
        self.assertEqual((r["correct"], r["correct_option"]), (False, self.q.correct_option))
        self.assertEqual(self.c.post(f"{self.base}/questions/{self.q.id}/attempt/", {"option": "Z"}, format="json", **XHR).status_code, 400)
        listed = self.c.get(f"{self.base}/questions/?stage=prelims&mine=incorrect").json()
        self.assertEqual([x["id"] for x in listed["results"]], [self.q.id])
        self.assertEqual(listed["results"][0]["mine"]["chosen"], wrong)
        # answered right the next time: no longer among the wrong ones
        self.c.post(f"{self.base}/questions/{self.q.id}/attempt/", {"option": self.q.correct_option}, format="json", **XHR)
        self.assertEqual(self.c.get(f"{self.base}/questions/?stage=prelims&mine=incorrect").json()["count"], 0)
        self.assertNotIn(self.q.id, [x["id"] for x in self.c.get(f"{self.base}/questions/?stage=prelims&mine=unattempted&page_size=100").json()["results"]])

    def test_bookmarks_and_drafts(self):
        self.c.post(f"{self.base}/questions/{self.q.id}/bookmark/", **XHR)
        self.assertEqual(self.c.get(f"{self.base}/questions/?stage=prelims&mine=bookmarked").json()["count"], 1)
        self.c.delete(f"{self.base}/questions/{self.q.id}/bookmark/", **XHR)
        self.assertFalse(Bookmark.objects.exists())
        r = self.c.put(f"{self.base}/questions/{self.q.id}/answer/", {"text": "one two three", "self_score": 4}, format="json", **XHR).json()
        self.assertEqual((r["words"], r["self_score"]), (3, 4))
        self.assertEqual(AnswerDraft.objects.get().text, "one two three")

    def test_revision_follows_the_schedule(self):
        code, today = self.q.micro_theme.code, timezone.localdate()
        url = f"{self.base}/micro-themes/{code}/status/"
        self.assertEqual(self.c.put(url, {"status": "studying"}, format="json", **XHR).json()["next_due"], None)
        r = self.c.put(url, {"status": "completed"}, format="json", **XHR).json()
        self.assertEqual(r["next_due"], str(today + timedelta(days=1)))
        r = self.c.put(url, {"status": "revised"}, format="json", **XHR).json()
        self.assertEqual((r["revisions"], r["next_due"]), (1, str(today + timedelta(days=3))))
        self.c.put(url, {"status": "none"}, format="json", **XHR)
        self.assertFalse(StudyProgress.objects.exists())

    def test_the_dashboard_shows_only_the_students_own_record(self):
        d = self.c.get(f"{self.base}/dashboard/").json()
        self.assertEqual((d["prelims"]["attempts"], d["topics"]["completed"], d["continue"], d["next"][:1]), (0, 0, [], d["next"][:1]))
        self.c.post(f"{self.base}/questions/{self.q.id}/attempt/", {"option": self.q.correct_option}, format="json", **XHR)
        StudyProgress.objects.create(user=Attempt.objects.get().user, micro_theme=self.q.micro_theme, status="completed", next_due=timezone.localdate())
        d = self.c.get(f"{self.base}/dashboard/").json()
        self.assertEqual((d["prelims"]["attempts"], d["prelims"]["accuracy"], d["topics"]["due"], d["streak"]), (1, 100, 1, 1))
        self.assertEqual(d["next"][0]["kind"], "revise")

    def test_a_section_finds_its_questions(self):
        r = self.c.get(f"{self.base}/micro-themes/{self.q.micro_theme.code}/related-questions/").json()
        self.assertEqual(r["how"], "mapped")
        self.assertIn(self.q.id, [x["id"] for x in r["results"]])
        self.assertTrue(MicroTheme.objects.filter(code=self.q.micro_theme.code).exists())

    def test_reading_position_and_kept_topics(self):
        mt = self.q.micro_theme
        url = f"{self.base}/micro-themes/{mt.code}"
        self.assertEqual(self.c.put(f"{url}/position/", {"position": 0.42, "kind": "comprehensive"}, format="json", **XHR).json()["position"], 0.42)
        self.assertEqual(self.c.put(f"{url}/position/", {"position": "far"}, format="json", **XHR).status_code, 400)
        self.assertEqual(self.c.put(f"{url}/position/", {"position": 7}, format="json", **XHR).json()["position"], 1.0)
        self.c.put(f"{url}/position/", {"position": 0.42}, format="json", **XHR)
        self.assertEqual(Activity.objects.get(micro_theme=mt).position, 0.42)
        self.c.post(f"{url}/keep/", **XHR)
        self.c.post(f"{url}/keep/", **XHR)  # keeping twice is still once
        self.assertEqual(TopicBookmark.objects.count(), 1)
        p = self.c.get(f"{url}/").json()["progress"]
        self.assertEqual((p["kept"], p["position"]), (True, 0.42))
        d = self.c.get(f"{self.base}/dashboard/").json()
        self.assertEqual([t["code"] for t in d["kept_topics"]], [mt.code])
        self.assertEqual(d["continue"][0]["position"], 0.42)
        # what was kept comes first in search
        word = mt.title.split()[0]
        groups = self.c.get(f"/api/search/?q={word}").json()["groups"]
        self.assertEqual(groups[0]["type"], "kept")
        self.assertIn(mt.code, [x.get("code") for x in groups[0]["items"]])
        self.assertTrue(all("syllabus" in x for g in groups if g["type"] == "micro_theme" for x in g["items"]))
        self.c.delete(f"{url}/keep/", **XHR)
        self.assertFalse(TopicBookmark.objects.exists())
