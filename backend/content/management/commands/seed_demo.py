"""
Load a realistic SAMPLE dataset. Safe to run repeatedly — every object is
upserted on a natural key (codes / question numbers), so re-running refreshes
the demo content instead of duplicating it.

    python manage.py seed_demo
    python manage.py seed_demo --content-only   # production: no demo accounts

The questions are written in the style of state PSC previous-year papers for
demonstration; they are not reproductions of official papers.
"""

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Profile, Role
from content.models import (
    Commission,
    ExamGroup,
    GlossaryTerm,
    MaterialCategory,
    MicroTheme,
    Note,
    Paper,
    Question,
    Stage,
    Status,
    StudyMaterial,
    Subject,
    Topic,
    Track,
    Video,
)
from content.serializers import get_or_create_tags

PUB, DRAFT = Status.PUBLISHED, Status.DRAFT

# ───────────────────────── rich-text helpers ─────────────────────────


def inline(text):
    """'plain **bold** plain' → list of text nodes."""
    nodes = []
    for i, part in enumerate(text.split("**")):
        if part:
            node = {"type": "text", "text": part}
            if i % 2:
                node["marks"] = [{"type": "bold"}]
            nodes.append(node)
    return nodes


def h(level, text):
    return {"type": "heading", "attrs": {"level": level}, "content": inline(text)}


def p(text):
    return {"type": "paragraph", "content": inline(text)}


def ul(*items):
    return {"type": "bulletList", "content": [{"type": "listItem", "content": [p(i)]} for i in items]}


def ol(*items):
    return {"type": "orderedList", "attrs": {"start": 1}, "content": [{"type": "listItem", "content": [p(i)]} for i in items]}


def callout(tone, text):
    return {"type": "callout", "attrs": {"tone": tone}, "content": [p(text)]}


def quote(text):
    return {"type": "blockquote", "content": [p(text)]}


def table(header, *rows):
    def cell(kind, text):
        return {"type": kind, "content": [p(text)]}

    return {
        "type": "table",
        "content": [{"type": "tableRow", "content": [cell("tableHeader", c) for c in header]}]
        + [{"type": "tableRow", "content": [cell("tableCell", c) for c in r]} for r in rows],
    }


def diagram(code, caption=""):
    return {"type": "diagram", "attrs": {"code": code.strip(), "caption": caption}}


def doc(*blocks):
    return {"type": "doc", "content": list(blocks)}


def yt(query):
    return "https://www.youtube.com/results?search_query=" + query.replace(" ", "+")


# ───────────────────────────── syllabus ──────────────────────────────
# (stage, paper code, paper title, [(subject code, title, [(topic code, title, [(mt code, title, priority, minutes, dual, status)])])])

APPSC_G1 = [
    (Stage.PRELIMS, "PI", "Paper I — General Studies", [
        ("HC", "History & Culture", [
            ("AI", "Ancient India", [
                ("PRE-PI-HC-001", "Indus Valley Civilisation — urban planning & trade", "core", 60, False, PUB),
                ("PRE-PI-HC-002", "Vedic Age — society, polity & literature", "important", 45, False, PUB),
                ("PRE-PI-HC-003", "Mauryan Empire — Ashoka's Dhamma & administration", "core", 60, True, PUB),
            ]),
            ("AH", "History of Andhra Pradesh", [
                ("PRE-PI-HC-004", "Satavahanas — administration, trade & Amaravati art", "core", 75, True, PUB),
                ("PRE-PI-HC-005", "Ikshvakus & Buddhist centres — Nagarjunakonda", "important", 40, False, PUB),
            ]),
            ("MI", "Modern India", [
                ("PRE-PI-HC-006", "Revolt of 1857 — causes, leaders & outcome", "core", 50, True, PUB),
            ]),
        ]),
        ("PO", "Indian Polity", [
            ("CF", "Constitutional Framework", [
                ("PRE-PI-PO-001", "Making of the Constitution", "important", 40, False, PUB),
                ("PRE-PI-PO-002", "Fundamental Rights (Part III)", "core", 90, True, PUB),
                ("PRE-PI-PO-003", "Directive Principles of State Policy (Part IV)", "core", 60, True, PUB),
            ]),
            ("FD", "Federalism", [
                ("PRE-PI-PO-004", "Centre–State legislative & financial relations", "important", 60, True, PUB),
            ]),
        ]),
        ("GE", "Geography", [
            ("AP", "Geography of Andhra Pradesh", [
                ("PRE-PI-GE-001", "River systems of Andhra Pradesh", "core", 45, False, PUB),
                ("PRE-PI-GE-002", "Monsoon & climate of peninsular India", "supporting", 35, False, PUB),
            ]),
        ]),
    ]),
    (Stage.PRELIMS, "PII", "Paper II — General Aptitude", [
        ("MA", "Mental Ability", [
            ("RS", "Reasoning", [
                ("PRE-PII-MA-001", "Number series", "important", 30, False, PUB),
                ("PRE-PII-MA-002", "Data interpretation — tables & charts", "important", 45, False, DRAFT),
            ]),
        ]),
    ]),
    (Stage.MAINS, "PIII", "Paper III — Polity, Constitution, Governance, Law & Ethics", [
        ("GV", "Governance & Constitutional Bodies", [
            ("CB", "Constitutional Bodies", [
                ("MNS-PIII-GV-001", "Finance Commission & fiscal federalism", "core", 60, False, PUB),
                ("MNS-PIII-GV-002", "Election Commission of India — independence & reforms", "core", 60, False, PUB),
            ]),
        ]),
    ]),
    (Stage.MAINS, "PIV", "Paper IV — Economy & Development of India and Andhra Pradesh", [
        ("EC", "Economy of Andhra Pradesh", [
            ("RG", "Reorganisation & Development", [
                ("MNS-PIV-EC-001", "AP Reorganisation Act, 2014 — economic consequences", "core", 75, False, PUB),
                ("MNS-PIV-EC-002", "Inflation & monetary policy tools", "important", 60, False, PUB),
            ]),
        ]),
    ]),
]

