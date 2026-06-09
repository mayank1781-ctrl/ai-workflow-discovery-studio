# AI Workflow Discovery Studio

AI Workflow Discovery Studio is an enterprise single-page app for Finance-focused Management Consulting teams. Users run a structured AI discovery interview (or upload a SOP/document) that maps any business workflow into a scored automation opportunity — a 3-layer process grid, a 10-principle score, a tier classification, and an OpenAI-first "recipe" with a business case and DOCX export. It's built for analysts, consultants, transformation leads, AI strategists, and programme managers who want to identify and start building AI automations themselves.

---

## Prerequisites

- **Node.js 24+** — required for the built-in `node:sqlite` module used for session storage.
- **npm 10+**
- **An OpenAI API key** with **GPT-4o** access (document extraction, vision, realtime voice, transcription, and TTS all run on OpenAI).
- **Optional:** an Atlassian account if you want the Jira and Confluence push integrations.

---

## Quick start (local)

```bash
# 1. Clone the repo and enter the app directory
git clone https://github.com/mayank1781-ctrl/ai-workflow-discovery-studio.git
cd ai-workflow-discovery-studio/discovery-intake-webapp

# 2. Create your env file and add your OpenAI key
cp .env.example .env
#   then open .env and set:  OPENAI_API_KEY=sk-...

# 3. Install dependencies (first time only)
npm install

# 4. Start the server
npm run dev
```

Then open the URL printed on startup — **http://localhost:5177** with the sample `.env` (the port follows the `PORT` variable; it falls back to `5173` if `PORT` is unset).

> You can also set the OpenAI key at runtime from the in-app **⚙ Settings** panel — but that key lives in process memory only and is lost on restart. For anything persistent, use the `OPENAI_API_KEY` env var.

---

## Environment variables

Copy `.env.example` to `.env` and fill in what you need. The app runs **completely un-gated** with auth off, so the only variable required for core functionality is `OPENAI_API_KEY`.

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | **Yes** (for all AI) | OpenAI API key with GPT-4o access. Without it, extraction/recipe/voice features return a "not configured" message. |
| `PORT` | No | Port the server binds to. `.env.example` sets `5177`; defaults to `5173` if unset. (Docker/Railway set this for you.) |
| `NODE_ENV` | No | Conventional environment flag. Set to `production` in the Docker image. |
| `AUTH_ENABLED` | No | `true`/`false` (default `false`). When `false` the app is fully open with no sign-in. Set `true` to enable Azure AD SSO. |
| `AUTH_SESSION_SECRET` | If auth on | Secret used to sign session cookies. Generate with `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`. |
| `AUTH_AZURE_TENANT_ID` | If auth on | Azure AD tenant ID for the sign-in app registration. |
| `AUTH_AZURE_CLIENT_ID` | If auth on | Azure AD application (client) ID. |
| `AUTH_AZURE_CLIENT_SECRET` | If auth on | Azure AD client secret. |
| `AUTH_REDIRECT_URI` | If auth on | OAuth callback, e.g. `https://your-host/auth/microsoft/callback`. |
| `AUTH_SESSION_TTL_HOURS` | No | Session lifetime in hours (default `12`). |
| `AUTH_ADMIN_SUBS` | No | Comma-separated Azure object IDs (`sub`) allowed to read the **full** audit log via `GET /api/audit`. Everyone else sees only their own entries. Blank = no admins. |
| `JIRA_CLIENT_ID` | If using Jira/Confluence | Atlassian OAuth 2.0 (3LO) app client ID. **Confluence reuses this same app** — there is no separate Confluence credential. |
| `JIRA_CLIENT_SECRET` | If using Jira/Confluence | Atlassian OAuth app client secret. |
| `JIRA_REDIRECT_URI` | If using Jira/Confluence | Jira OAuth callback (default `http://localhost:5173/api/connectors/jira/callback`). The Confluence callback (`/api/connectors/confluence/callback`) is derived automatically. |

`.env.example` also contains additional optional settings — model selection (`EXTRACTION_MODEL`, `REALTIME_MODEL`, `TRANSCRIPTION_MODEL`, `TTS_MODEL`), Microsoft 365 connector planning, and add-on provider keys. These are optional and safe to leave blank.

