"""
Links between a Notes module's own syllabus and the track's general syllabus.

APPSC Group I's notes live in the Notes modules' syllabi (NC-…, NP-…, NM-…), while every PYQ and the general
progress are filed under the general syllabus. A link says "this notes topic covers that general section", so a
topic's notes, its PYQs and the student's progress meet.

Links are suggested from the titles (TF-IDF over word stems, the topic's own title weighing most) and then
confirmed, rejected or added by an editor in Manage. Suggesting again never touches a confirmed or rejected link.
"""

import math
import re
from collections import Counter

STOP = {
    "the", "and", "of", "in", "on", "for", "to", "a", "an", "or", "by", "with", "at", "its", "their", "from", "into", "as",
    "only", "p", "m", "i", "ii", "iii", "iv", "v", "etc", "role", "various", "nature", "scope", "features", "salient",
    "important", "main", "major", "basic", "general", "introduction", "overview", "issues", "concept", "concepts",
    "india", "indian", "history", "historical", "culture", "cultural", "development", "developments", "society", "social",
    "impact", "contribution", "contributions", "conditions", "life", "aspects", "including", "related", "different",
}
SUGGEST_MIN = 0.22  # cosine below this is not worth an editor's look
STRONG = 0.45  # a suggestion this close is used for PYQs and progress before an editor confirms it


def stems(text: str) -> list[str]:
    """Words as six-letter stems: Kushans/Kushana → kushan, Magadha/Magadhan → magadh, Sultanate → sultan."""
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in STOP or len(w) < 3:
            continue
        out.append(w[:6])
    return out


def _vec(parts: list[tuple[str, float]], idf: dict) -> dict:
    tf: Counter = Counter()
    for text, weight in parts:
        for s in stems(text):
            tf[s] += weight
    v = {s: w * idf.get(s, 0.0) for s, w in tf.items()}
    n = math.sqrt(sum(x * x for x in v.values())) or 1.0
    return {s: x / n for s, x in v.items()}


def _parts_notes(mt):
    return [(mt.title, 1.0), (mt.topic.title, 0.35)]


def _parts_general(mt):
    return [(mt.title, 1.0), (mt.topic.title, 0.7), (mt.topic.subject.title, 0.3)]


def suggestions(notes_mts, general_mts, top: int = 4) -> dict:
    """notes micro-theme id → [(general micro-theme, score)], best first."""
    docs = [stems(" ".join(t for t, _ in _parts_notes(m))) for m in notes_mts] + [
        stems(" ".join(t for t, _ in _parts_general(m))) for m in general_mts
    ]
    df: Counter = Counter()
    for d in docs:
        df.update(set(d))
    n = len(docs) or 1
    idf = {s: math.log(1 + n / c) for s, c in df.items()}
    gvecs = [(g, _vec(_parts_general(g), idf)) for g in general_mts]
    out = {}
    for m in notes_mts:
        v = _vec(_parts_notes(m), idf)
        if not v:
            continue
        scored = []
        for g, gv in gvecs:
            score = sum(x * gv.get(s, 0.0) for s, x in v.items())
            if score >= SUGGEST_MIN:
                scored.append((g, round(score, 3)))
        scored.sort(key=lambda p: -p[1])
        if scored:
            best = scored[0][1]
            out[m.id] = [(g, s) for g, s in scored[:top] if s >= best * 0.6]
    return out


def suggest_for_track(track, SyllabusLink, MicroTheme) -> dict:
    """(Re)suggest links for one track. Confirmed and rejected links are left exactly as they are."""
    base = MicroTheme.objects.filter(track=track).select_related("topic__subject__paper")
    notes = list(base.exclude(topic__subject__paper__notes_kind=""))
    general = list(base.filter(topic__subject__paper__notes_kind=""))
    if not notes or not general:
        return {"suggested": 0}
    decided = set(SyllabusLink.objects.filter(notes_mt__track=track).exclude(status="suggested").values_list("notes_mt_id", "general_mt_id"))
    SyllabusLink.objects.filter(notes_mt__track=track, status="suggested").delete()
    rows = []
    for nid, pairs in suggestions(notes, general).items():
        for g, score in pairs:
            if (nid, g.id) not in decided:
                rows.append(SyllabusLink(notes_mt_id=nid, general_mt_id=g.id, score=score, status="suggested"))
    SyllabusLink.objects.bulk_create(rows, batch_size=1000)
    return {"suggested": len(rows), "topics": len({r.notes_mt_id for r in rows}), "of": len(notes)}