TGPSC_G1 = [
    (Stage.PRELIMS, "PI", "General Studies & Mental Ability", [
        ("TH", "History & Culture of Telangana", [
            ("MD", "Medieval Telangana", [
                ("TG-PRE-TH-001", "Kakatiyas — polity, temples & tank irrigation", "core", 60, True, PUB),
                ("TG-PRE-TH-002", "Qutb Shahis & Asaf Jahis — Hyderabad State", "important", 50, False, PUB),
            ]),
            ("TM", "Telangana Movement", [
                ("TG-PRE-TM-001", "Telangana statehood movement (1969 – 2014)", "core", 60, True, PUB),
            ]),
        ]),
    ]),
]

# ───────────────────────────── notes ─────────────────────────────────

NOTES = {
    ("appsc", "PRE-PI-HC-001"): {
        "comprehensive": doc(
            h(2, "Indus Valley (Harappan) Civilisation"),
            p("A **Bronze Age** urban culture (mature phase c. 2600–1900 BCE) spread across present-day Pakistan and north-west India. It is the earliest known urban civilisation of South Asia."),
            h(3, "Hallmarks of urban planning"),
            ul(
                "**Grid pattern** streets cutting at right angles; towns divided into a raised citadel and a lower town.",
                "**Covered drains** along streets and standardised **burnt bricks** (ratio 1:2:4).",
                "Public buildings — the **Great Bath** and granary at Mohenjo-daro; dockyard at Lothal.",
            ),
            h(3, "Important sites"),
            table(
                ["Site", "Present location", "Notable find"],
                ["Harappa", "Punjab, Pakistan", "Granaries, workmen's quarters"],
                ["Mohenjo-daro", "Sindh, Pakistan", "Great Bath, 'Priest-King' statue"],
                ["Lothal", "Gujarat, India", "Dockyard, bead-making factory"],
                ["Dholavira", "Gujarat, India", "Water reservoirs, signboard inscription"],
                ["Kalibangan", "Rajasthan, India", "Ploughed field, fire altars"],
            ),
            callout("exam", "**Exam tip:** questions frequently ask you to match a site with its state or its characteristic find. Learn the table above."),
            h(3, "Trade network"),
            diagram("""
flowchart LR
  A[Harappan towns] -->|beads, cotton| B(Lothal dockyard)
  B -->|sea route| C[Mesopotamia]
  C -->|silver, tin| A
""", "Long-distance trade via the Gujarat coast"),
            quote("Mesopotamian texts refer to a trading region called 'Meluhha', generally identified with the Indus region."),
        ),
        "prelims": doc(
            h(3, "Quick revision — IVC"),
            ul(
                "Great Bath → **Mohenjo-daro**",
                "Dockyard → **Lothal** (Gujarat)",
                "Ploughed field → **Kalibangan** (Rajasthan)",
                "Water management → **Dholavira** (UNESCO World Heritage Site, 2021)",
            ),
            callout("warning", "Don't confuse Lothal and Dholavira — both are in Gujarat."),
        ),
    },
    ("appsc", "PRE-PI-HC-003"): {
        "comprehensive": doc(
            h(2, "Mauryan Empire and Ashoka's Dhamma"),
            p("Founded by **Chandragupta Maurya** (c. 321 BCE) with the guidance of Kautilya. Ashoka (c. 268–232 BCE) turned towards Buddhism after the **Kalinga War (c. 261 BCE)**."),
            h(3, "Features of Dhamma"),
            ol(
                "Tolerance towards all sects and respect for elders, teachers and Brahmanas/Shramanas.",
                "Non-violence towards living beings; restraint in ceremonies.",
                "Appointment of **Dhamma Mahamattas** to spread the message.",
            ),
            callout("info", "Dhamma was propagated through **rock edicts and pillar edicts**, mostly in Prakrit using the Brahmi script."),
        ),
        "mains": doc(
            h(3, "Answer framework: Was Dhamma religious or socio-political?"),
            ul(
                "**Intro:** context of Kalinga and a vast, diverse empire.",
                "**Religious dimension:** Buddhist ethics, Third Buddhist Council, missions to Sri Lanka.",
                "**Socio-political dimension:** a moral code to bind a plural society; welfare measures; no doctrine or deity prescribed.",
                "**Conclusion:** a statecraft of ethics — rooted in Buddhism, but addressed to all subjects.",
            ),
        ),
    },
    ("appsc", "PRE-PI-HC-004"): {
        "comprehensive": doc(
            h(2, "The Satavahanas"),
            p("The Satavahanas (c. 1st century BCE – 3rd century CE) ruled the Deccan with centres at **Pratishthana (Paithan)** and **Dhanyakataka (Amaravati)**. **Simuka** is regarded as the founder."),
            h(3, "Administration"),
            ul(
                "Kingdom divided into **aharas** governed by amatyas.",
                "Earliest rulers to grant **tax-free land** to Brahmanas and Buddhist monks.",
                "Coins in lead, potin and copper — many with ship motifs, indicating sea trade.",
            ),
            h(3, "Important rulers"),
            table(
                ["Ruler", "Known for"],
                ["Simuka", "Founder of the dynasty"],
                ["Gautamiputra Satakarni", "Defeated the Shakas (Nasik inscription of Gautami Balashri)"],
                ["Hala", "Compiled the Prakrit anthology 'Gathasaptasati'"],
                ["Yajna Sri Satakarni", "Ship-type coins; revival of power"],
            ),
            h(3, "Amaravati School of Art"),
            p("White limestone reliefs depicting Jataka tales and the life of the Buddha; the **Amaravati stupa** is the finest example."),
            callout("exam", "AP-specific history carries high weight in APPSC papers — connect Satavahana trade to Buddhist sites along the Krishna valley."),
        ),
        "prelims": doc(
            ul("Founder → **Simuka**", "Gathasaptasati → **Hala**", "Capital in Andhra → **Dhanyakataka / Amaravati**",
               "Language of inscriptions → **Prakrit**"),
        ),
        "mains": doc(
            h(3, "Contribution to Deccan's art and economy"),
            ul(
                "**Economy:** maritime trade with Rome (Arikamedu, Motupalli); guilds (srenis) acting as bankers.",
                "**Art:** patronage to Amaravati and Bhattiprolu stupas; rock-cut chaityas at Karle and Nasik.",
                "**Society:** land grants created a new agrarian order; matronymics (Gautamiputra) show the status of queens.",
            ),
        ),
    },
    ("appsc", "PRE-PI-PO-002"): {
        "comprehensive": doc(
            h(2, "Fundamental Rights — Part III (Articles 12–35)"),
            p("Fundamental Rights are **justiciable** — they can be enforced through courts. Dr. B. R. Ambedkar described **Article 32** as the 'heart and soul' of the Constitution."),
            table(
                ["Category", "Articles"],
                ["Right to Equality", "14 – 18"],
                ["Right to Freedom", "19 – 22"],
                ["Right against Exploitation", "23 – 24"],
                ["Freedom of Religion", "25 – 28"],
                ["Cultural & Educational Rights", "29 – 30"],
                ["Right to Constitutional Remedies", "32"],
            ),
            callout("info", "The Right to Property was removed from Part III by the **44th Amendment (1978)**; it is now a legal right under Article 300A."),
            h(3, "Writs under Article 32"),
            diagram("""
flowchart TD
  W[Writs - Art. 32 & 226] --> HC[Habeas Corpus]
  W --> M[Mandamus]
  W --> P[Prohibition]
  W --> C[Certiorari]
  W --> Q[Quo Warranto]
""", "Five writs the Supreme Court and High Courts can issue"),
        ),
        "prelims": doc(
            ul("Art. 17 → abolition of untouchability", "Art. 21A → right to education (86th Amendment, 2002)",
               "Art. 32 → constitutional remedies", "Art. 300A → right to property (legal right)"),
        ),
    },
    ("appsc", "PRE-PI-PO-003"): {
        "prelims": doc(
            h(3, "DPSP in one glance"),
            ul("Borrowed from the **Irish** Constitution", "Non-justiciable (Art. 37)",
               "Art. 40 → village panchayats", "Art. 44 → Uniform Civil Code", "Art. 50 → separation of judiciary from executive"),
        ),
    },
    ("appsc", "PRE-PI-GE-001"): {
        "comprehensive": doc(
            h(2, "Rivers of Andhra Pradesh"),
            p("Most rivers of AP are **east-flowing** and drain into the Bay of Bengal."),
            table(
                ["River", "Notes"],
                ["Godavari", "Longest peninsular river — 'Dakshina Ganga'; Polavaram project"],
                ["Krishna", "Prakasam Barrage at Vijayawada; Nagarjuna Sagar dam"],
                ["Pennar (Penna)", "Flows through Rayalaseema and Nellore"],
                ["Vamsadhara & Nagavali", "North coastal rivers in Srikakulam"],
            ),
        ),
    },
    ("appsc", "MNS-PIII-GV-001"): {
        "comprehensive": doc(
            h(2, "Finance Commission (Article 280)"),
            p("A **quasi-judicial** body constituted by the President every five years to recommend the distribution of tax revenues between the Union and the States."),
            ul("Vertical devolution — share of the divisible pool going to States.",
               "Horizontal devolution — inter-se distribution among States using criteria such as income distance, population, area, forest cover and demographic performance.",
               "Grants-in-aid under Article 275."),
            callout("tip", "Quote the latest commission's vertical devolution share and criteria in mains answers — examiners reward current data."),
        ),
        "mains": doc(
            h(3, "Answer skeleton — role in fiscal federalism"),
            ol("Constitutional basis (Art. 280) and composition.",
               "Correcting vertical imbalance: States' expenditure responsibilities exceed their revenue powers.",
               "Correcting horizontal imbalance: equalisation through formula-based devolution.",
               "Challenges: cesses and surcharges outside the divisible pool; conditional grants.",
               "Way forward: a permanent FC secretariat; outcome-based grants."),
        ),
    },
    ("appsc", "MNS-PIV-EC-001"): {
        "comprehensive": doc(
            h(2, "Andhra Pradesh Reorganisation Act, 2014"),
            p("The Act created **Telangana** (appointed day: **2 June 2014**) with Hyderabad as the common capital for up to ten years."),
            h(3, "Economic consequences for residuary AP"),
            ul("Loss of Hyderabad's services and IT revenue base.", "Revenue deficit in the first year after bifurcation.",
               "Commitments in the Act: Polavaram as a national project, special assistance to backward districts, new capital."),
            callout("exam", "Link answers to **Schedule XIII** (education & infrastructure institutions promised to AP)."),
        ),
    },
    ("tgpsc", "TG-PRE-TH-001"): {
        "comprehensive": doc(
            h(2, "The Kakatiyas (c. 1163 – 1323 CE)"),
            p("Rulers of the Telugu country with their capital at **Orugallu (Warangal)**. Prominent rulers include Ganapatideva and **Rudramadevi**."),
            ul("**Tank irrigation:** Ramappa, Pakhal and Laknavaram lakes.",
               "**Ramappa (Rudreswara) Temple** — UNESCO World Heritage Site (2021).",
               "**Nayankara system** — military-feudal land assignments."),
            callout("info", "Mission Kakatiya (2015) revived thousands of minor irrigation tanks in Telangana."),
        ),
    },
}

