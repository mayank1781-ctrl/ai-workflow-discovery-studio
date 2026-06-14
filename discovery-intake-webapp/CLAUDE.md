# CLAUDE.md — AI Workflow Discovery Studio

> Keep this file at `discovery-intake-webapp/CLAUDE.md` (the app folder). Claude Code
> loads it automatically every turn. It is the durable source of truth for guardrails
> so they don't have to be re-pasted. The numbered `CC_0x_*.md` prompts reference it.

## What this project is

An enterprise **workflow-to-AI-artifact compiler**. A user describes a workflow (interview,
dictation, pasted notes, uploaded docs). The app extracts a structured workflow grid with
provenance and confidence, scores AI opportunity, computes a business case **only on explicit
user action**, and generates configuration-ready AI artifacts.

It is **not** a prompt writer. It is a configuration-artifact generator and AI work-spec
compiler. It compiles intake evidence into a deployable work pattern, then renders that
pattern into the right artifact.

## Build-tool note (read once, then ignore tool history)

Claude Code is the build agent for this run. Older docs may name a different build tool as
"previous" or "historical" — ignore that framing. **The build-tool choice must never change
the product architecture, app runtime, auth, data handling, tests, or export behavior.**
The app runtime remains OpenAI models. Do not introduce any build-tool name as a product or
runtime dependency.

## Dominant product principle (the trust model)

The app must **never silently invent, drop, change, recompute, or overwrite anything a user
may rely on.** Every relied-on value carries provenance. Generated outputs change only through
explicit user action. Prior versions are preserved. Exports embed saved snapshots and never
recompute. A generated artifact is itself a relied-on output and follows the same rule on
regeneration.

## Architecture constraints — DO NOT BREAK

- Frontend: vanilla JS SPA, `app.js` + `index.html`. No framework migration. No `public/` directory.
- Server: `server.mjs`, raw Node HTTP. **Not Express.**
- Node: 24.x.
- SQLite via `node:sqlite`. The `DATA_DIR` override must remain test-safe.
- Azure AD auth must remain intact. The `/health` bypass must remain intact.
- API keys and secrets stay server-side.
- Exports embed snapshots and must never silently recompute.
- Grid reads go through `getField`. Grid writes go through `patchField`.
- Do not invent a server scoring endpoint. `getStepOpportunityMeta` remains the client scoring
  source unless current code proves otherwise.
- Use `toast()`, never `showToast()`.
- Buttons are never hard-disabled. Use a toast guard + `return`.
- USD / en-US only.

## Content guardrails

- **No firm names anywhere** — not in code, UI, tests, docs, or generated output. Use
  "the firm," "the engagement," or "the team."
- **Banned output phrase:** "work with your development team."

## Product defaults (v2.0, settled)

- Default output: **recommended artifact + optional full bundle**, with an explanation of *why*
  the artifact was recommended.
- Default confidence mode: **Hybrid** (polished, consultant-friendly main artifact; force
  visible caution into the main artifact when missing/uncertain info affects data handling,
  decisions, approvals, exception handling, rules, or client/regulatory risk).
- Default integration mode: **none**. No live APIs, no writeback, no automated approvals, no
  hidden tool use, no fake API schemas. Integrations appear only as "future candidate."
- Default deployment posture: prompt-based or knowledge-based.
- Compliance: **advisory and policy-ready, not a hard MVP blocker.** Still surface assumptions,
  known gaps, human review needs, sensitivity uncertainty, and provenance. Never claim an
  artifact is "compliance approved." Policy-specific language comes from uploaded AI policy
  documents when that feature exists.
- OpenAI-runtime data handling is governed **externally** (partner-level OpenAI relationship +
  internal policy). Not a build blocker. Preserve supporting controls (server-side secrets, auth
  intact, no hidden integrations, provenance visible, explicit user-controlled generation).

## Compiler model (the core v2.0 work)

Pipeline:

```
Discovery intake / documents
  -> HARVEST extraction + user edits
  -> workflow grid (provenance + confidence)
  -> Recipe Deployment Profile
  -> Agent Recipe IR
  -> platform renderer
  -> recommended artifact + optional full bundle
  -> readiness score + test case pack + provenance notes
```

**Recipe Deployment Profile** — decides what kind of artifact is needed. Fields: `recipeScope`
(step | transition | wholeWorkflow), `targetSurface` (chatgptPrompt | customGPT |
microsoft365Copilot | copilotStudio | githubCopilot | genericEnterpriseCopilot | recommend),
`deploymentLevel` (promptOnly | knowledgeBasedAssistant | futureActionEnabled), `integrationMode`
(none | futureCandidate), `confidenceMode` (hybrid), `reuseFrequency`, `dataSensitivity`,
`needsKnowledge`, `needsHumanApproval`, `workflowStability`, `expectedUser`, `defaultOutputMode`.

**Agent Recipe IR** — structured, serializable, generated **before any prose**. Separates:
evidence-backed facts, design choices, assumptions, known gaps, blocked claims, test cases,
do-not-automate notes, human review rules, future integration candidates, provenance summary,
readiness score (plus scope/surface/deployment/integration mode, name, purpose, trigger, inputs,
outputs, systems, knowledge sources, rules, exceptions, data sensitivity, regulatory context).
**Never turn low-confidence AI-inferred values into hard rules.**

**Renderers (keep distinct):** ChatGPT prompt; Custom GPT config; M365 Copilot / Copilot Studio;
GitHub Copilot developer pack (developer-facing — surface in Engineering Doc, not as the main
business artifact); generic enterprise copilot spec; whole-workflow orchestrator; transition
artifact. All renderers consume the same IR.

**Readiness model** — deterministic, visible, **separate from opportunity score**, and never a
blocker. Labels: Ready / Usable with caveats / Draft until confirmed / Not enough information.

**Transition artifacts** — for waiting/approval/decision-pending/sign-off/routing/escalation/
handoff steps. Do not create a fake AI agent. Generate a transition artifact: what is being
waited on, decision owner, required information, AI role, what AI must not decide,
reminder/escalation prompt, next-step routing note, human review rule.

**Track, don't execute (eval suites)** — the app **never calls a live model to run an eval.**
It structures the suite (named, versioned, snapshot-backed acceptance cases with a known-good
expectation and at least one anti-goal) and **records** the pass/fail/n-a outcomes a user (or an
external process) supplies. No auto-run, no live endpoint, no model call anywhere in the eval
flow. The results log is append-only and reuses the audit primitive (hash-chained, frozen, no
edit/delete path); with no results recorded the suite reads "not yet evaluated" and never
fabricates a pass.

## Keep these four concepts separate in code and UI

- **Extraction confidence** — did we capture the workflow correctly.
- **Opportunity score** — how valuable the workflow is for AI assistance.
- **Recipe readiness** — how usable the generated artifact is.
- **Provenance** — where each relied-on value came from.

## Verification gate (run un-piped, do not hide exit codes)

```bash
node --check app.js
node --check server.mjs
npm test
```

Baseline is a 130-test gate (confirm against the actual repo). Tests are deterministic
and must not depend on live LLM calls or external APIs. Do not weaken the auth/storage/
business-case paths.

## Repo

- GitHub: `mayank1781-ctrl/ai-workflow-discovery-studio`
- Local folder: `discovery-intake-webapp`
- Node: 24.x
