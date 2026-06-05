# Code Review Checklist

Use this checklist for pre-testing review.

## Install And Local Runtime

- [ ] `node scripts/start-local.mjs` starts the app.
- [ ] `http://localhost:5177/` loads.
- [ ] `.env.local` is not included in the package.
- [ ] `node scripts/check-enterprise-transfer-kit.mjs` passes.
- [ ] `node scripts/check-work-environment-readiness.mjs` passes with only expected pre-work warnings.
- [ ] `node scripts/check-review-package.mjs` passes on the shared ZIP.
- [ ] The app still works in review mode without an API key, with live AI features unavailable or limited.

## Discovery Flow

- [ ] The app starts with a simple topic/workflow question.
- [ ] It asks workflow boundary questions before detailed data or governance questions.
- [ ] It asks for broad tools/systems/inputs/outputs before the A-to-Z process.
- [ ] It drills into one step at a time after the process skeleton exists.
- [ ] The visible transcript rail shows recent turns without overlap.

## Product / Engineering / Business Logic

- [ ] Product PDR output separates validated facts, assumptions, and open questions.
- [ ] Engineering Brief captures systems, data, access, integration, functional, and non-functional requirements.
- [ ] Business Value output treats missing Finance/Ops data as supplement-later.
- [ ] Governance Inputs identify data sensitivity, environment, review path, and human review needs without blocking early discovery unnecessarily.
- [ ] Build Recipe chooses a sensible ChatGPT-first, Microsoft 365 Copilot-first, or hybrid route from workflow/source/action signals.
- [ ] Build Recipe includes practical ChatGPT instructions, Copilot/M365 implementation guidance, connector assumptions, human controls, MVP build steps, and a test script.
- [ ] Solution Build Spec JSON has route, ChatGPT platform, Microsoft Copilot platform, connector candidates, controls, MVP steps, test criteria, open questions, and source-signal metadata.
- [ ] Solution Capability Plan JSON has ChatGPT capabilities, Microsoft Copilot capabilities, human checkpoints, build phases, open questions, and clear first-MVP versus later-hardening guidance.
- [ ] Enterprise Connector Contracts JSON has one row per connector candidate with source system, auth model, read/write mode, data boundary, permissions, required approvals, setup steps, and test criteria.
- [ ] Enterprise Readiness Brief has release gates, gate owners, testing evidence, connector approvals, evidence-needed items, and next actions without claiming production readiness too early.

## Outputs

- [ ] Excel export works.
- [ ] DOCX downloads work.
- [ ] Create Package works.
- [ ] Download ZIP works.
- [ ] Import Workbook restores a prior exported workbook into the session ledger.
- [ ] Solution Build Recipe appears in the UI, workbook, output manifest, template alignment contract, and local handoff package.
- [ ] `solution-build-spec.json` and `solution-build-spec-rows.json` appear in the local handoff package and output manifest.
- [ ] `solution-capability-plan.json` and `solution-capability-plan-rows.json` appear in the local handoff package and output manifest.
- [ ] `enterprise-connector-contracts.json` and `enterprise-connector-contract-rows.json` appear in the local handoff package and output manifest.
- [ ] `enterprise-readiness-brief.docx`, `.json`, `.md`, and `-rows.json` appear in the local handoff package and output manifest.

## Security And Data Handling

- [ ] No secrets are present in source, docs, or package files.
- [ ] Generated local data is excluded from the review ZIP.
- [ ] Review docs clearly say not to use client confidential, regulated, personal, MNPI, PCI, PHI, or production client data.
- [ ] Any proposed enterprise test path has a clear data classification and owner.
- [ ] `CONNECTOR_MODE` stays `mock` until Microsoft 365 connector approval is documented.
- [ ] Microsoft Graph permissions are read-only and tied to a named pilot boundary for the MVP.