GLOSSARY = {
    ("appsc", "PRE-PI-HC-001"): [("Citadel", "The raised, fortified western part of a Harappan city with public buildings."),
                                  ("Meluhha", "Name used in Mesopotamian records for the Indus region.")],
    ("appsc", "PRE-PI-HC-003"): [("Dhamma Mahamatta", "Officers appointed by Ashoka to propagate Dhamma among people.")],
    ("appsc", "PRE-PI-HC-004"): [("Ahara", "An administrative district in the Satavahana kingdom."),
                                  ("Sreni", "A guild of merchants or artisans that also acted as a bank.")],
    ("appsc", "PRE-PI-PO-002"): [("Writ", "A formal order issued by a court commanding or prohibiting an act."),
                                  ("Justiciable", "Enforceable through a court of law.")],
    ("appsc", "MNS-PIII-GV-001"): [("Divisible pool", "The portion of gross central tax revenue shared with States.")],
    ("tgpsc", "TG-PRE-TH-001"): [("Nayankara", "Kakatiya system of assigning land to military chiefs (nayakas).")],
}

VIDEOS = {
    ("appsc", "PRE-PI-HC-001"): [("Harappan town planning — explained", yt("harappan town planning"))],
    ("appsc", "PRE-PI-PO-002"): [("Fundamental Rights — Articles 12 to 35", yt("fundamental rights articles 12 to 35")),
                                  ("Five writs in 10 minutes", yt("five writs indian constitution"))],
    ("tgpsc", "TG-PRE-TH-001"): [("Kakatiya dynasty overview", yt("kakatiya dynasty history"))],
}

