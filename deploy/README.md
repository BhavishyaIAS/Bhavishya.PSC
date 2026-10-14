# Deploying Bhavishya PSCs

One DigitalOcean droplet runs everything: Nginx in front, Next.js (`bhavishya-web`)
and Django/Gunicorn (`bhavishya-api`) under systemd, PostgreSQL 16 on the same box.
After the one-time setup, **every push to `main` deploys itself** through GitHub Actions.

```
browser ──► nginx :80/:443 ──► /api/*, /django-admin/*  ──► gunicorn 127.0.0.1:8000 ──► PostgreSQL
                          └──► everything else         ──► next start 127.0.0.1:3000
```

Total time: about 20 minutes, mostly waiting for the first build.

---

## 1. Make sure `main` exists

Deploys follow the `main` branch. Merge the work branch into `main` on GitHub
(open a pull request from `claude/magical-heisenberg-iou79n` → `main`, or create
`main` from it under **Branches**), and make `main` the default branch in
**Settings → General**.

## 2. Create the droplet

DigitalOcean → **Create → Droplets**:

- **Region**: Bangalore (BLR1), closest to your students.
- **Image**: Ubuntu **24.04 (LTS) x64**.
- **Size**: Basic → Regular → **2 GB RAM / 1 CPU** ($12/mo). 1 GB is too small to build the site.
- **Authentication**: SSH key (add yours), or a root password.
- Optional: enable **backups** (+20%). The setup also takes nightly backups on the droplet itself.

Note the droplet's **IP address**.

## 3. Make a key for GitHub Actions (on your computer)

This key lets GitHub run the deploy script, and nothing else. In PowerShell
(Windows) or a terminal (Mac/Linux):

```powershell
ssh-keygen -t ed25519 -C github-deploy -f "$HOME/.ssh/bhavishya-gh-deploy"
```

Press Enter twice when asked for a passphrase (it must be empty). You now have
two files: `bhavishya-gh-deploy` (private) and `bhavishya-gh-deploy.pub` (public).
Show the public one and copy it; it's one line starting `ssh-ed25519`:

```powershell
Get-Content "$HOME/.ssh/bhavishya-gh-deploy.pub"     # Mac/Linux: cat ~/.ssh/bhavishya-gh-deploy.pub
```

## 4. Run the setup on the droplet

Log in: `ssh root@YOUR_IP` (or use **Console** on the droplet's page in DigitalOcean).
Then paste the following, with your email and the public key from step 3:

```bash
curl -fsSL https://raw.githubusercontent.com/BhavishyaIAS/Bhavishya.PSC/main/deploy/setup-server.sh -o setup.sh
ADMIN_EMAIL=you@example.com \
GITHUB_DEPLOY_PUBKEY='ssh-ed25519 AAAA…paste…the…whole…line github-deploy' \
bash setup.sh
```

It takes 5–10 minutes. It installs everything, creates the database, loads the
sample syllabus/notes/PYQs (without the public demo accounts), builds the site and
starts it. At the end it prints:

- **your admin password** (shown once). Log in at `http://YOUR_IP`, then change
  it under `http://YOUR_IP/django-admin/` → Users, or with
  `sudo -u deploy /home/deploy/bhavishya-psc/backend/.venv/bin/python /home/deploy/bhavishya-psc/backend/manage.py changepassword you@example.com`;
- the values for the GitHub secrets (next step).

Options: `DEMO=none` starts with empty tracks instead of the sample content;
`DEMO=full` also creates the demo accounts (public passwords, only for a throwaway
demo box). The script is safe to run again.

## 5. Turn on auto-deploy

GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**, three times:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | the droplet IP |
| `DEPLOY_KNOWN_HOSTS` | the line the setup printed: `YOUR_IP ssh-ed25519 AAAA…` |
| `DEPLOY_SSH_KEY` | the **private** key: the whole content of `bhavishya-gh-deploy` (no `.pub`), including the `-----BEGIN…` / `-----END…` lines |

Test it: **Actions → Deploy → Run workflow**. It should finish green with
"Already up to date". From now on every merge to `main` goes live in a few minutes.

---

## Day to day

| Task | How |
|---|---|
| Deploy | merge to `main`, or **Actions → Deploy → Run workflow**, or `ssh root@IP bash /home/deploy/bhavishya-psc/deploy/deploy.sh` |
| Logs | `journalctl -u bhavishya-api -u bhavishya-web -n 100 --no-pager` |
| Restart | `systemctl restart bhavishya-api bhavishya-web` |
| Add an admin | `sudo -u deploy /home/deploy/bhavishya-psc/backend/.venv/bin/python /home/deploy/bhavishya-psc/backend/manage.py ensure_admin someone@example.com`, or promote a signed-up user in **Manage → Users & roles** |
| Backups | nightly at 02:00 IST to `/home/deploy/backups/` (database + uploaded files, 14 days). Copy them off the box now and then, or enable DigitalOcean backups |
| Restore the DB | `gunzip -c /home/deploy/backups/db-….sql.gz \| sudo -u postgres psql bhavishya` (into an empty database) |

What a deploy does: it only does the work the new commits need. Python packages,
migrations, static files and an API restart happen only when `backend/` changed,
with a **database backup before any migration**. A rebuild and web restart happen
only when `frontend/` changed. **If the build fails, nothing is restarted** and the
site stays on the previous version. Fix the code and push again; the next deploy
picks up where the failed one stopped.

## Adding a domain + HTTPS later

1. At your domain registrar, add an **A record** pointing the domain (e.g.
   `psc.bhavishyaias.com`) at the droplet IP. Wait until it resolves.
2. On the droplet:
   ```bash
   bash /home/deploy/bhavishya-psc/deploy/enable-https.sh psc.bhavishyaias.com you@example.com
   ```
   (`WWW=1 bash …` to include `www.` as well.) This gets a free Let's Encrypt
   certificate (auto-renewing), redirects HTTP to HTTPS, and switches Django to
   secure cookies. Everyone signs in again once.

Until then the site runs on plain HTTP: passwords cross the network unencrypted,
so add a domain before inviting real students.
