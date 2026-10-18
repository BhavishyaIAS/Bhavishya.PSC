# Bhavishya PSCs — exam-preparation platform

One organised place to prepare for State Public Service Commission exams
(APPSC, TGPSC, … × Group 1 / Group 2). Everything — notes, videos, glossary,
previous-year questions (PYQs) and study files — hangs off **the syllabus**:
Paper → Subject → Topic → Micro-theme.

| | |
|---|---|
| **Backend** | Python 3.12+, Django 5.2, Django REST Framework, PostgreSQL 16 (full-text search via `tsvector` + GIN) |
| **Frontend** | Next.js 16 (App Router, server components), React 19, TypeScript, hand-written CSS design system |
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

**Admins** also get the **Syllabus Detailer** tab and **Manage**:

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
