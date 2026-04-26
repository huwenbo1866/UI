# AGENTS.md

## Stack
- Frontend is SvelteKit/Vite under `src/`; backend is FastAPI under `backend/open_webui/`.
- Backend entrypoint is `open_webui.main:app`; `backend/start.sh` runs uvicorn on `${PORT:-8080}`.
- Built frontend is static output in `build/`; backend serves it if present and the Python wheel packages it as `open_webui/frontend`.

## Package Managers
- Use npm for frontend work even though `pnpm-lock.yaml` exists; CI, Dockerfile, and hatch build all use npm with `package-lock.json`.
- Node is engine-strict and must satisfy `>=18.13.0 <=22.x.x`; CI/Docker use Node 22.
- Install frontend deps with `npm install --force`; CI test job uses `npm ci --force`.

## Frontend Commands
- Dev server: `npm run dev` or `npm run dev:5050`.
- Vite proxies `/api`, `/ws`, `/ollama`, `/openai`, `/oauth`, and `/health` to `BACKEND_DEV_URL` or `http://127.0.0.1:8080`.
- Typecheck: `npm run check`.
- Frontend unit tests: `npm run test:frontend`; focused test: `npm run test:frontend -- path/to/file.test.ts`.
- Format/build CI order is `npm run format`, `npm run i18n:parse`, `git diff --exit-code`, then `npm run build`.

## Pyodide Build Quirk
- `npm run dev` and `npm run build` both run `npm run pyodide:fetch` first.
- `scripts/prepare-pyodide.js` downloads/copies Pyodide assets into `static/pyodide` and can remove/rewrite that directory on version mismatch.
- Do not assume `WEBUI_DISABLE_PYODIDE_FETCH` is honored by the npm scripts; the script does not read it.

## Backend Commands
- Python requires `>=3.11,<3.13`.
- Backend deps are in `backend/requirements.txt` and `pyproject.toml`; `uv.lock` is present.
- Run backend locally from repo root with `cd backend` then `WEBUI_SECRET_KEY=dev-secret uvicorn open_webui.main:app --host 0.0.0.0 --port 8080 --reload`.
- Backend formatting is `npm run format:backend` (`black . --exclude ".venv/|/venv/"`).
- Backend lint script is `npm run lint:backend` (`pylint backend/`), but active CI currently checks backend formatting only.

## Backend Tests
- Backend tests live under `backend/open_webui/test/`.
- Focused pytest from repo root: `PYTHONPATH=backend:backend/open_webui pytest backend/open_webui/test/path/to/test_file.py`.
- Integration-style backend tests may depend on Postgres/docker helpers; prefer focused router/unit tests unless explicitly validating integration behavior.

## Cypress
- Cypress specs live in `cypress/e2e/`; config defaults to `http://localhost:8080`.
- The disabled integration workflow instead waits on `http://localhost:3000` after starting Docker Compose.
- That workflow uses `docker compose -f docker-compose.yaml -f docker-compose.api.yaml -f docker-compose.a1111-test.yaml up --detach --build` and pulls an Ollama model, so do not run it casually.

## Runtime State
- Root `.env` is local and loaded by `backend/open_webui/env.py`; do not modify or commit local secrets.
- Backend data defaults to `backend/data`; use `DATA_DIR` to isolate local/test databases.
- Default DB is SQLite at `sqlite:///${DATA_DIR}/webui.db`; `DATABASE_URL` overrides it and `postgres://` is normalized to `postgresql://`.

## Repo-Specific Features
- Custom learning features are spread across backend routers/services and frontend routes: homework, chapter homework/mindmaps, knowledge defense, learning capabilities, and personalization brain.
- Chapter homework visibility/generation is gated by `KNOWLEDGE_CHAPTER_HOMEWORK_VISIBLE` and `KNOWLEDGE_CHAPTER_HOMEWORK_ENABLED`.
- Personalization brain config defaults to `backend/open_webui/brain/config/personalization_brain.json`; learning capabilities config defaults to `backend/open_webui/data/learning_capabilities.json`.