# ───────────────────────────── questions ─────────────────────────────
# Prelims: (year, paper_label, qno, mt_code, text, [a,b,c,d], correct, explanation, tags, status)

P1 = "Paper I"
P2 = "Paper II"
APPSC_PRELIMS = [
    (2023, P1, 1, "PRE-PI-HC-001", "Which of the following Harappan sites is located in present-day Gujarat?",
     ["Harappa", "Mohenjo-daro", "Dholavira", "Kalibangan"], "C",
     "Dholavira (and Lothal) are in Gujarat; Kalibangan is in Rajasthan; Harappa and Mohenjo-daro are in Pakistan.", ["ancient-india", "sites"]),
    (2022, P1, 4, "PRE-PI-HC-001", "The 'Great Bath' of the Indus Valley Civilisation was found at:",
     ["Harappa", "Mohenjo-daro", "Lothal", "Rakhigarhi"], "B", "The Great Bath is the best-known structure of Mohenjo-daro's citadel.", ["ancient-india"]),
    (2019, P1, 7, "PRE-PI-HC-001", "A dockyard of the Harappan period has been discovered at:",
     ["Lothal", "Banawali", "Chanhudaro", "Ropar"], "A", "Lothal in Gujarat had a brick-lined dockyard connected to the Sabarmati.", ["ancient-india", "trade"]),
    (2021, P1, 12, "PRE-PI-HC-002", "Which Veda is primarily a collection of melodies meant for chanting?",
     ["Rigveda", "Samaveda", "Yajurveda", "Atharvaveda"], "B", "The Samaveda arranges hymns (mostly from the Rigveda) for singing.", ["vedic-age"]),
    (2018, P1, 15, "PRE-PI-HC-002", "In the Vedic period, 'Sabha' and 'Samiti' were:",
     ["Popular assemblies", "Types of land tax", "Sacrificial rituals", "Occupational guilds"], "A", "", ["vedic-age", "polity-ancient"]),
    (2023, P1, 18, "PRE-PI-HC-003", "Ashoka's policy of Dhamma was propagated mainly through:",
     ["Rock and pillar edicts", "Copper-plate land grants", "Sanskrit temple inscriptions", "Coins with Greek legends"], "A",
     "Ashoka's edicts, mostly in Prakrit using the Brahmi script, carried the message of Dhamma.", ["mauryas"]),
    (2020, P1, 20, "PRE-PI-HC-003", "The Kalinga War was fought in approximately:",
     ["273 BCE", "261 BCE", "232 BCE", "305 BCE"], "B", "Rock Edict XIII describes the war, dated to c. 261 BCE.", ["mauryas"]),
    (2022, P1, 23, "PRE-PI-HC-004", "Who is generally regarded as the founder of the Satavahana dynasty?",
     ["Simuka", "Gautamiputra Satakarni", "Hala", "Yajna Sri Satakarni"], "A", "", ["andhra-history", "satavahanas"]),
    (2019, P1, 26, "PRE-PI-HC-004", "The Prakrit anthology 'Gathasaptasati' is attributed to the Satavahana king:",
     ["Simuka", "Gautamiputra Satakarni", "Hala", "Vasishthiputra Pulumavi"], "C", "", ["andhra-history", "satavahanas", "literature"]),
    (2021, P1, 29, "PRE-PI-HC-005", "Nagarjunakonda flourished as a major Buddhist centre under the:",
     ["Ikshvakus", "Pallavas", "Kakatiyas", "Eastern Chalukyas"], "A", "Vijayapuri (Nagarjunakonda) was the Ikshvaku capital.", ["andhra-history", "buddhism"]),
    (2018, P1, 31, "PRE-PI-HC-005", "Acharya Nagarjuna is associated with which school of Buddhist philosophy?",
     ["Madhyamaka", "Yogachara", "Theravada", "Sautrantika"], "A", "", ["buddhism"]),
    (2022, P1, 40, "PRE-PI-HC-006", "The Revolt of 1857 broke out at Meerut on:",
     ["10 May 1857", "29 March 1857", "4 June 1857", "1 November 1858"], "A",
     "29 March 1857 is the date of Mangal Pandey's action at Barrackpore; the Meerut uprising began on 10 May.", ["modern-india", "1857"]),
    (2020, P1, 43, "PRE-PI-HC-006", "Who led the Revolt of 1857 at Lucknow?",
     ["Rani Lakshmibai", "Begum Hazrat Mahal", "Kunwar Singh", "Nana Saheb"], "B", "", ["modern-india", "1857"]),
    (2023, P1, 61, "PRE-PI-PO-001", "The Constituent Assembly adopted the Constitution of India on:",
     ["26 January 1950", "26 November 1949", "15 August 1947", "9 December 1946"], "B",
     "Adopted on 26 November 1949 (Constitution Day); it came into force on 26 January 1950.", ["polity"]),
    (2022, P1, 64, "PRE-PI-PO-002", "The Right to Constitutional Remedies is provided under Article:",
     ["19", "21", "32", "226"], "C", "Article 226 empowers High Courts but is not a Fundamental Right.", ["polity", "fundamental-rights"]),
    (2019, P1, 66, "PRE-PI-PO-002", "Which Article of the Constitution abolishes untouchability?",
     ["Article 14", "Article 15", "Article 17", "Article 18"], "C", "", ["polity", "fundamental-rights"]),
    (2021, P1, 70, "PRE-PI-PO-003", "The idea of Directive Principles of State Policy was borrowed from the Constitution of:",
     ["USA", "Ireland", "Canada", "United Kingdom"], "B", "", ["polity", "dpsp"]),
    (2018, P1, 72, "PRE-PI-PO-003", "Article 44 of the Constitution of India deals with:",
     ["Uniform Civil Code", "Free legal aid", "Separation of judiciary from executive", "Organisation of village panchayats"], "A",
     "Free legal aid → Art. 39A; separation of judiciary → Art. 50; village panchayats → Art. 40.", ["polity", "dpsp"]),
    (2020, P1, 75, "PRE-PI-PO-004", "In India, residuary powers of legislation are vested in:",
     ["The States", "Parliament", "Both Parliament and the States", "The President"], "B", "Article 248 and Entry 97 of the Union List.", ["polity", "federalism"]),
    (2023, P1, 90, "PRE-PI-GE-001", "Which river is popularly known as 'Dakshina Ganga'?",
     ["Krishna", "Godavari", "Pennar", "Tungabhadra"], "B", "", ["geography", "ap-geography"]),
    (2021, P1, 93, "PRE-PI-GE-001", "The Polavaram irrigation project is being built on the river:",
     ["Krishna", "Godavari", "Vamsadhara", "Pennar"], "B", "", ["geography", "ap-geography"]),
    (2019, P1, 98, "PRE-PI-GE-002", "Which region of India receives most of its rainfall from the north-east monsoon (October–December)?",
     ["Kerala", "Tamil Nadu coast", "Gujarat", "Punjab"], "B", "", ["geography", "climate"]),
    (2022, P2, 5, "PRE-PII-MA-001", "Find the next number in the series: 2, 6, 12, 20, 30, ?",
     ["40", "42", "44", "36"], "B", "Differences are 4, 6, 8, 10, so the next difference is 12: 30 + 12 = 42.", ["aptitude", "series"]),
    (2023, P2, 9, "PRE-PII-MA-001", "Find the next number in the series: 3, 9, 27, 81, ?",
     ["162", "243", "324", "729"], "B", "Each term is multiplied by 3.", ["aptitude", "series"], DRAFT),
]

