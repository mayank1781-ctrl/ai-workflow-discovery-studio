# Codex Work Computer Handoff

Use this file with Codex on the work computer after you copy and unzip the AI Workflow Discovery Studio review package.

This is written to be path-neutral: wherever you unzip the package, treat that unzipped folder as the project root.

## What This App Is

AI Workflow Discovery Studio is a local web app for interviewing colleagues about time-heavy workflows and turning those conversations into practical AI solution handoff artifacts.

The app is designed for a finance-industry management consulting context where the first goal is not to automate blindly. The goal is to discover, structure, and package workflow opportunities so Product, Engineering, Business, Governance, and enterprise platform reviewers can decide what is worth building.

## Current Build State

Current state: v1.0 enterprise MVP transfer-ready.

The latest validated package passed:

- Full source-checkout stabilization
- Review package doctor
- Enterprise transfer-kit check
- Work-environment readiness check
- Clean-install smoke
- Browser handoff package contract smoke
- Discovery interview regression

Final validated ZIP:

```text
ai-workflow-discovery-studio-review-0.1.0-2026-06-05T11-50-53-306Z.zip
```

Package doctor result:

- No `.env.local`
- No OpenAI API key
- No GitHub token
- No enterprise secret assignment
- No generated app data
- No local user paths

## Core Features

- Discovery interview flow for typed or voice-assisted workflow intake
- Structured Analysis Studio for reviewing captured workflow details
- Optional evidence uploads and evidence-to-field linkage
- Excel/workbook export and workbook import
- DOCX-style output downloads
- Local handoff package ZIP generation
- Product PDR handoff
- Engineering Brief / Solution Architecture brief
- Business Value brief
- Governance Inputs brief
- ChatGPT + Microsoft Copilot Solution Build Recipe
- Solution Execution Plan
- Enterprise Connector Contracts
- Connector Approval Checklist
- Connector Validation Plan
- Connector Validation Evidence Log
- Connector Build Request Pack
- Connector Pilot Runbook
- Connector Promotion Decision Packet
- Enterprise Readiness Brief
- Combined Packet
- Open Question Routing by Product, Engineering, Business, Governance/Security, Finance/Ops, and Domain Sponsor
- Reviewer Decision Summary for colleague feedback
- Enterprise transfer-kit validation and work-environment readiness checks

## Important Runtime Posture

The default enterprise MVP posture is:

```text
ENTERPRISE_MODE=on
CONNECTOR_MODE=mock
```

Keep `CONNECTOR_MODE=mock` until Microsoft 365 / Entra / Graph permissions are approved.

Do not inspect, print, commit, paste, or summarize `.env.local`.

Do not use client confidential, regulated, personal, MNPI, PCI, PHI, or production client data unless the data owner and security reviewer approve that path.

## Files Codex Should Read First

Read these first:

```text
README.md
INSTALL.md
WORK_ENVIRONMENT_STANDUP_RUNBOOK.md
ENTERPRISE_DEPLOYMENT_GUIDE.md
GITHUB_ENTERPRISE_SETUP.md
MICROSOFT_365_CONNECTOR_SETUP.md
ENVIRONMENT_VARIABLES.md
V1_RELEASE_CHECKLIST.md
ENTERPRISE_TRANSFER_MANIFEST.md
```

Then inspect:

```text
discovery-intake-webapp/index.html
discovery-intake-webapp/app.js
discovery-intake-webapp/server.mjs
discovery-intake-webapp/styles.css
discovery-intake-webapp/future.css
discovery-intake-webapp/cockpit.css
scripts/check-work-environment-readiness.mjs
scripts/check-enterprise-transfer-kit.mjs
scripts/check-review-package.mjs
scripts/build-review-package.mjs
scripts/run-stabilization-checks.mjs
```

## Commands Codex Should Prefer

Use direct Node commands unless `npm` is clearly available:

```bash
node scripts/check-work-environment-readiness.mjs
node scripts/check-enterprise-transfer-kit.mjs
node scripts/check-local-setup.mjs --no-health
node scripts/start-local.mjs
node scripts/check-review-package.mjs
node scripts/run-stabilization-checks.mjs
```

If the app is running and Codex needs health checks:

```bash
APP_URL=http://localhost:5177 node scripts/check-local-setup.mjs --health
APP_URL=http://localhost:5177 node scripts/check-work-environment-readiness.mjs --health
```

After GitHub is connected:

```bash
node scripts/check-work-environment-readiness.mjs --github-required
```

After work `.env.local` is populated:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict
```

After Microsoft 365 connector approval:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict --connector-approved
```

## What Codex Should Do On The Work Computer

1. Confirm the unzipped package root has `README.md`, `discovery-intake-webapp/`, `scripts/`, and `enterprise/`.
2. Run `node scripts/check-work-environment-readiness.mjs`.
3. Run `node scripts/check-enterprise-transfer-kit.mjs`.
4. Help create work-only `discovery-intake-webapp/.env.local` from `.env.example` without printing secrets.
5. Help initialize or connect the private work GitHub repository.
6. Confirm `.env.local` is not tracked by Git.
7. Start the app with `node scripts/start-local.mjs`.
8. Confirm `http://localhost:5177/` loads.
9. Keep Microsoft 365 connector mode as `mock` until approval is documented.
10. Before any new package is shared, run:

```bash
node scripts/check-enterprise-transfer-kit.mjs
node scripts/check-work-environment-readiness.mjs
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

## Paste This Into Codex On The Work Computer

```text
Please continue AI Workflow Discovery Studio from this unzipped package folder. Do not restart from scratch.

First read CODEX_WORK_COMPUTER_HANDOFF.md, then read:
README.md
INSTALL.md
WORK_ENVIRONMENT_STANDUP_RUNBOOK.md
ENTERPRISE_DEPLOYMENT_GUIDE.md
GITHUB_ENTERPRISE_SETUP.md
MICROSOFT_365_CONNECTOR_SETUP.md
ENVIRONMENT_VARIABLES.md
V1_RELEASE_CHECKLIST.md

Then inspect:
discovery-intake-webapp/index.html
discovery-intake-webapp/app.js
discovery-intake-webapp/server.mjs
discovery-intake-webapp/styles.css
discovery-intake-webapp/future.css
discovery-intake-webapp/cockpit.css
scripts/check-work-environment-readiness.mjs
scripts/check-enterprise-transfer-kit.mjs

Use direct Node commands:
node scripts/check-work-environment-readiness.mjs
node scripts/check-enterprise-transfer-kit.mjs
node scripts/check-local-setup.mjs --no-health
node scripts/start-local.mjs

Do not inspect or print .env.local. Keep CONNECTOR_MODE=mock until Microsoft 365 connector approval is complete.

Goal: get the app running in this work environment, connect it to a private work GitHub repository, verify package hygiene, and continue enterprise MVP development safely.
```

## Next Development Priorities

Recommended next work-computer development priorities:

1. Stand up private work GitHub repository and branch protection.
2. Run first safe-sample pilot with no client data.
3. Create work-approved `.env.local` for live AI if allowed.
4. Keep Microsoft 365 connector in mock mode until Entra / Graph / data boundary approval.
5. Add real Microsoft 365 connector implementation only after approval gates pass.
6. Improve Solution Build Recipe quality using real safe-sample workflows.
7. Add enterprise audit, retention, and source-boundary evidence once work policies are known.

