# One-command workflows. Requires Python 3.12+, Node 20+, and PostgreSQL 16
# (run `make db` to start one in Docker, or point DATABASE_URL at your own).

PY := backend/.venv/bin/python

.PHONY: setup db migrate seed demo api web dev test lint build

setup:            ## install backend + frontend dependencies
	python3 -m venv backend/.venv
	backend/.venv/bin/pip install -r backend/requirements.txt
	cd frontend && npm ci
	@test -f backend/.env || cp backend/.env.example backend/.env
	@test -f frontend/.env.local || cp frontend/.env.example frontend/.env.local

db:               ## start PostgreSQL 16 in Docker
	docker compose up -d --wait db

migrate:          ## create / update the schema (idempotent)
	$(PY) backend/manage.py migrate

seed: migrate     ## load the sample dataset (idempotent — safe to re-run)
	$(PY) backend/manage.py seed_demo

demo: setup seed  ## everything needed to click through the demo

api:              ## Django API on :8000
	$(PY) backend/manage.py runserver 127.0.0.1:8000

web:              ## Next.js on :3000
	cd frontend && npm run dev

dev:              ## API + web together (Ctrl-C stops both)
	@trap 'kill 0' INT TERM; $(PY) backend/manage.py runserver 127.0.0.1:8000 & (cd frontend && npm run dev) & wait

test:             ## backend test suite
	cd backend && .venv/bin/python manage.py test

lint:             ## typecheck + lint the frontend
	cd frontend && npx tsc --noEmit && npm run lint

build:            ## production build of the frontend
	cd frontend && npm run build
