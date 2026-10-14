#!/usr/bin/env bash
#
# Deploy the latest commit of the deployed branch (main) on the droplet.
#
#   ssh root@YOUR_IP bash /home/deploy/bhavishya-psc/deploy/deploy.sh
#
# GitHub Actions runs exactly this on every push to main (see
# .github/workflows/deploy.yml). It does only what the incoming commits need:
#   * backend/ changed        -> pip (if requirements changed), check, migrate, collectstatic, restart API
#   * migrations incoming      -> database backup FIRST
#   * frontend/ changed       -> npm ci (if the lockfile changed), build, restart web
#   * a failed build restarts nothing — the site stays on the previous build
#   * the last fully deployed commit is recorded; a deploy that died part way
#     is picked up from there by the next run
set -euo pipefail

# Run from a copy: `git merge` below may rewrite this very file mid-run.
if [ -z "${DEPLOY_COPY:-}" ]; then
  COPY=$(mktemp /tmp/bhavishya-deploy.XXXXXX.sh)
  cp "$0" "$COPY"
  DEPLOY_COPY=1 exec bash "$COPY" "$@"
fi

APP=/home/deploy/bhavishya-psc
STATE=/home/deploy/.deployed-commit
BRANCH=$(cat /home/deploy/.bhavishya-branch 2>/dev/null || echo main)
SITE=$(sed -n 's/^SITE_URL=//p' "$APP/backend/.env")
run() { sudo -u deploy -H "$@"; }
M() { run backend/.venv/bin/python backend/manage.py "$@"; }

# One deploy at a time.
exec 9>/tmp/bhavishya-deploy.lock
flock -w 1800 9

cd "$APP"
echo "== Deploy started $(date '+%F %T %Z') =="

# --- 1. what's incoming ----------------------------------------------------
chown -R deploy:deploy "$APP"
run git fetch --quiet origin "$BRANCH"
AFTER=$(run git rev-parse "origin/$BRANCH")
FROM=$(cat "$STATE" 2>/dev/null || run git rev-parse HEAD)
BUILT=true; [ -f frontend/.next/BUILD_ID ] || BUILT=false

if [ "$FROM" = "$AFTER" ] && [ "$BUILT" = true ]; then
  echo "Already up to date at ${AFTER:0:7}."
  exit 0
fi
echo "==> ${FROM:0:7} -> ${AFTER:0:7}"
run git --no-pager log --oneline "$FROM..$AFTER" 2>/dev/null | sed 's/^/    /' || true

CHANGED=$(run git diff --name-only "$FROM" "$AFTER")
changed() { echo "$CHANGED" | grep -qE "$1"; }
BACKEND=false;    changed '^backend/' && BACKEND=true
MIGRATIONS=false; changed '^backend/.*/migrations/.*\.py$' && MIGRATIONS=true
DEPS_PY=false;    changed '^backend/requirements\.txt$' && DEPS_PY=true
FRONTEND=false;   changed '^frontend/' && FRONTEND=true
DEPS_JS=false;    changed '^frontend/package(-lock)?\.json$' && DEPS_JS=true
[ "$BUILT" = true ] || FRONTEND=true
echo "==> backend=$BACKEND migrations=$MIGRATIONS frontend=$FRONTEND"

# --- 2. back up before the schema moves --------------------------------------
if [ "$MIGRATIONS" = true ]; then
  echo "==> Backing up the database"
  mkdir -p /home/deploy/backups
  sudo -u postgres pg_dump bhavishya | gzip > "/home/deploy/backups/db-pre-deploy-$(date +%Y%m%d-%H%M%S).sql.gz"
fi

# --- 3. take the new code ---------------------------------------------------------
run git merge --quiet --ff-only "origin/$BRANCH"

# --- 4. backend ----------------------------------------------------------------------
if [ "$BACKEND" = true ]; then
  [ "$DEPS_PY" = true ] && { echo "==> pip install"; run backend/.venv/bin/pip install --quiet -r backend/requirements.txt; }
  M check --fail-level ERROR
  [ "$MIGRATIONS" = true ] && { echo "==> Migrating"; M migrate --noinput; }
  M collectstatic --noinput --verbosity 0
fi

# --- 5. frontend: the build is the gate ----------------------------------------------
if [ "$FRONTEND" = true ]; then
  [ "$DEPS_JS" = true ] && { echo "==> npm ci"; run npm --prefix frontend ci --no-audit --no-fund --loglevel=error; }
  echo "==> Building the frontend"
  LOG=$(mktemp /tmp/bhavishya-build.XXXXXX.log)
  chmod 666 "$LOG"
  if ! run npm --prefix frontend run build > "$LOG" 2>&1; then
    echo "!!! BUILD FAILED — nothing restarted; the site is still on the previous build."
    tail -40 "$LOG"
    exit 1
  fi
fi

# --- 6. restart, record, verify ----------------------------------------------------------
[ "$BACKEND" = true ] && systemctl restart bhavishya-api
[ "$FRONTEND" = true ] && systemctl restart bhavishya-web
echo "$AFTER" > "$STATE"
sleep 5

FAILED=false
for path in / /login /api/commissions/; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE$path" || echo 000)
  printf '    %-20s %s\n' "$path" "$code"
  [ "$code" = 200 ] || FAILED=true
done
if [ "$FAILED" = true ]; then
  echo "Deployed ${AFTER:0:7}, but a check failed. Logs: journalctl -u bhavishya-api -u bhavishya-web -n 80"
  exit 1
fi
echo "== Deployed ${AFTER:0:7} =="
