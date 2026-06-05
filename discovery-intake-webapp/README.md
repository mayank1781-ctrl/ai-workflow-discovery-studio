# Discovery Intake Studio

This is the local AI Workflow Discovery Studio web app for discovering colleague workflows, structuring the intake, and producing Product, Engineering, Business, and governance-input handoff material.

The current product direction is text-first with optional voice. Typed answers and pasted notes are the most reliable primary intake path; dictation and spoken AI replies are available when useful, but the Discovery flow should still work well without voice.

## Run The App

From the repository root:

```bash
node scripts/start-local.mjs
```

Then open:

```text
http://localhost:5177/
```

If normal `node` is unavailable, use the Node runtime bundled with Codex:

```bash
/Applications/Codex.app/Contents/Resources/node scripts/start-local.mjs
```

## Local Environment

The local server reads secrets from:

```text
discovery-intake-webapp/.env.local
```

Start from the template if needed:

```bash
cp discovery-intake-webapp/.env.example discovery-intake-webapp/.env.local
```

Required for live AI extraction:

```text
OPENAI_API_KEY=...
```

Current model defaults:

```text
EXTRACTION_MODEL=gpt-5.5
REALTIME_MODEL=gpt-realtime-2
REALTIME_VOICE=marin
TRANSCRIPTION_MODEL=gpt-4o-transcribe
```

The API key is used only by the local server. Do not commit `.env.local`.

## Stabilization Check

Before changing the Discovery interview flow or sharing a build, run this from the repository root:

```bash
node scripts/run-stabilization-checks.mjs
```

This runs syntax checks, the browser/server DOCX output generator check, local server health, a package ZIP endpoint smoke test, and the Discovery interview regression. The regression verifies that the app asks broad workflow questions before detailed access, data-boundary, value, or governance-heavy questions.

Regression output is written to:

```text
discovery-intake-webapp/test-outputs/regression/interview-flow.json
```

## Discovery Flow

The intended interview sequence is:

1. Capture the submitted idea or starting topic.
2. Ask for the broad workflow frame: workflow name, start, end, and output.
3. Ask for broad components: tools/systems, main inputs/data, and outputs.
4. Ask for the rough numbered A-to-Z process.
5. Drill into each workflow step for actor, tools, access/source mode, input, output, handoff, decisions, data sensitivity, exceptions, and confidence.
6. Surface the most important unanswered questions and handoff readiness gaps.

Governance inputs should be captured lightly as later-review inputs. They should not dominate preparedness scoring during early discovery.

## Manual Self-Test Script

For the current workshop benchmark, use a short self-test like this:

1. Click `New`.
2. Answer: `Let's explore the Workshop use case.`
3. Confirm the next question asks for workflow name, start, end, and output.
4. Answer with the workflow frame.
5. Confirm the next question asks for broad tools/systems, input/data, and outputs before the A-to-Z process.
6. Provide a rough numbered process.
7. Confirm the app starts drilling into Step 1, not the final step and not governance/access questions too early.

Watch that the `Session %` pill moves above `0%` after the first real topic and continues increasing as the frame, components, process skeleton, and step detail are captured.

## Main Surfaces

- `index.html`: app shell
- `app.js`: state, interview routing, AI extraction mapping, exports, and rendering
- `future.css`: primary visual styling
- `server.mjs`: local API server for extraction, transcription, realtime session setup, evidence review, export package generation, and health checks
- `scripts/regression-interview-flow.mjs`: seeded browser regression for Discovery question routing
- `scripts/check-docx-output.mjs`: regression check for browser-generated Word-compatible output downloads
- `scripts/check-workbook-import.mjs`: browser smoke check for importing an exported workbook back into session state
- `scripts/check-evidence-linkage.mjs`: browser smoke check for optional evidence-to-field, record, risk, and question provenance
- `scripts/check-reviewer-decision.mjs`: browser smoke check for Reviewer Decision Summary aggregation, rows, Markdown, and visible panel rendering
- `scripts/check-review-package.mjs`: Node-only package doctor for the latest coworker review ZIP
- `scripts/check-review-package-install.mjs`: clean-install smoke for the latest coworker review ZIP
- `scripts/check-package-zip.mjs`: smoke check for creating and downloading a package ZIP

## Outputs

Analysis Studio > Outputs provides current downloadable briefs for Product PDR, Engineering Brief, Business Value, Governance Inputs, the ChatGPT + Microsoft Copilot Build Recipe, the Solution Execution Plan, Enterprise Readiness Brief, and the Combined Packet. Output fields carry route, source type, treatment, and supplement-later metadata so reviewers can distinguish captured facts, AI inferences, open gaps, and Finance/Ops or governance follow-ups. Optional evidence also exports an Evidence Linkage contract that maps artifacts to suggested fields, records, risks, and open questions. Testing & Release now exports a Reviewer Decision Summary that turns saved coworker feedback into an aggregate decision, reviewer snapshots, quality signals, and comment-derived backlog items. The direct output buttons generate Word-compatible `.docx` files in the browser, and package creation now includes `.docx`, Markdown, JSON, workbook artifacts, execution-plan documents/rows, enterprise connector contract documents/rows, connector approval checklist documents/rows, connector validation plan documents/rows, connector validation evidence log documents/rows, connector build request documents/rows, connector pilot runbook documents/rows, connector promotion decision documents/rows, and enterprise-readiness evidence used for review and connector planning. Use `Download ZIP` to pull the latest local package into one shareable archive.

Analysis Studio > Live Session + Library includes `Import Workbook` for restoring a prior app-exported `.xlsx` workbook into the local session ledger, including core fields, process steps, data handling rows, systems, decisions, ideas, evidence-reference metadata, and evidence linkage rows.

## Roadmap

Next major build phases:

1. Finish stabilization and small refactors around Discovery routing, transcript display, and testability.
2. Continue Template Alignment Pass for Product PDR, Engineering Brief, Business Value, Build Recipe, Solution Execution Plan, Enterprise Readiness Brief, Combined Packet, field provenance, and open-question routing.
3. Improve package generation with richer server-side DOCX/PDF options once the output templates settle.
4. Prepare self-test, share-test, and enterprise-release modes for controlled rollout.
