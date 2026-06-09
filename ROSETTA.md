# ROSETTA.md — AI Workflow Discovery Studio Lever Handbook

> **What this is:** A decision register for every named lever in this codebase.  
> Each entry tells you what the lever does, exactly where it lives, what changing it affects, and what constraints apply.  
> **Maintain this file alongside every PR** that touches a lever. Keep entries short — five fields, not paragraphs.

---

## How to read an entry

| Field | Meaning |
|---|---|
| **Lever** | The name of the configurable behaviour |
| **Location** | File + approximate line or function name |
| **Current setting** | What it is right now |
| **Effect of changing** | What breaks or improves if you change it |
| **Constraints / warnings** | Hard rules to follow when touching this lever |

---

## Category 1 — AI Behaviour (Prompts & Models)

### L01 — Pattern question model
| Field | Value |
|---|---|
| **Lever** | Which Claude model generates Pattern Handoff questions |
| **Location** | `server.mjs` → `handlePatternHandoff()` (inline `fetch` to the Anthropic API) |
| **Current setting** | `claude-sonnet-4-6` |
| **Effect of changing** | Faster/cheaper (Haiku) or more nuanced (Opus). Haiku may produce vaguer questions. Opus costs ~15× more. |
| **Constraints** | Must use an Anthropic model string. Check `https://docs.anthropic.com/models` for current valid strings. Never hardcode a deprecated model. |

### L02 — Pattern question count
| Field | Value |
|---|---|
| **Lever** | How many questions the AI generates per session |
| **Location** | `server.mjs` → `buildQuestionsPrompt()` → prompt text: `"Generate exactly 3–7 interview questions"` |
| **Current setting** | 3–7 questions |
| **Effect of changing** | Fewer = faster, less user effort, lower coverage. More = better gap resolution, higher fatigue. |
| **Constraints** | Keep the range tight. If you raise the max, also raise `max_tokens` in `handlePatternHandoff()`. The parser expects a JSON array — count is not validated server-side. |

### L03 — Persona skewing logic
| Field | Value |
|---|---|
| **Lever** | Whether questions skew toward Match/Route/Classify (multi-persona) or Retrieve/Generate/Summarise (single-persona) |
| **Location** | `server.mjs` → `buildQuestionsPrompt()` → `multiPersona` boolean + `skewNote` string |
| **Current setting** | Counts distinct personas from `personaActors` cells; >1 unique = multiPersona |
| **Effect of changing** | Change the split condition to adjust when multi-persona logic triggers. Change `skewNote` text to push toward different patterns. |
| **Constraints** | The model reads `skewNote` literally — be specific. Vague instructions produce vague skew. Don't name patterns in the skewNote (breaks the "no AI jargon in questions" rule). |

### L04 — No AI jargon rule in questions
| Field | Value |
|---|---|
| **Lever** | The instruction that prevents the model from using pattern taxonomy words inside question text |
| **Location** | `server.mjs` → `buildQuestionsPrompt()` → `"Do NOT use AI jargon like 'classify', 'match', 'route'..."` |
| **Current setting** | Enforced via prompt instruction |
| **Effect of changing** | Removing it causes questions like "Is this a Classify or Route pattern?" — breaks the product's core promise of operational language. |
| **Constraints** | Never remove. If adding new patterns to the taxonomy, add them to this exclusion list too. |

### L05 — Pattern taxonomy (the 9 patterns)
| Field | Value |
|---|---|
| **Lever** | The fixed list of AI patterns the system can assign |
| **Location** | `server.mjs` → `buildAnalysePrompt()` → definitions block. Also referenced in `app.js` Zone 1 rendering and handoff doc. |
| **Current setting** | Retrieve, Extract, Generate, Summarise, Search, Match, Route, Optimise, Classify |
| **Effect of changing** | Adding a pattern: add to both the definitions block AND the taxonomy list AND update Zone 3 override placeholder text. Removing: check all downstream filters that read `aiPattern.value`. |
| **Constraints** | The analyse prompt says `"use ONLY these exact strings"` — the model will comply. But Zone 1 renders whatever is in `aiPattern.value`, so a misspelled pattern will silently display wrong. Add validation if expanding. |

### L06 — Rationale length cap
| Field | Value |
|---|---|
| **Lever** | Maximum length of AI-generated rationale per step in Zone 3 |
| **Location** | `server.mjs` → `buildAnalysePrompt()` → `"write a one-line rationale (≤ 20 words)"` |
| **Current setting** | ≤20 words |
| **Effect of changing** | Increasing allows more nuance but breaks card layout in Zone 3 (cards have fixed height). Decreasing risks losing context that references the user's answers. |
| **Constraints** | If you raise the limit, also update Zone 3 card CSS to handle overflow text. |