# Mains: (year, paper_label, qno, mt_code, directive, marks, text, model_answer_doc, tags)
APPSC_MAINS = [
    (2023, "Paper III", 3, "MNS-PIII-GV-001", "Examine", 10,
     "Examine the role of the Finance Commission in strengthening fiscal federalism in India.",
     doc(p("**Introduction:** The Finance Commission (Art. 280) is a constitutional body that recommends how central taxes are shared with States."),
         ul("Addresses **vertical imbalance** by fixing the States' share in the divisible pool.",
            "Addresses **horizontal imbalance** through equalising criteria such as income distance and population.",
            "Recommends grants-in-aid (Art. 275) including for local bodies and disaster management."),
         callout("tip", "Mention a limitation: cesses and surcharges lie outside the divisible pool, shrinking States' effective share."),
         p("**Conclusion:** A rules-based, periodic and independent mechanism — the backbone of cooperative fiscal federalism.")),
     ["fiscal-federalism", "constitutional-bodies"]),
    (2022, "Paper III", 5, "MNS-PIII-GV-002", "Discuss", 10,
     "Discuss the constitutional provisions that safeguard the independence of the Election Commission of India.",
     doc(ul("Art. 324 vests superintendence, direction and control of elections in the ECI.",
            "The Chief Election Commissioner can be removed only like a Supreme Court judge.",
            "Conditions of service of the CEC cannot be varied to his disadvantage after appointment."),
         p("**Gaps:** other Election Commissioners lack the same removal protection; no constitutional bar on post-retirement appointments.")),
     ["constitutional-bodies", "elections"]),
    (2023, "Paper IV", 2, "MNS-PIV-EC-001", "Analyse", 15,
     "Analyse the economic challenges faced by Andhra Pradesh after bifurcation in 2014 and suggest measures to address them.",
     doc(h(3, "Challenges"),
         ul("Loss of Hyderabad's revenue and IT/services base.", "Revenue deficit and high debt burden.",
            "Need to build a new capital and institutions from scratch."),
         h(3, "Measures"),
         ul("Leverage the long coastline — ports, logistics, blue economy.", "Agro-processing in the Krishna–Godavari delta.",
            "Time-bound completion of Polavaram and Schedule XIII institutions."),
         table(["Sector", "Opportunity"], ["Ports", "Visakhapatnam, Krishnapatnam"], ["Agriculture", "Aquaculture, horticulture"])),
     ["ap-economy", "bifurcation"]),
    (2021, "Paper IV", 6, "MNS-PIV-EC-002", "Explain", 15,
     "Explain the major causes of inflation in India and evaluate the tools available to the RBI to control it.",
     doc(ul("**Demand-pull:** fiscal expansion, rising incomes.", "**Cost-push:** fuel prices, supply shocks in food.",
            "**Structural:** supply-chain bottlenecks, low farm productivity."),
         p("**Tools:** repo rate, CRR, SLR, open market operations; the flexible inflation-targeting framework (4% ± 2%).")),
     ["economy", "monetary-policy"]),
    (2022, "Paper II", 4, "PRE-PI-HC-004", "Critically evaluate", 15,
     "Critically evaluate the contribution of the Satavahanas to the art and economy of the Deccan.",
     doc(p("Use the Mains Notes framework for this micro-theme: economy (trade, guilds, coinage), art (Amaravati), society (land grants)."),
         callout("exam", "End with a balanced view: many monuments were built by merchants and guilds, not only by royal patronage.")),
     ["andhra-history", "satavahanas", "art-culture"]),
    (2020, "Paper II", 2, "PRE-PI-HC-003", "Describe", 10,
     "Describe Ashoka's policy of Dhamma. Was it primarily religious or socio-political in nature?",
     doc(p("Dhamma was a code of social ethics — tolerance, non-violence, welfare — promoted through edicts and officers."),
         p("It drew on Buddhist values but did not prescribe rituals or a deity, making it largely a **socio-political** instrument for unity.")),
     ["mauryas"]),
]

