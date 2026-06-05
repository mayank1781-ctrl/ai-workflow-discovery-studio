# AI Workflow Discovery Studio - Pilot Roadmap

This roadmap is the recommended path from the current local review build to a work-computer pilot and eventual enterprise-ready version.

## Current Position

The app is ready for internal code and logic review as a sanitized local package. It is not a production deployment yet.

Current shareable artifact:

- Sanitized review ZIP generated under `dist/`
- No `.env.local` or API keys included
- No `node_modules`, `.git`, local sessions, generated packages, or local app data included
- Stabilization checks cover syntax, local server health, DOCX generation, workbook import, Discovery first-page layout, template alignment, package ZIP download, review-package generation, and Discovery interview routing
- Packages now include a Reviewer Decision Summary so coworker feedback can be reviewed as a decision artifact, not only free-text notes
- `node scripts/check-review-package.mjs` provides a standalone package doctor for required files, forbidden paths, local path leaks, and API-key pattern checks
- `WORK_COMPUTER_TRANSFER_CHECKLIST.md` and `COWORKER_REVIEW_BRIEF.md` provide the transfer path, copy-ready reviewer note, and feedback format
- `SAFE_SAMPLE_SCENARIOS.md` and `COWORKER_FEEDBACK_TEMPLATE.md` give reviewers synthetic first-run workflows and a structured notes format

## Phase 1 - Work-Computer Install And Code Review

Goal: make sure coworkers can unzip, inspect, and run the app locally without secrets or machine-specific files.

Recommended audience:

- You
- 1-2 technical reviewers
- 1 product/business reviewer who understands workflow intake quality

Scope:

- Install/run flow from `INSTALL.md`
- Discovery question sequencing
- Product PDR, Engineering Brief, Business Value, Governance Inputs, ChatGPT + Microsoft Copilot Build Recipe, and Combined Packet logic
- Safe-data rules and local AI/API behavior

Exit criteria:

- Review package builds with `node scripts/build-review-package.mjs`
- Review package doctor passes with `node scripts/check-review-package.mjs`
- Stabilization passes with `node scripts/run-stabilization-checks.mjs`
- Coworkers can run the app without receiving your local `.env.local`
- Reviewers agree the interview logic is directionally useful for internal pilot testing

## Phase 2 - First-Run UX And Transcript Hardening

Goal: make the first page feel calm and reliable when a colleague is being interviewed.

Recommended build work:

- Keep desktop and mobile visual smoke checks green for the Discovery first page
- Verify the transcript rail shows only the latest few turns while preserving full history
- Keep typed answer, voice controls, attachment upload, and current question visible without overlap
- Tighten empty, loading, thinking, listening, and error states

Exit criteria:

- No overlapping message cards in regression checks
- Discovery can handle a long transcript without layout breakage
- A first-time reviewer can understand what to answer next within a few seconds

## Phase 3 - Template Alignment Pass

Goal: make exported outputs match the decision artifacts your team would actually review.

Recommended build work:

- Refactor output builders around clear template sections
- Improve Product PDR readiness and preview
- Improve Engineering / Solution Architecture brief
- Improve Business Value brief with assumptions clearly separated from confirmed data
- Improve Governance Inputs as later-review inputs, not early blockers
- Improve the Build Recipe so it clearly recommends ChatGPT-first, Microsoft 365 Copilot-first, or hybrid agent/action paths
- Carry field-level route, source type, treatment, and supplement-later metadata into previews, Markdown, JSON, Excel, and packages
- Route open questions by Product, Engineering, Business, Governance/Security, Finance/Ops, and Domain Sponsor

Exit criteria:

- Same core sections appear consistently in browser preview, DOCX, Markdown, JSON, Excel, and handoff packages
- Missing items are routed to the right owner
- Business metrics are marked as hypotheses or supplement-later when Finance/Ops numbers are absent
- Reviewers can distinguish captured facts, AI inferences, open discovery gaps, and trusted supplement-later fields

## Phase 4 - Evidence And Workbook MVP

Goal: make uploaded evidence and workbook import/export useful enough for pilot workflows.

Recommended build work:

- Link uploaded evidence to specific fields, steps, systems, risks, and open questions
- Make evidence suggestions explicitly accept/reject/reviewable
- Improve workbook import conflict handling
- Preserve evidence-reference and Evidence Linkage metadata through export/import/package flows
- Add sample workbooks for safe demo review

Exit criteria:

- A reviewer can see which facts came from conversation versus evidence
- Workbook import restores enough session state to continue review
- Evidence never becomes mandatory for a basic interview
- Packages include `evidence-linkage.json`, `evidence-linkage-rows.json`, and `evidence-linkage.md`

## Phase 5 - Colleague Pilot

Goal: test the tool on real internal workflows using only approved or sanitized data.

Recommended audience:

- 3-5 colleagues across different workflow types
- One operator running the interview
- One reviewer checking generated handoff artifacts

Scope:

- Typed Discovery intake first
- Optional voice only after the typed path is stable
- Optional evidence uploads using safe sample or approved internal material
- Export workbook, DOCX briefs, and handoff package for each pilot case

Exit criteria:

- The app consistently identifies workflow frame, A-to-Z process, data/systems, human review points, value hypothesis, and next questions
- Reviewers can tell whether an idea is ready for Product/Engineering discussion
- Top recurring gaps are captured as a backlog
- Reviewer Decision Summary shows the aggregate decision, recent reviewers, quality signals, and comment-derived backlog items

## Phase 6 - Enterprise Connector Readiness

Goal: turn current local contracts into enterprise integration requirements.

Recommended build work:

- Microsoft Graph / SharePoint / OneDrive source contract
- Teams / Outlook intake and notification contract
- Approved storage, audit, retention, and access model
- Entra ID / SSO requirements
- Finance/Ops supplement data contract for volume, cost, margin, and KPI proof
- Security, privacy, model-risk, and legal/MSA review routing

Exit criteria:

- Connector Registry and Live Data Setup outputs are specific enough for enterprise architecture review
- Hosting, identity, storage, audit, and retention decisions are documented
- The pilot can move from local prototype to approved enterprise deployment planning

## Immediate Recommended Build Backlog

1. Keep the review package and stabilization checks green after every meaningful change.
2. Add visual smoke checks for the Discovery first page and transcript rail.
3. Continue the Template Alignment Pass, starting with shared output-section builders.
4. Strengthen workbook import/export conflict handling and evidence provenance.
5. Use Reviewer Decision Summary results to choose the next pilot slice, Product review, Engineering review, or blocker triage.
