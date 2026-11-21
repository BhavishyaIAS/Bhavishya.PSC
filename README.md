# Bhavishya PSCs — exam-preparation platform

One organised place to prepare for State Public Service Commission exams
(APPSC, TGPSC, … × Group 1 / Group 2). Everything — notes, videos, glossary,
previous-year questions (PYQs) and study files — hangs off **the syllabus**:
Paper → Subject → Topic → Micro-theme.

| | |
|---|---|
| **Backend** | Python 3.12+, Django 5.2, Django REST Framework, PostgreSQL 16 (full-text search via `tsvector` + GIN) |
| **Frontend** | Next.js 16 (App Router, server components), React 19, TypeScript, hand-written CSS design system, dependency-free WebGL worlds |
| **Rich text** | TipTap editor → ProseMirror JSON, rendered by a whitelist renderer; diagrams in Mermaid |
| **Spreadsheets** | Parsed in the browser (`read-excel-file`, `papaparse`); template built with `write-excel-file` |

Django owns the data and **every permission decision**. Next.js renders pages on
the server, forwarding the user's token from an httpOnly cookie, and the browser
only ever talks to the Next.js origin (`/api/*` is proxied to Django). That means
no CORS setup, and no token is readable by JavaScript.

---

## Quick start

Prerequisites: Python 3.12+, Node 20+, and PostgreSQL 16 (or Docker).

```bash
make db      # PostgreSQL 16 in Docker (skip if you already have one; see backend/.env)
make demo    # install deps, create the schema, load the sample data
make dev     # API on :8000 + web on :3000
```

Open <http://localhost:3000> and log in with a demo account:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bhavishya.app` | `Admin@2026` |
| Student | `student@bhavishya.app` | `Student@2026` |

Without `make`:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                       # adjust DATABASE_URL
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo       # idempotent — safe to re-run
.venv/bin/python manage.py runserver 127.0.0.1:8000

