# Enterprise Transfer Manifest

This manifest describes the files that make the review ZIP useful in a work environment.

## Core Runtime

- `discovery-intake-webapp/index.html`
- `discovery-intake-webapp/app.js`
- `discovery-intake-webapp/server.mjs`
- `discovery-intake-webapp/styles.css`
- `discovery-intake-webapp/future.css`
- `discovery-intake-webapp/cockpit.css`
- `discovery-intake-webapp/vendor/`

Purpose: local browser app plus small Node.js server.

## Environment Template

- `discovery-intake-webapp/.env.example`
- `ENVIRONMENT_VARIABLES.md`

Purpose: shows required local settings without including secrets.

## Enterprise Setup Docs

- `ENTERPRISE_DEPLOYMENT_GUIDE.md`
- `GITHUB_ENTERPRISE_SETUP.md`
- `MICROSOFT_365_CONNECTOR_SETUP.md`
- `V1_RELEASE_CHECKLIST.md`
- `WORK_ENVIRONMENT_STANDUP_RUNBOOK.md`
- `WORK_COMPUTER_TRANSFER_CHECKLIST.md`
- `SECURITY_AND_DATA_HANDLING.md`

Purpose: gives step-by-step work-environment setup, Microsoft 365 connector planning, GitHub setup, release gates, and data handling rules.

## Machine-Readable Enterprise Contracts

- `enterprise/enterprise-environment.template.json`
- `enterprise/microsoft-365-permissions.json`
- `enterprise/github-repository-setup.json`
- `enterprise/v1-readiness-gates.json`
- `enterprise/work-environment-readiness-checks.json`

Purpose: gives reviewers a structured contract for environment, permissions, repository controls, and release gates.

## GitHub Validation

- `.github/workflows/enterprise-transfer-check.yml`
- `scripts/check-enterprise-transfer-kit.mjs`
- `scripts/check-work-environment-readiness.mjs`
- `scripts/check-review-package.mjs`
- `scripts/build-review-package.mjs`

Purpose: validates that the enterprise transfer assets are present and the package stays clean.

## Review And Pilot Docs

- `REVIEWER_GUIDE.md`
- `CODE_REVIEW_CHECKLIST.md`
- `SAFE_SAMPLE_SCENARIOS.md`
- `COWORKER_REVIEW_BRIEF.md`
- `COWORKER_FEEDBACK_TEMPLATE.md`
- `PILOT_ROADMAP.md`

Purpose: lets colleagues review code, logic, output contracts, and pilot suitability without using sensitive data.

## Explicit Exclusions

The review ZIP must not include:

- `.env.local`
- API keys or secrets
- `.git`
- `node_modules`
- `discovery-intake-webapp/data/`
- generated output packages
- local screenshots and test outputs
- personal-machine paths