TGPSC_PRELIMS = [
    (2023, "Paper I", 11, "TG-PRE-TH-001", "The Ramappa Temple, inscribed as a UNESCO World Heritage Site in 2021, was built during the rule of the:",
     ["Kakatiyas", "Qutb Shahis", "Vishnukundins", "Asaf Jahis"], "A", "", ["telangana-history", "heritage"]),
    (2022, "Paper I", 14, "TG-PRE-TH-001", "What was the capital of the Kakatiya kingdom?",
     ["Orugallu (Warangal)", "Golconda", "Bidar", "Kalyani"], "A", "", ["telangana-history"]),
    (2023, "Paper I", 20, "TG-PRE-TH-002", "The Charminar in Hyderabad was built by:",
     ["Muhammad Quli Qutb Shah", "Mir Osman Ali Khan", "Ibrahim Qutb Shah", "Aurangzeb"], "A", "Built in 1591 by the founder of Hyderabad.", ["telangana-history", "heritage"]),
    (2022, "Paper I", 25, "TG-PRE-TM-001", "Telangana was formed as a separate State on:",
     ["2 June 2014", "1 November 1956", "9 December 2009", "30 July 2013"], "A", "", ["telangana-movement"]),
]

TGPSC_MAINS = [
    (2023, "Paper III", 1, "TG-PRE-TM-001", "Trace", 15,
     "Trace the course of the Telangana statehood movement from 1969 to 2014.",
     doc(ol("1969 agitation (Jai Telangana) over safeguards in the Gentlemen's Agreement.",
            "Revival in the 2000s; formation of political and civil-society platforms.",
            "2009 announcement, Srikrishna Committee (2010), and the AP Reorganisation Act, 2014."),
         p("**Conclusion:** a long democratic movement rooted in questions of water, funds and jobs (neellu, nidhulu, niyamakalu).")),
     ["telangana-movement"]),
    (2022, "Paper II", 4, "TG-PRE-TH-001", "Assess", 10,
     "Assess the significance of Kakatiya tank irrigation and its revival under Mission Kakatiya.",
     doc(ul("Chains of tanks harvested rainwater in a semi-arid plateau.", "Supported paddy cultivation and fisheries.",
            "Mission Kakatiya (2015) restored minor irrigation tanks — desilting improved storage and groundwater recharge.")),
     ["telangana-history", "irrigation"]),
]