cd ../frontend && npm ci && cp .env.example .env.local && npm run dev
```

`make test` runs the backend tests. `make lint` typechecks and lints the
frontend, and `make build` makes a production build.

### Sample data

`seed_demo` loads two commissions (APPSC, TGPSC) × two groups. **APPSC Group 1**
gets a four-paper syllabus (Prelims + Mains) with 18 micro-themes, rich notes in
all three kinds (tables, callouts, a Mermaid diagram), videos, glossary, 24 Prelims
(one draft) + 6 Mains PYQs and three PDF study files. **TGPSC Group 1** has its
own small syllabus and 4 Prelims + 2 Mains PYQs. **Both Group 2 tracks are left
empty** so you can see the empty states and upload calls-to-action. Every row is
upserted on a natural key, so re-running refreshes instead of duplicating.

To add your own admin: `backend/.venv/bin/python backend/manage.py createsuperuser`
(superusers are admins), or promote a user under **Manage → Users & roles**.

---

## Changing the brand — one file

Everything brand-related lives in **`frontend/src/brand.config.ts`**:

- `brand.name`, `suffix`, `tagline`, `subtitle`: the wordmark and page titles.
- `brand.logo`: replace `frontend/public/brand/logo.png` (square; it's shown in a circle).
  `favicon.png` / `apple-touch-icon.png` sit next to it.
- `brand.colors`: `primary` (strong), `primaryDeep`, `secondary` (deep) and
  `accent`. These feed CSS variables that every button, gradient top bar, badge
  and progress bar uses.
- `commissionThemes`: per-commission colour identity on the landing cards, plus
  **image slots**: `emblem` (round seal) and `cover` (background photo) under
  `frontend/public/brand/commissions/`. A missing image falls back to a monogram
  or a plain gradient.
- `groupThemes`: the colours of the Group 1 / Group 2 blocks.

---

## What an admin can change without code

Everything below is in **Manage** (admins only; every endpoint checks the role again).

| Screen | What it does |
|---|---|
| **Exams** | Add / edit / reorder / show-hide / delete commissions (APPSC, UPSC, any PSC) and the exams inside each (Group 1–4, Civil Services…). A new commission is hidden until shown. Deleting asks for the name to be typed. "Set up UPSC" creates UPSC → Civil Services with 14 General Studies topics. |
| **Topics catalogue** | The topics a learner picks from in Material / Notes: add, rename, drag to reorder, show/hide, delete, and choose each topic's *look* (icon and colour). |
| **Syllabus & notes** | Chapters and sections inside a topic, and the rich-text editor for each section's notes, videos and glossary. |
| **Import notes (Word)** | A whole book into a topic: Heading 1 → chapter, Heading 2 → section. |
| **Site settings** | Dedicate the platform to one exam (and switch back), home-page wording, rename or switch off the three types of notes, default reading font and size, show/hide section codes and the contents box, living worlds on/off (off: a still of each world). |

**Dedicating the platform to one exam** (say UPSC) shows that commission, hides every
other one from students using their ordinary `status` (nothing is deleted), and opens
the home page straight on it. `SiteSettings.restore_visible` remembers what to show
again when the admin switches back. Code: `backend/content/views_site.py`.

## Design: the worlds

Every part of the site is a place, with its own environment, type and controls:

| Where | World | Its design system |
|---|---|---|
| Home page | **The Solar System**: the Sun, eight planets, the Moon and Pluto on their orbits, and beyond Pluto the examinations (UPSC, APPSC, TGPSC) as emblem spheres on tracks of their own | Syncopate capitals for the name and labels, Fraunces italic for the tagline |
| Sign-in, search | Deep space: the real night sky, a spiral galaxy | as above |
| `/exams/<commission>` | That examination's own system: its planet, close | as above |
| Material / Notes | **Mars**: a research station on a plain, rover tracks, Phobos and Deimos in a dusty sky | IBM Plex (Condensed / Sans / Mono); rust, basalt, sand; square, chamfered controls, segmented gauges |
| Prelims PYQs | **The Moon**: a lunar facility and a lander, rover tracks, Earth (with its city lights) and an orbiter in the black sky | Geist / Geist Mono; graphite, lunar white, one restrained blue; machined hairline controls |
| Mains PYQs | **Saturn**: the ringed planet, ice glinting in the rings, five moons | Cormorant Garamond headings, Literata for answers; gold, ivory, umber; ruled editorial pages |
| Syllabus Detailer | **Jupiter**: the banded giant with the Red Spot and the four Galilean moons | Space Grotesk; amber and blue; capsules, orbit rings per subject, the outline drawn as a connected system |
| Progress Tracker | **Earth** from orbit: day side, night-side city lights, satellites, the Moon beside it | Manrope; ocean blue and green; mission-control readings, subject-by-subject bars |
| Manage | The station: a quiet view of space | neutral, everything on paper |

**What is real and what is computed.** Earth is NASA's *Blue Marble* map, and
its night side NASA's *Black Marble* city lights (both public domain), with
computed clouds, oceans and terminator; the star field is
the Tycho-2 star survey. Saturn, Jupiter, Mars and the Moon are rendered
procedurally (physically based shading: ring shadows, limb atmospheres, haze),
not photographs.

**How it is built** (`frontend/src/components/space/`, no dependencies):

| File | What it does |
|---|---|
| `shaders.ts` | One full-screen WebGL2 fragment shader per world (the Solar System, deep space, Saturn, Jupiter, Earth, the Moon, Mars) |
| `solar.ts` | The home page's Solar System in plain TypeScript: every body's size, orbit (J2000 elements), axial tilt and spin; Kepler's equation for where each is now; the camera that fits the system to the page; picking for hover and tap |
| `Universe.tsx` | The renderer: one fixed canvas, compiles a world's shader when it is first needed, places the subject on the page's `[data-stage]` and planets on `[data-orb]` elements, travels between worlds on navigation, renders at a calm frame rate (5–30 fps by world) and only fast while something moves, lowers its resolution on slow devices, rests when hidden or scrolled into the content |
| `SpaceLayer.tsx` | The layers behind every page: a poster still (instant, and all there is without WebGL or with motion off), the canvas, and a veil that deepens as you read |
| `worlds.ts` | Which world a URL is (`worldForPath`) and the planet an examination is (`planetFor`, from its slug or the palette chosen in Manage → Exams) |
| `destinations.ts`, `Gateway.tsx`, `Globe.tsx` | The five worlds inside an exam, the landing-page gateways, the small globes used in navigation |

**The home page** is the Solar System, ray-traced per pixel in deep space (survey stars, drifting
nebulae, a far galaxy, now and then a shooting star, a meteor or a comet, timed by the real clock):

- **The Sun** at the centre: granulation, sunspots, limb darkening, prominences and a corona; it is
  the light, so every planet's day side faces it and its night side turns away as it goes round.
- **The eight planets, the Moon and Pluto**, in their real order, each with its own surface
  (Earth from NASA's map; Jupiter's belts and Great Red Spot; Saturn's rings, casting and catching
  shadow; Uranus on its side with faint upright rings; Pluto's heart), axial tilt and spin. Their
  orbits are elliptical and inclined as the real ones are (J2000 elements) and they start where the
  planets really are today. Distances, sizes and periods are compressed so everything is visible at
  once (periods ∝ √P: Mercury laps the Sun in ~40 s, Pluto in ~20 min). The asteroid belt lies
  between Mars and Jupiter, the icy Kuiper belt around Pluto, whose dashed, steeply tilted orbit
  marks it out as a dwarf planet.
- **Beyond Pluto, the examinations**, in order (UPSC, APPSC, TGPSC as shown to the viewer), each on
  a gold track of its own. They **never revolve**: each is fixed at its place on its track and only
  turns on its own axis. Each is a metal globe in the commission's colours with gold engraving,
  carrying the **official emblem** (`public/brand/emblems/`, the commissions' own artwork,
  undistorted) as an inlaid medallion on both faces; the turn slows as a face comes round, so the
  emblem is held to be read.

Pointing at a planet (or tapping it on a phone) enlarges it, lights it and its orbit, and shows its
name and a line about it; planets lead nowhere. Each examination sphere is a link (over the drawn
sphere) to that examination, and its plate beneath is the same link for the keyboard and screen
readers. `solar.ts` fits the system between the lead and the spheres' row, and places each sphere on
its track straight above its plate. Without WebGL (or with backdrops off) the system is not drawn and
the plates show the emblems instead.

**Day and Night** switch the interface only. Night: deep navy and graphite surfaces, light ink.
Day: ivory, white and pale-lavender surfaces, deep navy ink, antique gold; the home page stays deep
space, and the planetary pages lay a pale atmosphere over their planet so the content stands on light.

`frontend/src/app/worlds.css` holds each world's tokens (`--w-deep`,
`--w-paper`, `--accent`, fonts, radii) and component shapes. Two kinds of ink
everywhere: light ink on dark glass for anything standing on the scene, and the
reader's own light or dark theme, in the world's paper, for anything read at
length (panels, questions, notes, dialogs). The posters in
`public/space/poster-*.webp` are renders of the same shaders.

Reading comfort: text size, a serif option and a focus mode (`ReaderTools.tsx`).
All motion stops for `prefers-reduced-motion` and for the **Animations: off**
switch in the footer.

## Loading previous-year questions in bulk

Small batches go in through **Manage → Bulk upload PYQs**. A whole collection (the
content team's spreadsheets of prelims and mains PYQs with model answers) goes in
as a *bundle*, loaded once by a migration on deploy:

```bash
python manage.py pyq_bundle build prelims.csv mains.csv content/data/pyqs-<date>.json.gz
python manage.py pyq_bundle load content/data/pyqs-<date>.json.gz --dry-run   # see what it would do
```

`content/pyq_bundle.py` documents exactly what `build` does: which exam each row
belongs to, how model answers are cleaned (only material pasted after an answer,
and notes addressed to the compiler, are removed) and given structure, and how
each micro-theme is filed under the exam's notes topics. New chapters are created
as drafts, so Notes, Syllabus and Progress don't change until an admin publishes
them; the questions are published at once. Prelims questions recorded without
their options are kept as answer-only questions. `content/data/pyqs-2026-11.json.gz`
(migration 0007) holds APPSC Group 1 Prelims 2016–2024 and Mains 2008–2025 and
TGPSC Group 1 Mains 2016 and 2024.

UPSC Prelims come from the content team's Word editions instead:
`python manage.py pyq_bundle build-upsc-docx <year-wise.docx> <out.json.gz> --subjectwise <subject-wise.docx>`
(`content/pyq_docx.py`). `content/data/upsc-prelims-2026-11.json.gz` (migration 0010) holds
General Studies Paper I, 1979–2026: 5,930 questions, browsable by year (in paper order) and by
subject on the Prelims PYQ page. A prelims answer can also be "None of the options" (`N`) for
questions whose official wording leaves no option correct.

## Data model

```
Commission ─┐
            ├─ Track (commission × group)      ← the unit of segregation; all content hangs off one
