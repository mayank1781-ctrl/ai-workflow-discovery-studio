# Coworker Review Brief

This brief is for coworkers reviewing the AI Workflow Discovery Studio ZIP before broader testing.

## Copy-Ready Note

Subject: AI Workflow Discovery Studio local review build

Hi team,

I am sharing a local review build of AI Workflow Discovery Studio. The goal is to review the code, workflow-discovery logic, handoff outputs, ChatGPT/Microsoft Copilot Build Recipe, and safe-data assumptions before we use it in broader internal testing.

Please do not use client confidential, regulated, personal, MNPI, PCI, PHI, or production client data. Use synthetic or approved sample examples only.

Suggested review order:

1. Read `INSTALL.md`.
2. Run `node scripts/check-review-package.mjs`.
3. Start the app with `node scripts/start-local.mjs`.
4. Open `http://localhost:5177/`.
5. Pick one synthetic workflow from `SAFE_SAMPLE_SCENARIOS.md`.
6. Review `DISCOVERY_LOGIC.md`, `ARCHITECTURE.md`, and `SECURITY_AND_DATA_HANDLING.md`.
7. Use `CODE_REVIEW_CHECKLIST.md` and `COWORKER_FEEDBACK_TEMPLATE.md` to capture comments.
8. If you run a sample workflow, save one feedback snapshot in Testing & Release so the Reviewer Decision Summary can roll up feedback.

Thank you for focusing on whether the discovery flow, generated outputs, and safety model are directionally right before we expand testing.

## What To Inspect

- Discovery question order: topic, workflow boundary, broad tools/data/output, A-to-Z process, then step-level detail.
- Product PDR, Engineering Brief, Business Value, Governance Inputs, Build Recipe, Combined Packet, and Question Routing outputs.
- Build Recipe logic: whether the app chooses the right ChatGPT-first, Microsoft 365 Copilot-first, or hybrid agent/action route for the workflow.
- Build Recipe usefulness: whether the generated prompt pack, connector plan, human controls, MVP steps, and test script are practical enough for a solution builder.
- Solution Build Spec: whether `solution-build-spec.json` is structured enough for future scaffolding of ChatGPT instructions, OpenAI tool/MCP contracts, Microsoft Copilot agent/actions, connector candidates, controls, and MVP tests.
- Solution Capability Plan: whether `solution-capability-plan.json` gives a useful feature-level sequence for ChatGPT capabilities, Microsoft Copilot surfaces, human checkpoints, and enterprise hardening phases.
- Enterprise Connector Contracts: whether `enterprise-connector-contracts.docx`, `.md`, and `.json` clearly describe source systems, source locations, auth model, read/write mode, permission scope, allowed/blocked operations, approval gates, pilot data policy, fallback mode, setup steps, and test criteria for each connector candidate.
- Connector Approval Checklist: whether `connector-approval-checklist.docx`, `.md`, and `.json` give platform/source/governance owners a practical evidence and decision checklist before connector build.
- Connector Validation Plan: whether `connector-validation-plan.docx`, `.md`, and `.json` give reviewers executable tests for source reachability, permission boundaries, blocked operations, safe pilot data, audit evidence, human review gates, fallback behavior, and write/action safeguards before connector build.
- Connector Validation Evidence Log: whether `connector-validation-evidence-log.docx`, `.md`, and `.json` clearly tells reviewers what proof to capture, who owns it, which result options are allowed, and how the evidence affects connector promotion or fallback.
- Connector Build Request Pack: whether `connector-build-request-pack.docx`, `.md`, and `.json` is ticket-ready enough for enterprise/Microsoft/OpenAI owners, with requested decision, minimum build scope, out-of-scope behavior, approvals, controls, evidence package, and next action.
- Connector Pilot Runbook: whether `connector-pilot-runbook.docx`, `.md`, and `.json` gives reviewers a safe pilot sequence with preflight, safe sample setup, access setup, validation run, evidence capture, human signoff, fallback drill, promotion decision, stop triggers, and package evidence.
- Connector Promotion Decision Packet: whether `connector-promotion-decision-packet.docx`, `.md`, and `.json` helps reviewers make a promote/defer/block recommendation with owner, evidence gaps, fallback posture, enterprise handoff, stop criteria, and package evidence.
- Enterprise Readiness Brief: whether `enterprise-readiness-brief.docx` and `.json` summarize release gates, owners, testing evidence, connector approvals, data/storage/auth/audit posture, and next actions clearly enough for an enterprise owner review.
- Field metadata showing captured facts, inferred items, missing items, and supplement-later fields.
- Evidence behavior: optional, review-before-apply, and linked to fields or records when present.
- Reviewer Decision Summary: aggregate decision, average rating, reviewer snapshots, and backlog items from feedback.
- Packaging behavior: workbook export, DOCX downloads, local package creation, and latest package ZIP download.
- Security and data handling: no secrets in the ZIP, no local generated app data, no raw client data in review.

## Review Decisions

Use one of these decisions after review:

- Run another pilot: the app is promising but needs one more controlled test.
- Ready for Product review: the Product PDR and workflow framing are useful enough for owner review.
- Ready for Engineering review: the Engineering Brief and build assumptions are useful enough for technical review.
- Pause / revisit: a safety, usability, or logic blocker should be fixed first.

## Feedback Format

Please capture comments with:

- Area: Discovery, Outputs, Package, Security/Data, UI, or Code.
- Severity: blocker, high, medium, low, or question.
- Example: what you saw and what you expected.
- Recommendation: what should change before the next pilot.

If you test the app directly, put the same feedback into Testing & Release and save a feedback snapshot.

Use `SAFE_SAMPLE_SCENARIOS.md` for first-run examples and `COWORKER_FEEDBACK_TEMPLATE.md` for longer notes that do not fit inside the app.
