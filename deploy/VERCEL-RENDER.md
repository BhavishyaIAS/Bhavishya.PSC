# Temporary hosting: Vercel (website) + Render (API + database), free

A free way to show the platform to people while the droplet setup
([`README.md`](README.md)) waits. Students only ever use the Vercel address; it
forwards `/api/*` to Render behind the scenes.

```
browser ──► bhavishya-psc.vercel.app (Next.js, Singapore)
                 └── /api/* ──► bhavishya-api.onrender.com (Django, Singapore) ──► Render PostgreSQL
```

## Know the limits first

- **The database is deleted 30 days after you create it** (Render gives a 14-day grace
  period to upgrade). Move to the droplet, or upgrade the database in Render, before then.
- **Files you upload (PDFs, note images) disappear** whenever the API restarts or
  redeploys. The sample PDFs come back on their own; yours don't. Don't upload real
  material here.
- **The API sleeps after 15 idle minutes.** The *Keep API awake* GitHub workflow
  (step 3) pings it every 10 minutes so students don't wait ~1 minute for it to wake.
- Uploads larger than ~4.5 MB may be refused on the Vercel side. Test one (step 4).
- Vercel's free plan is for non-commercial use: fine for a preview, not for paying students.

---

## 0. The `main` branch must exist

Both Render and Vercel deploy from `main`. If you haven't yet: GitHub →
**Branches → New branch** → name `main`, source `claude/magical-heisenberg-iou79n`.

## 1. Render: API + database (≈ 8 min)

1. Go to **https://dashboard.render.com** → sign up / log in **with GitHub**.
2. **New + → Blueprint** → connect the **BhavishyaIAS/Bhavishya.PSC** repository
   (authorise Render on GitHub if asked).
3. Render reads `render.yaml` and shows **bhavishya-db** and **bhavishya-api**. It
   asks for two values:
   - `ADMIN_EMAIL`: your email (your admin login)
   - `ADMIN_PASSWORD`: a strong password you choose
4. Click **Apply**. Wait for **bhavishya-api** to show **Live** (about 5 minutes; the
   first build creates the tables and loads the sample syllabus, notes and PYQs).
5. Open the service and **copy its URL** at the top, e.g.
   `https://bhavishya-api.onrender.com` (Render may add a suffix, so copy yours).
   Check it: `https://YOUR-API-URL/api/commissions/` should show some JSON text.

## 2. Vercel: the website (≈ 5 min)

1. Go to **https://vercel.com** → log in with GitHub → **Add New… → Project**.
2. **Import** `BhavishyaIAS/Bhavishya.PSC`.
3. **Root Directory → Edit → choose `frontend`.** This step is important.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `API_ORIGIN` | your Render URL from step 1.5, **without** a trailing `/` |

5. Click **Deploy**. When it finishes you get the site address, e.g.
   `https://bhavishya-psc.vercel.app`.

## 3. Keep the API awake (1 min)

GitHub → the repo → **Settings → Secrets and variables → Actions → Variables tab →
New repository variable**:

| Name | Value |
|---|---|
| `RENDER_API_URL` | your Render URL (same as `API_ORIGIN`) |

Then **Actions → Keep API awake → Run workflow** once to check it turns green.

## 4. Try it

Open your Vercel address → **Log in** with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Click around, then in **Manage → Study materials** upload one PDF over 5 MB. If
it's refused, uploads that big have to wait for the droplet (smaller ones are fine).

---

## After that

- **Updates:** anything merged into `main` redeploys both automatically.
- **Can't log in / forgot the admin password?** Render → bhavishya-api →
  **Environment** → check `ADMIN_EMAIL`, set a new `ADMIN_PASSWORD` →
  **Save, rebuild, and deploy**. Every deploy sets that account's password to
  `ADMIN_PASSWORD` (the free plan has no shell to do it by hand).
- **Logs:** Render → bhavishya-api → **Logs**; Vercel → project → **Logs**.
- **Moving to the droplet later:** follow [`README.md`](README.md); content added
  here would need exporting first (ask for help). Then delete the Render services
  and the *Keep API awake* workflow.
