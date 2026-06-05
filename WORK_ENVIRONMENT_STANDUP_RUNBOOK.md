# Work Environment Standup Runbook

Use this after you move the sanitized review ZIP to a work computer or work GitHub repository.

The goal is to prove the v1.0 enterprise MVP can run in a controlled work setting without committing secrets, using live Microsoft 365 connector access too early, or relying on personal-machine state.

## 1. Unzip The Package

Unzip the latest review package into a normal work folder.

Start from the package root, the folder that contains:

```text
README.md
discovery-intake-webapp/
scripts/
enterprise/
```

## 2. Run The Baseline Work Readiness Check

```bash
node scripts/check-work-environment-readiness.mjs
```

Expected first-run result:

- Node.js 18+ is OK
- Required app, docs, scripts, enterprise contracts, and GitHub workflow files are present
- `.env.example` is present
- `.env.local` may be missing until you configure live AI or enterprise settings
- GitHub remote may be missing until you create the private work repository
- Microsoft 365 connector should remain mock unless approved

Warnings are expected before work setup is complete. Failures should be fixed before sharing the package with more reviewers.

## 3. Create Or Connect The Private Work GitHub Repository

Follow `GITHUB_ENTERPRISE_SETUP.md`.

After Git is initialized and pushed, run:

```bash
git status --short
node scripts/check-work-environment-readiness.mjs --github-required
```

Confirm:

- Repository is private or otherwise approved by your organization
- `.env.local` is not tracked
- `.github/workflows/enterprise-transfer-check.yml` is present
- Reviewers are added by team or approved individual access

## 4. Create Work-Only Local Environment File

On the work computer only:

```bash
cp discovery-intake-webapp/.env.example discovery-intake-webapp/.env.local
```

Populate only approved values. Do not paste secrets into GitHub comments, tickets, chat, or docs.

For the first enterprise MVP run, this posture is recommended:

```text
APP_ENV=enterprise-local
ENTERPRISE_MODE=on
CONNECTOR_MODE=mock
APP_BASE_URL=http://localhost:5177
```

Live AI is optional for code and logic review. If live AI is approved, set `OPENAI_API_KEY` only in `.env.local` or an approved work secret manager.

## 5. Keep Microsoft 365 In Mock Mode Until Approved

Before Microsoft 365 connector approval:

```text
CONNECTOR_MODE=mock
```

Run:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict
```

This should pass once the private GitHub setup and work `.env.local` are in place. It does not require live Microsoft 365 connector values while connector mode is mock.

## 6. After Microsoft 365 Approval

Only after the Entra app registration, Graph scopes, data boundary, pilot owner, and security reviewer are approved, populate the Microsoft 365 values in `.env.local`.

Then run:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict --connector-approved
```

This stricter check expects:

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_REDIRECT_URI`
- `MICROSOFT_GRAPH_SCOPES`
- A SharePoint site, drive, or folder boundary

Write scopes should stay out of MVP unless a separate write-back approval has been recorded.

## 7. Start The App

```bash
node scripts/start-local.mjs
```

Open:

```text
http://localhost:5177/
```

Optional health check:

```bash
APP_URL=http://localhost:5177 node scripts/check-work-environment-readiness.mjs --health
```

The health response should report enterprise booleans only. It must not reveal secret values.

## 8. Run The First Safe Pilot

Use a scenario from `SAFE_SAMPLE_SCENARIOS.md`.

Then generate:

- Product PDR
- Engineering Brief
- Business Value
- Governance Inputs
- Solution Build Recipe
- Enterprise Readiness Brief
- Connector Promotion Decision Packet

Do not use client confidential, regulated, personal, MNPI, PCI, PHI, or production client data unless the data owner and security reviewer approve that path.

## 9. Regenerate The Shareable Package From Work

After work setup changes:

```bash
node scripts/check-enterprise-transfer-kit.mjs
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

The package doctor must still confirm no `.env.local`, OpenAI key, GitHub token, enterprise secret assignment, generated app data, or local machine path is included.