# (title, category, description, filename, lines of the generated PDF)
SAMPLE_MATERIALS = [
    ("Fundamental Rights — one-page revision sheet", MaterialCategory.PRELIMS,
     "Articles 12–35 at a glance with the five writs.", "fundamental-rights-revision.pdf",
     ["Right to Equality: Art. 14-18", "Right to Freedom: Art. 19-22", "Right against Exploitation: Art. 23-24",
      "Freedom of Religion: Art. 25-28", "Cultural & Educational Rights: Art. 29-30", "Constitutional Remedies: Art. 32"]),
    ("History & Culture — complete reference notes", MaterialCategory.COMPREHENSIVE,
     "Ancient, Andhra and Modern Indian history in one document.", "history-culture-reference.pdf",
     ["Ancient India: IVC, Vedic Age, Mauryas", "Andhra: Satavahanas, Ikshvakus", "Modern India: Revolt of 1857"]),
    ("Governance answer-writing templates", MaterialCategory.MAINS,
     "Intro-body-conclusion frameworks for constitutional bodies.", "governance-answer-templates.pdf",
     ["Intro: define the body and its article", "Body: powers, functions, issues", "Conclusion: reforms / way forward"]),
]


def minimal_pdf(title, lines):
    """A tiny, valid one-page PDF (so the demo has a real downloadable file)."""
    def esc(s):
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    text = ["BT /F1 20 Tf 60 780 Td (" + esc(title) + ") Tj ET"]
    y = 740
    for line in lines:
        text.append(f"BT /F1 12 Tf 60 {y} Td ({esc(line)}) Tj ET")
        y -= 20
    stream = "\n".join(text).replace("\u2014", "-").replace("\u2013", "-").encode("latin-1", "replace")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


