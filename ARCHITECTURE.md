# Architecture

AI Workflow Discovery Studio is a local web app with a browser frontend and a lightweight Node.js backend.

## Runtime Shape

```text
Browser UI
  index.html
  app.js
  styles.css / cockpit.css / future.css
  vendor libraries

Local Node server
  discovery-intake-webapp/server.mjs

Local generated data
  discovery-intake-webapp/data/
```

The review package excludes generated local data by default.

## Frontend

Primary files:

- `discovery-intake-webapp/index.html`: app shell and page structure
- `discovery-intake-webapp/app.js`: state model, rendering, interview routing, exports, package payloads, workbook import
- `discovery-intake-webapp/styles.css`: base styles
- `discovery-intake-webapp/cockpit.css`: cockpit layout styles
- `discovery-intake-webapp/future.css`: current visual polish and responsive behavior

The frontend stores the active session in browser `localStorage`. It can export Excel workbooks, generate browser-side DOCX files, create handoff package payloads, and import prior exported workbooks.

## Backend

Primary file:

- `discovery-intake-webapp/server.mjs`

The server handles:

- Static file serving
- `/api/health`
- AI extraction requests when `OPENAI_API_KEY` is configured
- Evidence analysis when AI is configured
- Realtime voice session setup when AI is configured
- Local session save/load
- Handoff package creation and ZIP download

Generated server state is written under:

```text
discovery-intake-webapp/data/
```

That directory is excluded from review packages because it may contain local sessions, package exports, logs, and machine-specific state.

## Review Build Boundary

The review package includes source code, docs, launcher scripts, vendor browser libraries, and sanitized sample extraction JSON used by the demo loader.

It excludes:

- `.env.local`
- API keys
- `node_modules`
- `.git`
- generated server data
- generated output packages
- local test screenshots/workbooks
- local logs and PID files

