# Review Package Manifest

Package: ai-workflow-discovery-studio-review-0.1.0-2026-06-05T11-50-53-306Z
Created: 2026-06-05T11:50:53.330Z

## Purpose

This ZIP is a sanitized internal review package for AI Workflow Discovery Studio. It is intended for code, logic, and local install review before broader colleague testing.

## Excluded By Design

- `.env.local` and other local secret files
- `.git`
- `node_modules`
- `dist`
- generated server sessions and packages under `discovery-intake-webapp/data`
- local test screenshots, workbooks, and regression outputs under `discovery-intake-webapp/test-outputs` except sanitized demo extraction JSON
- root `outputs` and extracted DOCX scratch folders
- logs, PID files, and ZIP files

## Enterprise Transfer Files

- Enterprise deployment, GitHub, Microsoft 365 connector, environment, and v1 release docs
- Machine-readable enterprise environment, Microsoft 365 permission, GitHub repository, and readiness gate contracts
- GitHub Actions validation workflow for private work-repository setup

## Included Files

- .github/workflows/enterprise-transfer-check.yml
- .gitignore
- ARCHITECTURE.md
- CODE_REVIEW_CHECKLIST.md
- COWORKER_FEEDBACK_TEMPLATE.md
- COWORKER_REVIEW_BRIEF.md
- DISCOVERY_LOGIC.md
- discovery-intake-webapp/.env.example
- discovery-intake-webapp/.gitignore
- discovery-intake-webapp/app.js
- discovery-intake-webapp/cockpit.css
- discovery-intake-webapp/future.css
- discovery-intake-webapp/index.html
- discovery-intake-webapp/README.md
- discovery-intake-webapp/scripts/regression-interview-flow.mjs
- discovery-intake-webapp/server.mjs
- discovery-intake-webapp/styles.css
- discovery-intake-webapp/vendor/lucide.js
- discovery-intake-webapp/vendor/mermaid.min.js
- discovery-intake-webapp/vendor/xlsx.full.min.js
- EMAIL_TRANSFER_NOTE.md
- ENTERPRISE_DEPLOYMENT_GUIDE.md
- ENTERPRISE_TRANSFER_MANIFEST.md
- enterprise/enterprise-environment.template.json
- enterprise/github-repository-setup.json
- enterprise/microsoft-365-permissions.json
- enterprise/v1-readiness-gates.json
- enterprise/work-environment-readiness-checks.json
- ENVIRONMENT_VARIABLES.md
- GITHUB_ENTERPRISE_SETUP.md
- INSTALL.md
- MICROSOFT_365_CONNECTOR_SETUP.md
- package.json
- PILOT_ROADMAP.md
- README.md
- REVIEWER_GUIDE.md
- SAFE_SAMPLE_SCENARIOS.md
- scripts/build-review-package.mjs
- scripts/check-discovery-layout.mjs
- scripts/check-docx-output.mjs
- scripts/check-enterprise-readiness-brief.mjs
- scripts/check-enterprise-transfer-kit.mjs
- scripts/check-evidence-linkage.mjs
- scripts/check-handoff-package-contract.mjs
- scripts/check-local-setup.mjs
- scripts/check-package-zip.mjs
- scripts/check-review-package-install.mjs
- scripts/check-review-package.mjs
- scripts/check-reviewer-decision.mjs
- scripts/check-solution-build-recipe.mjs
- scripts/check-template-alignment.mjs
- scripts/check-work-environment-readiness.mjs
- scripts/check-workbook-import.mjs
- scripts/run-stabilization-checks.mjs
- scripts/start-local.mjs
- SECURITY_AND_DATA_HANDLING.md
- start-mac.command
- start-windows.bat
- V1_RELEASE_CHECKLIST.md
- WORK_COMPUTER_TRANSFER_CHECKLIST.md
- WORK_ENVIRONMENT_STANDUP_RUNBOOK.md
- discovery-intake-webapp/test-outputs/live-extraction/banking-payments.json
- discovery-intake-webapp/test-outputs/live-extraction/insurance-workshop-synthesis.json
- discovery-intake-webapp/test-outputs/live-extraction/strategy-workshop-prep.json
- discovery-intake-webapp/test-outputs/live-extraction/tech-test-generation.json
- discovery-intake-webapp/test-outputs/live-extraction/frrf-breaking-records.json
- discovery-intake-webapp/test-outputs/live-extraction/project-governance-summaries.json