class Command(BaseCommand):
    help = "Load (or refresh) the sample dataset: commissions, tracks, syllabus, notes, PYQs, materials and demo users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--repair-files", action="store_true",
            help="Only re-create the sample PDFs whose files are missing (hosts with a wiped disk), then stop.",
        )
        parser.add_argument(
            "--content-only", action="store_true",
            help="Load the sample content but not the demo accounts (whose passwords are public).",
        )

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts["repair_files"]:
            return self.repair_files()
        users = {"admin": None} if opts["content_only"] else self.seed_users()
        tracks = self.seed_tracks()
        mt_index = {}
        mt_index.update(self.seed_syllabus(tracks[("appsc", "group-1")], APPSC_G1, "appsc"))
        mt_index.update(self.seed_syllabus(tracks[("tgpsc", "group-1")], TGPSC_G1, "tgpsc"))
        self.seed_content(mt_index, users["admin"])
        n = self.seed_prelims(tracks[("appsc", "group-1")], APPSC_PRELIMS, mt_index, "appsc")
        n += self.seed_prelims(tracks[("tgpsc", "group-1")], TGPSC_PRELIMS, mt_index, "tgpsc")
        m = self.seed_mains(tracks[("appsc", "group-1")], APPSC_MAINS, mt_index, "appsc")
        m += self.seed_mains(tracks[("tgpsc", "group-1")], TGPSC_MAINS, mt_index, "tgpsc")
        self.seed_materials(tracks[("appsc", "group-1")], mt_index, users["admin"])
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(tracks)} tracks, {len(mt_index)} micro-themes, {n} prelims + {m} mains questions."
        ))
        if not opts["content_only"]:
            self.stdout.write("Demo logins:  admin@bhavishya.app / Admin@2026   ·   student@bhavishya.app / Student@2026")

    def seed_users(self):
        User = get_user_model()
        out = {}
        for key, email, password, role, name, superuser in [
            ("admin", "admin@bhavishya.app", "Admin@2026", Role.ADMIN, "Content Admin", True),
            ("student", "student@bhavishya.app", "Student@2026", Role.STUDENT, "Demo Student", False),
        ]:
            user, created = User.objects.get_or_create(
                username=email, defaults={"email": email, "is_staff": superuser, "is_superuser": superuser}
            )
            if created:
                user.set_password(password)
                user.save()
            Profile.objects.update_or_create(user=user, defaults={"role": role, "display_name": name})
            out[key] = user
        return out

    def seed_tracks(self):
        groups = {g.slug: g for g in ExamGroup.objects.all()}
        if len(groups) < 2:
            for order, (slug, name) in enumerate([("group-1", "Group 1"), ("group-2", "Group 2")], start=1):
                groups[slug], _ = ExamGroup.objects.update_or_create(slug=slug, defaults={"name": name, "order": order})
        commissions = [
            ("appsc", "APPSC", "Andhra Pradesh Public Service Commission", 1,
             "Group 1 & Group 2 services of the Government of Andhra Pradesh."),
            ("tgpsc", "TGPSC", "Telangana Public Service Commission", 2,
             "Group 1 & Group 2 services of the Government of Telangana."),
        ]
        tracks = {}
        for slug, short, name, order, desc in commissions:
            c, _ = Commission.objects.update_or_create(
                slug=slug,
                defaults={"short_name": short, "name": name, "order": order, "description": desc, "is_active": True},
                # Only on first creation, so an admin's later show/hide choice survives a re-seed.
                create_defaults={
                    "short_name": short, "name": name, "order": order, "description": desc, "is_active": True,
                    "status": PUB if slug == "appsc" else DRAFT,
                },
            )
            for gslug, group in groups.items():
                t, _ = Track.objects.update_or_create(
                    commission=c, group=group,
                    defaults={"tagline": f"Complete preparation workspace for {short} {group.name} Prelims and Mains."},
                )
                tracks[(slug, gslug)] = t
        return tracks

    def seed_syllabus(self, track, spec, ckey):
        index = {}
        for p_order, (stage, pcode, ptitle, subjects) in enumerate(spec, start=1):
            paper, _ = Paper.objects.update_or_create(
                track=track, code=pcode, stage=stage, defaults={"title": ptitle, "order": p_order, "status": PUB}
            )
            for s_order, (scode, stitle, topics) in enumerate(subjects, start=1):
                subject, _ = Subject.objects.update_or_create(
                    paper=paper, code=scode, defaults={"title": stitle, "order": s_order, "status": PUB}
                )
                for t_order, (tcode, ttitle, mts) in enumerate(topics, start=1):
                    topic, _ = Topic.objects.update_or_create(
                        subject=subject, code=tcode, defaults={"title": ttitle, "order": t_order, "status": PUB}
                    )
                    for m_order, (code, title, prio, minutes, dual, status) in enumerate(mts, start=1):
                        mt = MicroTheme.objects.filter(track=track, code=code).first() or MicroTheme(code=code)
                        mt.topic = topic
                        mt.title, mt.order, mt.status = title, m_order, status
                        mt.priority, mt.estimated_minutes, mt.is_dual_stage = prio, minutes, dual
                        mt.save()
                        index[(ckey, code)] = mt
        return index

    def seed_content(self, mt_index, admin):
        for key, notes in NOTES.items():
            mt = mt_index[key]
            for kind, body in notes.items():
                note = Note.objects.filter(micro_theme=mt, kind=kind).first() or Note(micro_theme=mt, kind=kind)
                note.body, note.status, note.updated_by = body, PUB, admin
                note.save()
        for key, terms in GLOSSARY.items():
            mt = mt_index[key]
            for order, (term, definition) in enumerate(terms, start=1):
                GlossaryTerm.objects.update_or_create(
                    micro_theme=mt, term=term, defaults={"definition": definition, "order": order}
                )
        for key, videos in VIDEOS.items():
            mt = mt_index[key]
            for order, (title, url) in enumerate(videos, start=1):
                Video.objects.update_or_create(micro_theme=mt, title=title, defaults={"url": url, "order": order})

    def _upsert_question(self, track, stage, year, label, qno, mt, fields, tags):
        q = Question.objects.filter(track=track, stage=stage, year=year, paper_label=label, question_no=qno).first()
        q = q or Question(track=track, stage=stage, year=year, paper_label=label, question_no=qno)
        q.micro_theme = mt
        for k, v in fields.items():
            setattr(q, k, v)
        q.save()
        q.tags.set(get_or_create_tags(tags))

    def seed_prelims(self, track, rows, mt_index, ckey):
        for row in rows:
            year, label, qno, code, text, opts, correct, expl, tags, *rest = row
            status = rest[0] if rest else PUB
            self._upsert_question(track, Stage.PRELIMS, year, label, qno, mt_index[(ckey, code)], {
                "text": text, "option_a": opts[0], "option_b": opts[1], "option_c": opts[2], "option_d": opts[3],
                "correct_option": correct, "explanation": expl, "status": status,
                "keywords": " ".join(t.replace("-", " ") for t in tags),
            }, tags)
        return len(rows)

    def seed_mains(self, track, rows, mt_index, ckey):
        for year, label, qno, code, directive, marks, text, answer, tags in rows:
            self._upsert_question(track, Stage.MAINS, year, label, qno, mt_index[(ckey, code)], {
                "text": text, "directive": directive, "marks": marks, "model_answer": answer, "status": PUB,
                "keywords": " ".join(t.replace("-", " ") for t in tags),
            }, tags)
        return len(rows)

    def repair_files(self):
        """Sample PDFs live on disk; a host that wipes its disk on restart loses them. Recreate those."""
        fixed = 0
        for m in StudyMaterial.objects.filter(title__in=[s[0] for s in SAMPLE_MATERIALS]):
            if m.file and m.file.storage.exists(m.file.name):
                continue
            spec = next(s for s in SAMPLE_MATERIALS if s[0] == m.title)
            pdf = minimal_pdf(m.title, spec[4])
            m.file.save(spec[3], ContentFile(pdf), save=False)
            m.size_bytes = len(pdf)
            m.save(update_fields=["file", "size_bytes"])
            fixed += 1
        self.stdout.write(f"Sample files: {fixed} restored.")

    def seed_materials(self, track, mt_index, admin):
        def mt(code):
            return mt_index[("appsc", code)]

        levels = {
            "fundamental-rights-revision.pdf": ("micro_theme", mt("PRE-PI-PO-002")),
            "history-culture-reference.pdf": ("subject", mt("PRE-PI-HC-001").topic.subject),
            "governance-answer-templates.pdf": ("topic", mt("MNS-PIII-GV-001").topic),
        }
        specs = [(t, c, levels[f], d, f, lines) for t, c, d, f, lines in SAMPLE_MATERIALS]
        for title, category, (level, node), desc, filename, lines in specs:
            m = StudyMaterial.objects.filter(track=track, title=title).first()
            if m is None:
                m = StudyMaterial(track=track, title=title, uploaded_by=admin)
                pdf = minimal_pdf(title, lines)
                m.file.save(filename, ContentFile(pdf), save=False)
                m.original_filename, m.content_type, m.size_bytes = filename, "application/pdf", len(pdf)
            m.category, m.description, m.status = category, desc, PUB
            m.paper = m.subject = m.topic = m.micro_theme = None
            setattr(m, level, node)
            m.save()
