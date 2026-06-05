# AI Workflow Discovery Studio - Reviewer Guide

This package is for internal code and logic review before broader colleague testing.

The app is a local workflow discovery tool. It interviews a colleague about a time-heavy workflow, structures the answers, and produces Product, Engineering, Business Value, Governance Inputs, a ChatGPT + Microsoft Copilot Build Recipe, and Combined Handoff outputs.

## What To Review First

1. Discovery interview flow
   - Does it ask for the submitted idea first?
   - Does it capture workflow name, start, end, and output before detailed questions?
   - Does it ask for broad tools, systems, inputs, and outputs before step-level drilldown?
   - Does it avoid governance, data-boundary, and value questions too early?

2. Handoff logic
   - Are Product PDR fields useful and clear?
   - Are Engineering / Solution Architecture fields specific enough for a technical review?
   - Are Business Value fields framed as hypotheses when exact Finance/Ops numbers are missing?
   - Are Governance Inputs captured as later-review inputs, not early blockers?
   - Does the Build Recipe clearly explain what to build in ChatGPT, what to build in Microsoft Copilot, and where a hybrid agent/connector path is needed?
   - Do output fields clearly show route, source type, treatment, and supplement-later handling?
   - Does Analysis Studio > Outputs show each handoff document mapped to the expected route, workbook sheet, and package files?

3. Export and package logic
   - Excel workbook export
   - DOCX brief downloads
   - Local handoff package creation
   - Workbook import back into a session
   - Evidence Linkage export/import and package files
   - Reviewer Decision Summary, which turns saved coworker feedback into an aggregate decision and backlog

4. Security and data handling
   - Local server behavior
   - OpenAI API usage
   - File upload/evidence behavior
   - Evidence remains optional and reviewable before it changes intake state
   - Safe-data rules for review

## Suggested Review Order

1. Read `INSTALL.md`.
2. Read `WORK_COMPUTER_TRANSFER_CHECKLIST.md` if you are moving the ZIP to another machine.
3. Read `COWORKER_REVIEW_BRIEF.md` for the review scope and feedback format.
4. Pick a test case from `SAFE_SAMPLE_SCENARIOS.md`.
5. Read `SECURITY_AND_DATA_HANDLING.md`.
6. Read `PILOT_ROADMAP.md` to understand what is review-ready now versus later enterprise work.
7. Run `node scripts/check-review-package.mjs` on the ZIP or extracted package before sharing it onward.
8. Run the app locally with sample data only.
9. Read `DISCOVERY_LOGIC.md` while walking through Discovery mode.
10. Read `ARCHITECTURE.md` while reviewing the code.
11. Use `CODE_REVIEW_CHECKLIST.md` and `COWORKER_FEEDBACK_TEMPLATE.md` to capture comments.

## How To Review A Pilot Result

After running one workflow, open Testing & Release and save one feedback snapshot. The app will roll saved snapshots into the Reviewer Decision Summary, export it as a workbook sheet, and include `reviewer-decision-summary.json`, `reviewer-decision-summary-rows.json`, and `reviewer-decision-summary.md` in the local package.

Use that summary to decide whether the next move is another small pilot, Product review, Engineering review, or a pause to fix a blocker.

## Review Scope

This is not a production deployment. It is a local review build for:

- Workflow intake logic
- Product / Engineering / Business handoff structure
- Output packaging
- Code review
- Safe internal demonstration using synthetic or approved sample data

Do not use client confidential, regulated, personal, MNPI, PCI, PHI, or production client data in this review build unless your internal governance process explicitly approves that use.