ExamGroup ──┘
  Track → Paper (stage: prelims | mains) → Subject → Topic → MicroTheme
                                                     MicroTheme: code (unique per track), title, order,
                                                     priority, estimated_minutes, is_dual_stage
  MicroTheme → Note ×3 kinds (comprehensive | prelims | mains; rich JSON doc)
             → Video[]   → GlossaryTerm[]
  Track → Question (prelims MCQ | mains descriptive) → MicroTheme, Tag[]
          natural key: (track, stage, year, paper_label, question_no)
  Track → StudyMaterial (file, category, optional Paper | Subject | Topic | MicroTheme)
  User → Profile (role: admin | student, display_name);  User × MicroTheme → StudyProgress
```

Every syllabus node, note, question and material has a `draft | published` status.

## How access control works

- **Visibility is enforced in the data layer.** Each model has a
  `visible_to(user)` queryset (`backend/content/models.py`), and every read
  endpoint goes through it. A student only gets content that is published *and*
  whose whole ancestor chain is published, so unpublishing a paper hides its
  subtree, notes and search hits at once. Drafts return 404 even by direct URL.
- **Admin endpoints** (`/api/manage/*`) require the admin role on every request
  (`IsAdminRole`). The Next.js `/manage` pages check the role too, but only to
  decide what to show.
- **Tracks never leak.** Every study URL carries `commission/group`, and queries
  filter by that track. Mapping a question or file to another track's syllabus
  is rejected.
- **Files are private.** Study materials are stored outside public media. A
  student gets a short-lived, signed, user-bound link (default 5 minutes), and
  visibility is re-checked at download time. Uploads are validated by extension,
  size and magic bytes.
- **Session**: an httpOnly `SameSite=Lax` cookie holding a rotating API token
  (14-day expiry). Cookie-authenticated writes must send `X-Requested-With`, which
  a cross-site form cannot do, so this blocks CSRF.
- **Rich text** is stored as JSON, validated on write against a node/mark
  whitelist, and rendered without `innerHTML`. Links and image URLs are checked
  by protocol, and Mermaid runs with `securityLevel: "strict"`.

## Features

**Students**: choose an exam (commission → group), then use the workspace tabs
**Progress Tracker** (coverage, personal "studied" checklist, per-paper table),
**Prelims PYQs**, **Mains PYQs** and **Material / Notes**. The PYQ vault filters
by year, exam paper, syllabus paper/subject/topic/micro-theme and tag, has
full-text search and pagination, a try-then-reveal answer interaction for MCQs,
and rich model answers. Notes come in three blocks: Comprehensive, Prelims and
Mains. They're read subject by subject, arranged topic- and micro-theme-wise,
with each category's downloadable files below. Each micro-theme page shows its
notes, videos, glossary, mapped PYQs, files and previous/next navigation. There
is one global search across micro-themes, notes, glossary and PYQs, plus a
cross-track progress overview. On phones there's a bottom navigation bar, and
light/dark themes follow the OS with a manual toggle.

Every learner also has the **Syllabus Detailer** (Jupiter): the whole syllabus
with progress per subject, where sections are ticked off as studied. Admins see
the same page as a content workbench (drafts, sections without notes or PYQs, a
link to the Syllabus manager).

**Admins** also get **Manage**:

- **Dashboard**: totals and a per-track table.
- **Syllabus manager**: create, edit and delete papers, subjects, topics and
  micro-themes; drag to reorder (mouse or keyboard); publish a node or a whole
  subtree; set priority, minutes and the dual-stage flag.
- **Content editor** per micro-theme: the three note kinds in a rich editor
  (headings, marks, lists, tables, image upload, callouts, Mermaid diagrams), each
  with its own draft/published status, plus videos and glossary.
- **PYQ manager**: filter, bulk publish/unpublish, create/edit with a rich
  model-answer editor.
- **Bulk upload**: choose commission + group + stage; download an `.xlsx`
  template (with the track's micro-theme codes on a second sheet); the file is
  parsed in the browser and the server validates every row. The preview shows
  valid vs error rows with reasons and new vs update. Only valid rows are
  imported, in one transaction, and failed rows download as a CSV error report.
  Re-running updates rather than duplicates (natural key above).
- **Study materials**: upload into the three categories, map to any syllabus
  level, publish/unpublish, download via signed links.
- **Users & roles**: promote or demote admins.

## Project layout

```
backend/
  config/            settings, URLs (all API routes in api_urls.py)
  accounts/          Profile + roles, cookie-token auth, signup/login/logout
  content/
    models.py        domain model + visible_to() rules
    views_read.py    student-facing API (syllabus, PYQs, notes, search, coverage, downloads)
    views_manage.py  admin API (CRUD, reorder, publish, import, uploads, users)
    importer.py      bulk PYQ validation + atomic upsert
    coverage.py      coverage / progress metrics
    management/commands/seed_demo.py
    tests/
frontend/src/
  brand.config.ts    ← brand
  app/               routes (landing, /exams/[commission]/[group]/…, /search, /progress, /manage/…)
  components/        UI kit (ui/), rich text (rich/), PYQ vault (pyq/), admin tools (manage/)
  lib/               server/client API helpers, types
```

## Configuration

`backend/.env` (see `.env.example`): `SECRET_KEY`, `DEBUG`, `DATABASE_URL`,
`ALLOWED_HOSTS`, `COOKIE_SECURE` (set `true` behind HTTPS), `AUTH_TOKEN_TTL_DAYS`,
`MATERIAL_MAX_UPLOAD_MB`, `IMAGE_MAX_UPLOAD_MB`, `DOWNLOAD_LINK_TTL_SECONDS`, `MEDIA_ROOT`.

`frontend/.env.local`: `API_ORIGIN` (where Next.js reaches Django) and
`NEXT_PUBLIC_SHOW_DEMO_LOGINS` (set `false` in production).

## Deployment

**See [`deploy/README.md`](deploy/README.md).** One Ubuntu 24.04 droplet (Nginx +
Gunicorn + Next.js under systemd + PostgreSQL 16) is set up by
`deploy/setup-server.sh`. After that, every push to `main` deploys through
GitHub Actions (`deploy/deploy.sh`), and `deploy/enable-https.sh` adds a domain
with HTTPS.

**Temporary free hosting** (website on Vercel, API + database on Render's free
plan, with its limits): see [`deploy/VERCEL-RENDER.md`](deploy/VERCEL-RENDER.md).