### L07 — AI Mirror summary length
| Field | Value |
|---|---|
| **Lever** | How long the live "What I currently know" summary is |
| **Location** | `server.mjs` → `handleAiMirror()` → prompt text (when PR #55 merges) |
| **Current setting** | 3–5 sentences |
| **Effect of changing** | Shorter = less context for user. Longer = panel takes too much space on Discovery page. |
| **Constraints** | The panel has fixed height. Cap at 5 sentences or add a scroll container. |

### L08 — Extraction model for SOP upload
| Field | Value |
|---|---|
| **Lever** | Which model handles structured extraction from uploaded documents |
| **Location** | `server.mjs` → extraction handler (uses `gpt-5.5` at medium reasoning per startup log) |
| **Current setting** | OpenAI GPT-5.5 at medium reasoning |
| **Effect of changing** | Switch to Claude for a single-vendor setup. Switch to high reasoning for denser SOPs. |
| **Constraints** | Extraction uses OpenAI API, not Anthropic. Requires `OPENAI_API_KEY` in `.env`. Changing model string must match OpenAI's current API. |

### L09 — Live voice model
| Field | Value |
|---|---|
| **Lever** | Which model powers the live voice intake |
| **Location** | `server.mjs` → voice/realtime handler |
| **Current setting** | `gpt-realtime-2` |
| **Effect of changing** | Affects latency, voice quality, and cost of voice-based workflow capture. |
| **Constraints** | Realtime models have different API contracts to standard completions. Do not swap for a standard model without rewriting the streaming handler. |

### L10 — max_tokens for pattern calls
| Field | Value |
|---|---|
| **Lever** | Token budget for pattern question and analysis API calls |
| **Location** | `server.mjs` → `handlePatternHandoff()` → `max_tokens: 1000` |
| **Current setting** | 1000 tokens |
| **Effect of changing** | Reducing may truncate JSON arrays for large workflows (10+ steps). Increasing raises cost and latency. |
| **Constraints** | The response parser expects a complete JSON array. If tokens are exhausted mid-array, `JSON.parse()` will throw. Add a try/catch recovery or raise the limit for workflows >8 steps. |

---

## Category 2 — Data Model

### L11 — Grid schema version
| Field | Value |
|---|---|
| **Lever** | The schema version number embedded in every saved workflow |
| **Location** | `app.js` → `workflowGrid` initialisation → `schemaVersion: 1` |
| **Current setting** | Version 1 |
| **Effect of changing** | Bump to 2 when adding new cell keys. Must also add a migration function that reads v1 files and upgrades them on load. |
| **Constraints** | Never remove existing cell keys without a migration. Old session files will break on load if expected keys are missing. |

### L12 — The 17 cell keys
| Field | Value |
|---|---|
| **Lever** | The complete set of fields captured per workflow step |
| **Location** | `app.js` → grid schema. Keys: `name, personaActors, systemsTools, output, trigger, handoff, humanCheckpoint, timeTaken, frequencyVolume, painFriction, dataSensitivity, aiPattern, description, dataProcessing, rulesDecisionLogic, exceptionBranching, regulatoryContext` |
| **Current setting** | 17 keys |
| **Effect of changing** | Adding a key: add to schema, add to AI extraction prompts, add to Engineering Doc output. Removing: check all downstream renderers. |
| **Constraints** | `aiPattern` is the most referenced key — every output tab reads it. Change it last, test everything. |

### L13 — Cell confidence state machine
| Field | Value |
|---|---|
| **Lever** | The four valid states a cell can be in |
| **Location** | Everywhere a cell is written. States: `"empty"`, `"inferred"`, `"confirmed"`, `"unknown"` |
| **Current setting** | Four states |
| **Effect of changing** | Adding a state (e.g. `"rejected"`) requires updating every renderer that does a state switch, every confidence colour mapping, and Zone 1 dot colours. |
| **Constraints** | `"confirmed"` + `confidence: 1` is the target state for Pattern Handoff writeback (PR #49). Never set `confidence > 1`. |

### L14 — Confidence colour thresholds
| Field | Value |
|---|---|
| **Lever** | Which confidence states map to which display colours |
| **Location** | `app.js` → Zone 1 rendering → `confidenceColor()` function (or equivalent switch) |
| **Current setting** | `confirmed` → teal `#00d4b4`, `inferred` → amber `#f59e0b`, everything else → grey `#4b5563` |
| **Effect of changing** | Change here to adjust the visual signal. E.g. add a pink for `"unknown"` to make it more alarming. |
| **Constraints** | Must not introduce new CSS variables. Use hex literals only. |

### L15 — Session storage path
| Field | Value |
|---|---|
| **Lever** | Where workflow sessions are written to disk |
| **Location** | `server.mjs` → session save handler → `/data/sessions/{id}.json` |
| **Current setting** | `./data/sessions/` relative to the webapp directory |
| **Effect of changing** | Move to an absolute path for server deployments. Or change to a database write for production. |
| **Constraints** | `data/` is in `.gitignore` — never commit session files. If changing the path, update the list endpoint too. |

### L16 — Session ID generation
| Field | Value |
|---|---|
| **Lever** | How session IDs are created |
| **Location** | `app.js` or `server.mjs` → session creation |
| **Current setting** | `ensureSessionMeta()` generates `session-<base36>` ids (not `crypto.randomUUID()`) |
| **Effect of changing** | Could use timestamp-based IDs for sortability, or user-scoped IDs for multi-tenancy. |
| **Constraints** | IDs become filenames — avoid characters that are invalid in file paths (`/`, `\`, `:`, `*`, `?`). UUID is safe. |

### L17 — Handoff state keys (session-only)
| Field | Value |
|---|---|
| **Lever** | The four in-memory state keys used by the Pattern Handoff feature |
| **Location** | `app.js` → state object. Keys: `handoffQuestions`, `handoffAnswers`, `handoffPatterns`, `handoffOverrides` |
| **Current setting** | Session-only — lost on tab switch if not persisted. The pattern interview UI moved to the Discovery page and the standalone Pattern Handoff tab was removed (PR #63); these keys are unchanged. |
| **Effect of changing** | To persist across sessions, save these keys into the session JSON alongside `workflowGrid`. Currently intentionally ephemeral per the original spec. |
| **Constraints** | Do not add these to `workflowGrid` directly — they are interview scaffolding, not workflow data. Save them as a sibling key if persistence is needed. |

### L18 — Answer key format in handoffAnswers
| Field | Value |
|---|---|
| **Lever** | How answers to Pattern Handoff questions are keyed in state |
| **Location** | `app.js` → Zone 2 textarea input handlers |
| **Current setting** | Keyed by question `id` (string). `state.handoffAnswers[questionId]`. |
| **Effect of changing** | If you switch to stepId-based keys, multiple questions per step will collide unless you add a sub-key. |
| **Constraints** | The analyse prompt receives answers as `Object.entries(answers)` — key format affects how the model reads context. Keep consistent with prompt structure. |

---

## Category 3 — Server Architecture

### L19 — HTTP server type
| Field | Value |
|---|---|
| **Lever** | The HTTP server framework (or lack of one) |
| **Location** | `server.mjs` → top-level server creation |
| **Current setting** | Raw Node.js `http.createServer()`. No Express. No Fastify. |
| **Effect of changing** | Adding Express would simplify routing but adds a dependency. The entire routing pattern would need to be rewritten. |
| **Constraints** | Every handler uses `readJson(req)` for body parsing and `sendJson(res, status, obj)` for responses. These are custom helpers — do not use `req.body` (Express pattern) without switching frameworks. |

### L20 — readJson helper
| Field | Value |
|---|---|
| **Lever** | How request bodies are parsed on the server |
| **Location** | `server.mjs` → `readJson()` function |
| **Current setting** | Accumulates chunks, parses JSON. No size limit. |
| **Effect of changing** | Add a byte limit to prevent large payload attacks. For enterprise, cap at ~10MB. |
| **Constraints** | Always `await readJson(req)` inside handlers. Never call it twice on the same request — the stream is consumed on first read. |

### L21 — Binary response pattern
| Field | Value |
|---|---|
| **Lever** | How DOCX and PDF files are streamed back to the client |
| **Location** | `server.mjs` → `handleRecipeBookExport()`, `handleEngineeringDocExport()`, `handlePdfExport()` |
| **Current setting** | `res.writeHead(200, { 'Content-Type': 'application/...', 'Content-Disposition': 'attachment; filename=...' })` then `res.end(buffer)` |
| **Effect of changing** | Do not use `sendJson()` for binary — it will corrupt the file. Always use `res.writeHead()` + `res.end(buffer)` for any non-JSON response. |
| **Constraints** | This is the one place where the raw HTTP pattern is not optional — it's required for binary correctness. |

### L22 — Lazy-load rule for heavy packages
| Field | Value |
|---|---|
| **Lever** | When heavy npm packages are imported |
| **Location** | All export handlers in `server.mjs` |
| **Current setting** | `const { Document, Packer } = await import('docx')` inside the handler function, never at the top of the file |
| **Effect of changing** | Moving to a static top-level import would cause the entire server to fail to start if the package is missing or corrupt. |
| **Constraints** | **Never** add a static top-level import for docx, pdfkit, or any other heavy package. The lazy-load pattern is mandatory for server stability. |

### L23 — Route ordering
| Field | Value |
|---|---|
| **Lever** | The order in which routes are checked in the main request handler |
| **Location** | `server.mjs` → main `requestListener` function, roughly lines 930–1031+ |
| **Current setting** | Specific paths checked with `===`, prefix paths with `startsWith()`, wildcard/static files last |
| **Effect of changing** | A new route added after a catch-all will never be reached. Always add new routes before the static file fallback. |
| **Constraints** | There is no route framework — order is literally the order of `if` statements. New routes go before line ~1031. |

### L24 — PM2 process name
| Field | Value |
|---|---|
| **Lever** | The name PM2 uses to identify the server process |
| **Location** | `discovery-intake-webapp/ecosystem.config.cjs` → `name: 'discovery-studio'` |
| **Current setting** | `discovery-studio` |
| **Effect of changing** | All `npm run pm2:*` scripts reference this name. If you change it, update `package.json` scripts too. |
| **Constraints** | PM2 stores runtime data in `~/.pm2/` — not in the repo. Never commit PM2 runtime files. |

### L25 — Environment variable loading order
| Field | Value |
|---|---|
| **Lever** | Which env files are loaded and in what order |
| **Location** | `server.mjs` → top → `dotenv.config({ path: '<dir>/.env' })` |
| **Current setting** | `.env.local` takes precedence, then `.env`. Real env vars always win over both. |
| **Effect of changing** | To add a `.env.production` or team-specific overrides, adjust the dotenv config call. |
| **Constraints** | `.env` is gitignored. `.env.example` is committed (shows shape, no real values). Never commit a file containing real API keys. |

---

## Category 4 — Frontend Behaviour

### L26 — Toast guard pattern (no hard-disable rule)
| Field | Value |
|---|---|
| **Lever** | How buttons handle empty/invalid state |
| **Location** | Every button click handler in `app.js` |
| **Current setting** | Buttons are NEVER disabled via `disabled` attribute. Guard with `if (!steps.length) { toast('message'); return; }` |
| **Effect of changing** | Adding `button.disabled = true` anywhere breaks the design system rule and causes accessibility issues in the current CSS. |
| **Constraints** | This is a hard rule. Use `toast()` (not `showToast()`) for all user-facing guards. The toast helper is global. |

### L27 — Button loading state
| Field | Value |
|---|---|
| **Lever** | How buttons communicate "working" state during API calls |
| **Location** | Every async button handler in `app.js` |
| **Current setting** | `btn.textContent = 'Working...'` + `btn.style.opacity = '0.6'` + `btn.style.cursor = 'default'` on start. Reversed in `finally` block. |
| **Effect of changing** | Could add a spinner icon. Could change the opacity value. |
| **Constraints** | Always use a `try/finally` pattern so the button always resets even if the API call fails. Never leave a button in loading state permanently. |

### L28 — Tab re-render strategy
| Field | Value |
|---|---|
| **Lever** | How Analysis Studio tabs are rendered when switched |
| **Location** | `app.js` → tab switch handler → `tabContentEl.innerHTML = renderXxx(state)` |
| **Current setting** | Full innerHTML replacement on every tab switch. No virtual DOM. No diffing. |
| **Effect of changing** | For tabs with expensive renders (Zone 1 with 20+ steps), consider caching the HTML string in state and only re-rendering when state changes. |
| **Constraints** | After setting innerHTML, always re-wire event listeners — they are lost on every innerHTML replacement. This is why `mountXxx(state)` is always called after `renderXxx(state)`. |

### L29 — Teal button design contract
| Field | Value |
|---|---|
| **Lever** | The exact CSS for every primary action button |
| **Location** | Inline styles throughout `app.js` |
| **Current setting** | Inline `background:#00d4b4; color:#0d1b2e; border:none; border-radius:6px; padding:8px 16px; font-weight:600; cursor:pointer`. Since PR #60 the same contract is also available as the `ds-btn-teal` class (alongside `ds-btn-ghost` and `ds-btn-grad`) in `design-system.css`. |
| **Effect of changing** | Any deviation creates visual inconsistency. If you want a secondary button style, use an existing `ds-btn-*` class — don't vary the teal button. |
| **Constraints** | No new CSS variables. Prefer the `ds-btn-*` classes for new buttons; inline hex is still fine for one-offs. |

### L30 — No new CSS variables rule
| Field | Value |
|---|---|
| **Lever** | Whether new CSS custom properties can be introduced |
| **Location** | `styles.css`, `cockpit.css`, `future.css`, and `design-system.css` (added in PR #60, linked from `index.html` before `</head>`) |
| **Current setting** | No new CSS custom properties. Shared component styling now lives as `ds-*` utility classes in `design-system.css` (e.g. `ds-panel`, `ds-card`, `ds-chip`, `ds-badge` + `ds-badge-{teal,pink,purple,amber,blue,dim}`, `ds-dot`, `ds-bar-row`, `ds-section-head`, `ds-grad-bar`/`ds-grad-bar-v`, `ds-btn-*`, plus `pulse-dot`/`fade-up` keyframes). One-off colours still use inline hex literals. |
| **Effect of changing** | Breaking the no-variables rule creates invisible coupling — changing a variable affects components you didn't intend. |
| **Constraints** | Use `ds-*` classes for reusable patterns and inline hex (`#00d4b4`) for one-offs. Still no new CSS custom properties. |

### L31 — State object structure
| Field | Value |
|---|---|
| **Lever** | Where application state lives |
| **Location** | `app.js` → global `state` object |
| **Current setting** | Single global mutable object. `state.workflowGrid` is the persisted data. Handoff keys are ephemeral siblings. |
| **Effect of changing** | For multi-session support, `state` needs to be scoped per-session. Currently it holds exactly one workflow at a time. |
| **Constraints** | Never deep-clone `state.workflowGrid` and forget to write back. Always mutate in place or reassign the reference and call the appropriate re-render. |

### L32 — Recipe cache
| Field | Value |
|---|---|
| **Lever** | Where AI-generated recipe prompt text is stored |
| **Location** | `app.js` → `state.recipeCache[step.id]` |
| **Current setting** | Keyed by `step.id`, stored in memory |
| **Effect of changing** | Pattern check logic reads from `state.recipeCache` entries — NOT from `aiPattern` cell value. If you move recipe data, update the pattern check too. |
| **Constraints** | This is an easy thing to get wrong. The handoff doc flags it explicitly: "Pattern check: use state.recipeCache entries, NOT aiPattern cell value." |

---

## Category 5 — Output Generation

### L33 — Recipe Book prompt structure
| Field | Value |
|---|---|
| **Lever** | How the Recipe Book content is generated |
| **Location** | `server.mjs` → `/api/recipe` handler |
| **Current setting** | Sends step data + pattern + pain friction to Claude, receives plain-English recipe per step |
| **Effect of changing** | Adding a "risk level" or "estimated time saving" field means updating the prompt and adding the field to the output render in `app.js`. |
| **Constraints** | Recipe content is what business sponsors read — keep language plain and jargon-free. Test any prompt change with a real SOP. |

### L34 — Engineering Doc sections
| Field | Value |
|---|---|
| **Lever** | Which sections appear in the Engineering Doc and in what order |
| **Location** | `app.js` → `renderAnalysisTabEngineering()` |
| **Current setting** | Redesigned as an engineering spec in PR #64: (1) document-metadata header (`ds-panel`) with sensitivity/steps/version/lock badges + an "inferred by AI" provenance notice, (2) colour-coded implementation gantt (`ds-card`) whose bar colours are tier-driven via `getStepOpportunityMeta` (L47), (3) data-sensitivity bars (`ds-card`, `ds-bar-row`) with an unconfirmed-fields warning, (4) expandable per-step cards (`ds-card`) holding a field table with provenance badges + an `[INPUT]→[SYSTEM]→[OUTPUT]→[HANDOFF]` integration-flow code block. |
| **Effect of changing** | Adding a section requires a new render block; expandable cards toggle a body div via vanilla `display` none/block. |
| **Constraints** | Step cards are collapsed by default — never auto-expand. The export toolbar (Export Engineering Doc / DOCX / PDF) and its handlers must be preserved on this tab. Uses `ds-*` classes; non-ds colours inline hex. |

### L35 — PDF content model
| Field | Value |
|---|---|
| **Lever** | What goes into the PDF export vs the DOCX export |
| **Location** | `server.mjs` → `/api/pdf-export` handler (pdfkit) |
| **Current setting** | PDF is built programmatically from grid data (same structured data as DOCX). Not an HTML render. |
| **Effect of changing** | PDF will never match DOCX styling exactly — pdfkit renders text/shapes, not HTML. Accept this constraint or switch to a headless browser (adds 150MB Chromium dependency). |
| **Constraints** | pdfkit is pure JS, no Chromium. Keep it that way for enterprise deployability. Never add puppeteer/playwright without explicit sign-off. |

### L36 — DOCX lazy-load pattern
| Field | Value |
|---|---|
| **Lever** | How the docx package is loaded for export |
| **Location** | `server.mjs` → all DOCX handlers → `const { Document, Packer, ... } = await import('docx')` |
| **Current setting** | Dynamic import inside the handler function |
| **Effect of changing** | See L22. This is the same rule — never make it a static import. |
| **Constraints** | Both DOCX handlers must lazy-load independently. Do not share a module-level reference. |

---

## Category 6 — Enterprise Readiness Insertion Points

### L37 — Authentication insertion point
| Field | Value |
|---|---|
| **Lever** | Where auth checks go when Phase 5 is built |
| **Location** | `server.mjs` → top of the main `requestListener`, before any route matching |
| **Current setting** | No auth. All routes are public. |
| **Effect of changing** | Add a session cookie check or Bearer token check here. Return 401 before reaching any handler. |
| **Constraints** | Health check endpoint (`/api/health`) should remain unauthenticated for monitoring. Static files may also need to bypass auth or serve a login page. |

### L38 — Multi-tenancy scoping point
| Field | Value |
|---|---|
| **Lever** | Where user identity scopes session data |
| **Location** | `server.mjs` → session save/load handlers → currently uses `sessionId` only |
| **Current setting** | Single-tenant. All sessions are global. |
| **Effect of changing** | Change session path to `/data/sessions/{userId}/{sessionId}.json`. Extract `userId` from the auth token (see L37). |
| **Constraints** | The session list endpoint must filter by userId too — never return another user's sessions. |

### L39 — Audit trail insertion points
| Field | Value |
|---|---|
| **Lever** | Where audit log writes go |
| **Location** | `server.mjs` → after every AI call and every session save. No audit trail exists yet. |
| **Current setting** | No audit trail |
| **Effect of changing** | Add `appendAuditLog({ timestamp, userId, action, inputHash, outputHash })` calls at: (1) every `/api/pattern-handoff` call, (2) every `/api/recipe` call, (3) every session save. Write to `/data/audit/{date}.jsonl`. |
| **Constraints** | JSONL format (one JSON object per line) is append-only — never rewrite audit files. Hash inputs/outputs rather than storing raw content for privacy. |

### L40 — Workflow versioning hook
| Field | Value |
|---|---|
| **Lever** | Where version snapshots are created |
| **Location** | `server.mjs` → session save handler (POST `/api/sessions`) |
| **Current setting** | Overwrites `{sessionId}.json` on every save |
| **Effect of changing** | Change to write `{sessionId}/{timestamp}.json` and keep a `latest.json` pointer. List endpoint returns latest per session. Restore endpoint reads a specific timestamp. |
| **Constraints** | Version files accumulate fast for active sessions. Add a retention policy (keep last 20 versions) before enabling in production. |

### L41 — npm audit posture
| Field | Value |
|---|---|
| **Lever** | Current vulnerability status of npm dependencies |
| **Location** | Run `npm audit` in `discovery-intake-webapp/` |
| **Current setting** | 3 vulnerabilities (2 moderate, 1 high) as of June 2026 |
| **Effect of changing** | Run `npm audit fix` for safe fixes. Avoid `npm audit fix --force` — it allows breaking changes. Review the 1 high severity item before any client-facing deployment. |
| **Constraints** | Do not deploy to an enterprise client environment with unreviewed high-severity vulnerabilities. |

### L42 — Cross-session adjacency hook
| Field | Value |
|---|---|
| **Lever** | Where same-org pattern recognition would be added |
| **Location** | `server.mjs` → session load handler. Currently loads one session in isolation. |
| **Current setting** | No cross-session awareness |
| **Effect of changing** | On session load, also load the 3 most recent sessions for the same userId. Pass their step patterns as "prior context" to the pattern analysis prompt. |
| **Constraints** | Requires multi-tenancy (L38) first. Without userId scoping, cross-session context leaks between organisations. |

---

## Category 7 — Operational Levers

### L43 — Server start command
| Field | Value |
|---|---|
| **Lever** | How the server is started in different environments |
| **Location** | `discovery-intake-webapp/package.json` → scripts block |
| **Current setting** | `npm run dev` or `npm run start` → both run `node server.mjs` (dotenv loads from `.env`) |
| **Effect of changing** | For production, switch to `npm run pm2:start` which uses PM2 for resilience. |
| **Constraints** | Do not use the old long Terminal command with inline `ANTHROPIC_API_KEY=...` — that exposes the key in shell history. Always use `.env`. |

### L44 — Port configuration
| Field | Value |
|---|---|
| **Lever** | Which port the server listens on |
| **Location** | `.env` → `PORT=5177`. Falls back to 5173 if not set. |
| **Current setting** | 5177 |
| **Effect of changing** | Change `PORT` in `.env`. No code changes needed — dotenv propagates it. |
| **Constraints** | If running multiple instances locally, each needs a different PORT. PM2 ecosystem config also references PORT — keep them in sync. |

### L45 — Node.js runtime
| Field | Value |
|---|---|
| **Lever** | Which Node binary runs the server |
| **Location** | Dev: `/Applications/Codex.app/Contents/Resources/node` (v24.x). Production: system node. |
| **Current setting** | Node 24.x locally via Codex |
| **Effect of changing** | For server deployment, use Node LTS (22.x or 24.x). The app uses ESM (`server.mjs`) — requires Node 14+. |
| **Constraints** | Do not downgrade below Node 16 — `crypto.randomUUID()` requires 15.6+. `fetch` built-in requires 18+. |

### L46 — Data directory gitignore
| Field | Value |
|---|---|
| **Lever** | What session and runtime data is excluded from git |
| **Location** | `.gitignore` in `discovery-intake-webapp/` |
| **Current setting** | `.env`, `.env.*` (except `.env.example`), `data/`, `.pm2/`, `node_modules/` |
| **Effect of changing** | If you add new runtime directories (logs, uploads, cache), add them here immediately. |
| **Constraints** | Never commit `.env`. Never commit `data/sessions/`. A leaked API key or client session data is a serious incident. |

### L47 — Opportunity scoring formula
| Field | Value |
|---|---|
| **Lever** | How each step's opportunity label/tier is decided |
| **Location** | `app.js` → `getStepOpportunityMeta(step)` — a shared helper that replaced the old base-3 formula in PR #65 |
| **Current setting** | Two gates run before any productive label. **(1) Regulatory override (first):** if `dataSensitivity.value` contains "very high" **OR** `regulatoryContext.value` is non-empty → `{ label: "Compliance review required", tier: "compliance", priority: null }`. **(2) Completeness gate:** across the 5 critical fields `systemsTools, dataSensitivity, regulatoryContext, output, rulesDecisionLogic`, if fewer than 60% are `confirmed` → `{ label: "Speculative", tier: "speculative", priority: null }`. **Otherwise** time-based: `timeTaken < 30` → Quick Win (priority 1), else Strategic (priority 2). |
| **Effect of changing** | This one helper drives the AI Opportunities badges/bubbles/ranking, the Recipe Book card badge, and the Engineering gantt bar + step-card badge. Changing a threshold (the 0.6 gate, the 30-min cut, or the 5-field set) shifts labels everywhere at once. |
| **Constraints** | Tier → `ds-badge` variant: compliance=`ds-badge-pink`, speculative=`ds-badge-amber`, quick-win=`ds-badge-teal`, strategic=`ds-badge-purple`; tier → solid hex via `opportunityTierColor()`. Gate tiers carry `priority: null` — never render a priority number for them. The regulatory override must run before the completeness gate. |

### L48 — Confidence dot colour thresholds (Zone 1)
| Field | Value |
|---|---|
| **Lever** | The visual colour mapping for step confidence in the pattern interview |
| **Location** | `app.js` → Discovery-page pattern interview (`renderPatternInterview`). The standalone Analysis Studio "Pattern Handoff" tab was removed in PR #63; the interview lives on the Discovery page. |
| **Current setting** | `confirmed` → `#00d4b4` (teal), `inferred` → `#f59e0b` (amber), all else → `#4b5563` (grey) |
| **Effect of changing** | Change here to add a new visual state — e.g. pink for `rejected` or red for `conflicted`. |
| **Constraints** | Must match the confidence state machine (L13). Adding a colour for a state that doesn't exist in the machine is a silent no-op. |

### L49 — Pattern writeback target fields
| Field | Value |
|---|---|
| **Lever** | Which cell fields are updated when Zone 3 "Confirm Patterns" is clicked |
| **Location** | `app.js` → `handleHandoffConfirm()` (PR #49), now invoked from the Discovery-page pattern interview since the Pattern Handoff tab was removed in PR #63 |
| **Current setting** | Sets `step.cells.aiPattern.value`, `state`, and `confidence` for each confirmed step |
| **Effect of changing** | Could also write to `step.cells.description` with the rationale text. Or trigger a Recipe Book regeneration automatically after confirmation. |
| **Constraints** | Never overwrite a cell that is already `"confirmed"` unless the user has explicitly provided an override. Check `handoffOverrides[stepId]` first. |

### L50 — Dump mode merge strategy
| Field | Value |
|---|---|
| **Lever** | How free-text extraction results are merged into the existing grid (PR #56) |
| **Location** | `app.js` → dump mode "Apply" handler |
| **Current setting** | Merge extracted fields into matching steps by name. Add new steps where no name match. Never overwrite `confirmed` cells. |
| **Effect of changing** | Change to a more aggressive merge (overwrite all) for clean-slate imports. Or fuzzy-match step names to handle spelling variations. |
| **Constraints** | The "never overwrite confirmed cells" rule is critical — a human confirmed that data. An AI extraction should never silently undo human corrections. |

---

## Quick Reference Index

| # | Lever | Category |
|---|---|---|
| L01 | Pattern question model | AI Behaviour |
| L02 | Pattern question count | AI Behaviour |
| L03 | Persona skewing logic | AI Behaviour |
| L04 | No AI jargon rule | AI Behaviour |
| L05 | Pattern taxonomy (9 patterns) | AI Behaviour |
| L06 | Rationale length cap | AI Behaviour |
| L07 | AI Mirror summary length | AI Behaviour |
| L08 | Extraction model | AI Behaviour |
| L09 | Live voice model | AI Behaviour |
| L10 | max_tokens for pattern calls | AI Behaviour |
| L11 | Grid schema version | Data Model |
| L12 | The 17 cell keys | Data Model |
| L13 | Cell confidence state machine | Data Model |
| L14 | Confidence colour thresholds | Data Model |
| L15 | Session storage path | Data Model |
| L16 | Session ID generation | Data Model |
| L17 | Handoff state keys | Data Model |
| L18 | Answer key format | Data Model |
| L19 | HTTP server type | Server Architecture |
| L20 | readJson helper | Server Architecture |
| L21 | Binary response pattern | Server Architecture |
| L22 | Lazy-load rule | Server Architecture |
| L23 | Route ordering | Server Architecture |
| L24 | PM2 process name | Server Architecture |
| L25 | Environment variable loading | Server Architecture |
| L26 | Toast guard pattern | Frontend |
| L27 | Button loading state | Frontend |
| L28 | Tab re-render strategy | Frontend |
| L29 | Teal button design contract | Frontend |
| L30 | No new CSS variables rule | Frontend |
| L31 | State object structure | Frontend |
| L32 | Recipe cache | Frontend |
| L33 | Recipe Book prompt structure | Output Generation |
| L34 | Engineering Doc sections | Output Generation |
| L35 | PDF content model | Output Generation |
| L36 | DOCX lazy-load pattern | Output Generation |
| L37 | Authentication insertion point | Enterprise |
| L38 | Multi-tenancy scoping point | Enterprise |
| L39 | Audit trail insertion points | Enterprise |
| L40 | Workflow versioning hook | Enterprise |
| L41 | npm audit posture | Enterprise |
| L42 | Cross-session adjacency hook | Enterprise |
| L43 | Server start command | Operational |
| L44 | Port configuration | Operational |
| L45 | Node.js runtime | Operational |
| L46 | Data directory gitignore | Operational |
| L47 | Opportunity scoring (gated — `getStepOpportunityMeta`) | Operational |
| L48 | Confidence dot colour thresholds | Operational |
| L49 | Pattern writeback target fields | Operational |
| L50 | Dump mode merge strategy | Operational |

---

*Last updated: June 2026 — reflects PRs #41–#65 merged on main.*  
*Update this file as part of every PR that changes a lever. Keep entries short.*

---

## PHASE 8 — DOCUMENT ANALYSIS MODE (planned)

### Core Decision
Two explicit input modes — do not merge into one:

MODE 1: "Interview a workflow" (current)
Conversational discovery. One person, one workflow, voice or 
text, progressive questioning, next-best-question arc.
PRs 1-4 (Phase 7) build this out fully.

MODE 2: "Analyse a document" (Phase 8)
User uploads SOP, process doc, Excel tracker, or screenshot.
AI extracts full workflow family, presents structured mapping 
for confirmation, populates multiple grid rows simultaneously.
No interview arc — document IS the primary source.

Both modes feed into the same 3-layer grid and Recipe output.
Difference is input path only, not output.

### Attachment Analysis — Per File Type

Word/PDF:
- Extract workflow chain first: numbered steps, role mentions, 
  system names, handoff language ("sends to", "receives from", 
  "escalates to")
- Map to Layer 1 Flow & Dependencies + Layer 2 Who's Involved
- Any compliance/regulatory language auto-flags Layer 3 Sensitivity
- Confidence: "inferred from document" (not confirmed)

Excel:
- Distinguish type first:
  - Has process/status columns → tracker → extract workflow 
    states as steps
  - Has data columns → artifact → extract data handling 
    for Layer 3 Data Flow and Sensitivity
- Confidence: "inferred from document" (not confirmed)

Screenshots:
- Vision-analyse for: system name (Layer 1 Systems & Tools), 
  data fields visible (Layer 3 Data Flow), actor/role shown 
  (Layer 2 Who's Involved)
- Auto-populate those three layers directly
- Confidence: "inferred from screenshot" (not confirmed)

All attachment-extracted data: next-best-question system asks 
user to confirm highest-importance extracted values rather than 
asking from scratch.

### SOP Mode — What Makes It Different

1. AI reads and maps, does not interview. 
   Arc inverts: "I found these workflows — confirm or correct"
   not "tell me about your workflow"

2. SOPs are non-linear — contain workflow families:
   main process + exception paths + escalation procedures + 
   role definitions. Grid must handle multiple related workflows 
   with shared components (same systems/roles across steps).

3. SOP metadata to capture: owner, last updated, version, 
   whether current. Relevant for compliance and Recipe output.

### Current Coverage Estimate
Interview mode: 75% complete after Phase 7 PRs 1-4
SOP/document mode: ~20% — attachment handling exists but 
not doing structured extraction. Grid handles one workflow 
well but has no workflow-family concept. No 
"multiple workflows found" UI state yet.

### Phase 8 Build Sequence (planned, not started)
8a: Document upload entry point — distinct from interview mode
8b: Per-filetype extraction paths (Word/PDF, Excel, screenshot)
8c: Workflow family detection — "I found N workflows in this 
    document" UI state, multiple grid rows populated at once
8d: Confirmation arc — AI presents mapping, user confirms 
    or corrects, confidence upgrades to confirmed
8e: SOP metadata capture (owner, version, date)

### Extraction Prompt Scope Decision
PR 3 (Phase 7): conversational extraction only — 3-layer 
structure, 6 principles, next-best-question priority queue.
Document analysis path added separately in Phase 8 to avoid 
diluting either prompt.
