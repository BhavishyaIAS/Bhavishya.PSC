#!/usr/bin/env bash
# Render build step for the API (see render.yaml at the repo root).
# Render's database is reachable during the build, so the schema and the
# first-run data are set up here.
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --noinput --verbosity 0
python manage.py migrate --noinput

# First deploy only: load the sample content (no demo accounts).
if [ "$(python manage.py shell -c 'from content.models import Track; print(Track.objects.exists())' | tail -1)" != "True" ]; then
  python manage.py seed_demo --content-only
fi
# The free plan wipes local files on every restart; files written during the
# build ship with the deploy, so the sample PDFs come back each time.
python manage.py seed_demo --repair-files

# The first admin: email + password come from the Render dashboard (prompted when
# the Blueprint is created). An existing account is only (re)promoted.
if [ -n "${ADMIN_EMAIL:-}" ]; then
  python manage.py ensure_admin "$ADMIN_EMAIL"
fi
