# AI Workflow Discovery Studio

This repository contains the local AI Workflow Discovery Studio project and the supporting planning, schema, and handoff files used to build it.

The main app lives in:

```text
discovery-intake-webapp/
```

## First-Time Setup

1. Install Node.js 18 or newer.
2. From this repository root, install local developer dependencies if needed:

```bash
npm install
```

3. Create the local app environment file:

```bash
cp discovery-intake-webapp/.env.example discovery-intake-webapp/.env.local
```

4. Add your `OPENAI_API_KEY` to `discovery-intake-webapp/.env.local`.

5. Start the local app:

```bash
npm run start
```

6. Open:

```text
http://localhost:5177/
```

## Daily Commands

```bash
node scripts/start-local.mjs
node scripts/check-local-setup.mjs
node scripts/check-local-setup.mjs --health
node scripts/check-discovery-layout.mjs
node scripts/check-template-alignment.mjs
node scripts/check-solution-build-recipe.mjs
node scripts/check-enterprise-transfer-kit.mjs
node scripts/check-work-environment-readiness.mjs
node scripts/check-handoff-package-contract.mjs
node scripts/check-reviewer-decision.mjs
node discovery-intake-webapp/scripts/regression-interview-flow.mjs
node scripts/run-stabilization-checks.mjs
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

If you install dependencies with `npm install`, equivalent package shortcuts are available:

```bash
npm run start
npm run check
npm run health
npm run package:doctor
npm run test:interview
npm run test:stabilization
```

The interview regression command is the current guardrail before changing the Discovery interview flow. It confirms the app asks broad workflow questions before moving into detailed data/access/governance follow-ups.

## Git Hygiene

The repo intentionally ignores:

- `.env.local` and other secret files
- local session state in `discovery-intake-webapp/data/`
- generated test outputs
- generated workbook/output folders
- local runtime dependencies

Before sharing with colleagues or an enterprise environment, run:

```bash
git status --short
node scripts/run-stabilization-checks.mjs
```

Recommended review and rollout docs:

- `INSTALL.md` for local setup
- `REVIEWER_GUIDE.md` for coworker review order
- `WORK_COMPUTER_TRANSFER_CHECKLIST.md` for moving the ZIP to a work machine
- `ENTERPRISE_DEPLOYMENT_GUIDE.md` for standing the package up in a work GitHub and Microsoft 365 environment
- `MICROSOFT_365_CONNECTOR_SETUP.md` for Entra, Graph permission, and connector approval planning
- `GITHUB_ENTERPRISE_SETUP.md` for private repository, Actions, secrets, and reviewer setup
- `V1_RELEASE_CHECKLIST.md` for the v1.0 enterprise MVP go/no-go checklist
- `ENVIRONMENT_VARIABLES.md` for local, AI, Microsoft 365, and GitHub environment settings
- `WORK_ENVIRONMENT_STANDUP_RUNBOOK.md` for the exact work-machine / work-GitHub standup sequence and readiness commands
- `EMAIL_TRANSFER_NOTE.md` for a copy-ready self-email/coworker-transfer note
- `COWORKER_REVIEW_BRIEF.md` for a copy-ready reviewer note and feedback format
- `SAFE_SAMPLE_SCENARIOS.md` for synthetic workflows reviewers can run without client data
- `COWORKER_FEEDBACK_TEMPLATE.md` for structured review notes that map to the app feedback loop
- `PILOT_ROADMAP.md` for phased rollout from local review to enterprise readiness
- `CODE_REVIEW_CHECKLIST.md` for structured review comments

Current output contract checks:

- `scripts/check-template-alignment.mjs` verifies Product PDR, Engineering Brief, Business Value, Governance Inputs, Solution Build Recipe, Solution Execution Plan, Enterprise Readiness Brief, Combined Packet, routed questions, workbook rows, package files, field provenance/treatment metadata, supplement-later flags, the visible Template Alignment panel, and the visible connector-readiness previews.
- `scripts/check-solution-build-recipe.mjs` verifies the new ChatGPT + Microsoft Copilot Build Recipe, machine-readable Solution Build Spec, Solution Capability Plan, human-readable/machine-readable Enterprise Connector Contracts, Connector Approval Checklist, Connector Validation Plan, Connector Validation Evidence Log, Connector Build Request Pack, Connector Pilot Runbook, and Connector Promotion Decision Packet across ChatGPT-first, Microsoft 365 Copilot-first, and hybrid agent-routing scenarios.
- `scripts/check-enterprise-readiness-brief.mjs` verifies the Enterprise Readiness Brief with release gates, owners, testing evidence, connector approvals, human checkpoints, and next actions.
- `scripts/check-handoff-package-contract.mjs` verifies the real browser Create Package flow includes the Build Recipe, Solution Build Spec, Solution Capability Plan, Solution Execution Plan, Enterprise Connector Contracts DOCX/Markdown/JSON, Connector Approval Checklist DOCX/Markdown/JSON, Connector Validation Plan DOCX/Markdown/JSON, Connector Validation Evidence Log DOCX/Markdown/JSON, Connector Build Request Pack DOCX/Markdown/JSON, Connector Pilot Runbook DOCX/Markdown/JSON, Connector Promotion Decision Packet DOCX/Markdown/JSON, Enterprise Readiness Brief, manifests, and generated row exports before a review ZIP is shared.
- `scripts/check-evidence-linkage.mjs` verifies optional evidence links to fields, steps, data, systems, decisions, AI patterns, ideas, risks, and routed follow-up questions.
- `scripts/check-reviewer-decision.mjs` verifies coworker feedback snapshots roll up into Reviewer Decision Summary rows, Markdown, package files, and the visible Testing & Release panel.
- `scripts/check-review-package.mjs` verifies the latest review ZIP has required install/review/app files and excludes secrets, generated data, dependencies, local paths, and `.env.local`.
- `scripts/check-enterprise-transfer-kit.mjs` verifies enterprise deployment docs, Microsoft 365/GitHub contracts, GitHub Actions workflow, package wiring, and secret-safe enterprise transfer content.
- `scripts/check-work-environment-readiness.mjs` gives work reviewers a safe pass/warn/fail summary for Node, GitHub setup, `.env.local`, enterprise mode, Microsoft 365 connector mode, health status, and package readiness without printing secrets.
- `scripts/check-review-package-install.mjs --copy-local-env` unzips the latest review ZIP into a temporary clean folder, copies the local env file without printing it, starts the installed app, checks health/root page, and runs enterprise readiness plus handoff package smokes.

## Enterprise Path

Use the local app for self-testing first, then small-team testing, then enterprise hardening. For the v1.0 enterprise MVP path, start with `ENTERPRISE_DEPLOYMENT_GUIDE.md`, keep `CONNECTOR_MODE=mock` until Microsoft 365 approval is complete, and use `V1_RELEASE_CHECKLIST.md` as the go/no-go gate. Before production rollout, expect to replace local storage and local API-key handling with approved Microsoft/enterprise patterns such as Entra ID authentication, approved storage, audit logging, retention policy, and a managed OpenAI/ChatGPT Enterprise access model.