> **Never commit `.env` or `.env.local`** — only `.env.example` is tracked.

---

## Data persistence

All persistent data lives under a single `data/` directory:

- **`data/sessions.db`** — every saved discovery session, stored in **SQLite** (via the built-in `node:sqlite`). On first run, any pre-existing flat-JSON sessions in `data/sessions/` are migrated in automatically.
- **`data/connections/`** — Jira and Confluence OAuth tokens (one JSON file per user).
- **`data/settings.json`** — the optional blended-rate override set from the Settings panel.

**This `data/` directory must be persisted across deploys**, or every session and integration token is lost on each restart/redeploy:

- **Docker:** mount a host directory or named volume at `/app/data` (`-v $(pwd)/data:/app/data`).
- **Railway:** attach a **persistent volume** mounted at `/app/data`.

`data/` is git-ignored and never committed.

---

## Deployment — Railway

1. Fork or push the repo to GitHub.
2. Create a new Railway project and connect the GitHub repo.
3. Set the **service root** to `discovery-intake-webapp/` (so the Dockerfile and app resolve).
4. Add all required environment variables in the Railway dashboard (at minimum `OPENAI_API_KEY`; plus the `AUTH_*` and `JIRA_*` vars if you use those features). Railway sets `PORT` automatically.
5. Add a **Railway volume mounted at `/app/data`** so `sessions.db` and connection tokens survive redeploys.
6. Railway auto-deploys on every push to `main`.

> **Note on `railway.json`:** the repo ships a `railway.json` whose `dockerfilePath` is `discovery-intake-webapp/Dockerfile` (repo-root-relative). If you deploy using that file, set the Railway **service root to the repo root** instead of the subfolder so the path resolves. Choose one approach — subfolder root, or repo root with `railway.json` — not both.

---

## Deployment — Docker

```bash
cd discovery-intake-webapp
docker build -t discovery-studio .
docker run -p 3000:3000 --env-file .env -v $(pwd)/data:/app/data discovery-studio
```

The image is based on `node:24-slim`, installs production dependencies with `npm ci --omit=dev`, exposes port `3000`, and sets `PORT=3000` / `NODE_ENV=production`. The `-v $(pwd)/data:/app/data` mount keeps `sessions.db` and tokens on the host so they survive container restarts. A `/health` endpoint (`{ ok, uptime }`) is available for container/orchestrator healthchecks.

---

## Running tests

```bash
npm test
```

Runs **19 `node:test` specs** (`test/**/*.test.mjs`). All 19 must pass before any PR. Also run the syntax check on both source files:

```bash
node --check server.mjs && node --check app.js
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 24, **raw Node HTTP server** — no Express |
| Frontend | **Vanilla JS SPA** (`app.js` + `index.html`), no build step |
| Storage | **SQLite** via built-in `node:sqlite` (`data/sessions.db`); OAuth tokens as JSON in `data/connections/` |
| AI | **OpenAI** — GPT-4o for document/vision extraction; realtime voice, transcription, and TTS |
| Integrations | **Jira & Confluence** push (Atlassian OAuth 2.0 3LO) |
| Auth | Optional **Azure AD SSO** (off by default) |
| Deployment | **Docker** + **Railway** |
| Tests | `node:test` (19 specs) |

---

## Project layout

```
discovery-intake-webapp/
├── server.mjs          # raw Node HTTP server + all API routes
├── app.js              # the Vanilla JS SPA
├── index.html          # SPA shell
├── design-system.css   # ds-* design tokens/classes
├── connectors/         # connector catalog + detector
├── test/               # node:test specs (19)
├── Dockerfile          # node:24-slim production image
├── railway.json        # Railway build/deploy config
├── DEPLOYMENT.md       # condensed deploy checklist
├── .env.example        # env var template (copy to .env)
└── data/               # SQLite DB + tokens + settings (git-ignored, persist this)
```

---

## Currency & scope notes

- All monetary values are **USD / en-US** throughout.
- The output recipe is a **personal implementation guide** — specific enough to start building today in ChatGPT, a Custom GPT, GPT Actions, or the OpenAI Assistants API — not a formal client deliverable.
