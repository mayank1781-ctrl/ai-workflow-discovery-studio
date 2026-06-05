# Enterprise Deployment Guide

This guide explains how to take AI Workflow Discovery Studio from a personal local build into a work environment for v1.0 MVP review.

The v1.0 target is not "internet-scale production." It is an enterprise-ready MVP: private source control, clean transfer package, approved local or internal run path, explicit Microsoft 365 connector assumptions, no committed secrets, safe pilot data, and clear gates before broader use.

## What You Are Moving

Move the latest sanitized review ZIP from `dist/`. Do not move the whole personal working folder.

The review ZIP is designed to include:

- App source and browser assets
- Install and reviewer docs
- Enterprise deployment docs
- Microsoft 365 and GitHub setup contracts
- Safe sample scenarios
- Package validation scripts

The review ZIP is designed to exclude:

- `.env.local`
- API keys and secrets
- `.git`
- `node_modules`
- Generated sessions and output packages
- Local screenshots and test outputs
- Personal-machine paths

## Phase 0: Personal Machine Preflight

From the project root on your personal machine:

```bash
node scripts/check-enterprise-transfer-kit.mjs
node scripts/check-work-environment-readiness.mjs
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

Use only the newest ZIP under `dist/`.

Before sending it to work, confirm the package doctor says:

- Required install, review, app, enterprise, and validation files are present
- `.env.local` is absent
- Generated app data is absent
- Local user paths are absent
- OpenAI, GitHub, and Microsoft secret-looking values are absent

## Phase 1: Transfer To Work

Use an approved company transfer path:

- Work email attachment, only if ZIP files are permitted
- OneDrive or SharePoint upload
- Internal file transfer portal
- Company-managed endpoint sync

Do not transfer:

- Personal `.env.local`
- Client data
- Generated local output packages from personal testing
- Screenshots containing keys or sensitive details

If the old exposed OpenAI key from an earlier screenshot has not already been revoked, revoke or delete it in the OpenAI Platform dashboard before wider sharing.

## Phase 2: Create The Work GitHub Repository

In your work GitHub organization or approved GitHub Enterprise environment:

1. Create a private repository, for example `ai-workflow-discovery-studio`.
2. Unzip the review package into a local work folder.
3. Initialize Git from the unzipped package root if needed.
4. Commit the unzipped package contents.
5. Confirm `.env.local` is ignored and not staged.
6. Push to the private work repository.
7. Add only the reviewers who need access.
8. Configure branch protection or required reviews if your organization requires it.

After the repository is connected, run:

```bash
node scripts/check-work-environment-readiness.mjs --github-required
```

Reference docs:

- GitHub repository creation: https://docs.github.com/articles/creating-a-new-repository
- GitHub repository access: https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository/

## Phase 3: Run Locally In The Work Environment

On a work computer:

```bash
node scripts/check-local-setup.mjs --no-health
node scripts/check-work-environment-readiness.mjs
node scripts/start-local.mjs
```

Open:

```text
http://localhost:5177/
```

For review without live AI, no API key is required. The app should still load and allow code, logic, template, and package review.

For live AI features, create this file only on the work machine:

```text
discovery-intake-webapp/.env.local
```

Start from the template:

```bash
cp discovery-intake-webapp/.env.example discovery-intake-webapp/.env.local
```

Use only approved work-environment keys and tenant values. Never commit `.env.local`.

After work `.env.local` is populated for MVP review:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict
```

## Phase 4: Configure Microsoft Entra App Registration

Ask the Microsoft 365 or identity admin which pattern is allowed:

- Local review only with no Microsoft connector
- Delegated read-only connector for a named pilot user group
- App-only connector with selected SharePoint site access

For the first enterprise MVP, prefer read-only access and one approved SharePoint or OneDrive test location.

Minimum setup to discuss with IT:

1. Create an app registration in Microsoft Entra ID.
2. Record the Directory tenant ID and Application client ID.
3. Add a localhost redirect URI for local work-machine testing.
4. Add only required Microsoft Graph permissions.
5. Get admin consent where required by company policy.
6. Keep write permissions disabled until a separate approval gate is passed.
7. Use separate app registrations for development, pilot, and production if the app progresses.

Reference docs:

- Microsoft identity platform app registration concepts: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols
- Redirect URI best practices: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- Microsoft identity integration checklist: https://learn.microsoft.com/en-us/entra/identity-platform/identity-platform-integration-checklist
- Microsoft Graph permission reference: https://learn.microsoft.com/en-us/graph/permissions-reference

## Phase 5: Populate Enterprise Environment Values

In `discovery-intake-webapp/.env.local` on the work machine, use values approved by IT. Keep `CONNECTOR_MODE=mock` until Microsoft 365 connector approval is complete.

Typical MVP values:

```text
APP_ENV=enterprise-local
ENTERPRISE_MODE=on
CONNECTOR_MODE=mock
APP_BASE_URL=http://localhost:5177
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_REDIRECT_URI=http://localhost:5177/auth/microsoft/callback
MICROSOFT_GRAPH_SCOPES=User.Read Files.Read.All Sites.Read.All offline_access
MICROSOFT_SHAREPOINT_HOSTNAME=
MICROSOFT_SHAREPOINT_SITE_PATH=
GITHUB_REPOSITORY=
GITHUB_DEFAULT_BRANCH=main
```

Check what the app sees without exposing secrets:

```bash
node scripts/start-local.mjs
```

Then open:

```text
http://localhost:5177/api/health
```

The health response reports only booleans and non-secret labels for enterprise readiness.

If the Microsoft 365 connector has been approved, run:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict --connector-approved
```

## Phase 6: Set Up GitHub Actions

The package includes `.github/workflows/enterprise-transfer-check.yml`. It runs syntax checks, enterprise transfer-kit checks, and review-package validation.

Recommended repository secrets, only if your company wants CI to exercise live AI or connector checks:

- `OPENAI_API_KEY`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

Do not add secrets until the repository owner and security reviewer approve the CI data path.

Reference docs:

- GitHub Actions secrets: https://docs.github.com/en/actions/reference/security/secrets
- GitHub Actions environments: https://docs.github.com/en/actions/reference/environments

## Phase 7: Pilot With Safe Data

Run pilots in this order:

1. Synthetic sample workflow from `SAFE_SAMPLE_SCENARIOS.md`
2. Sanitized internal workflow with no client data
3. Approved internal workflow with named owner and data classification
4. Microsoft 365 connector pilot against one approved test location
5. Broader coworker pilot only after the Connector Promotion Decision Packet says promote

Each pilot should produce:

- Product PDR
- Engineering Brief
- Business Value
- Governance Inputs
- Solution Build Recipe
- Enterprise Readiness Brief
- Connector Approval Checklist, if connector data is involved
- Connector Promotion Decision Packet

## Phase 8: Go / No-Go For v1.0 MVP

Do not call the work deployment v1.0 ready until these are true:

- Private repository created and access-limited
- `.env.local` absent from Git
- Package doctor passes
- Safe sample workflow runs
- Live AI path approved or explicitly disabled
- Microsoft 365 connector mode remains mock until approved
- Data owner has approved the first pilot data class
- Security reviewer accepts the local-storage and retention posture for MVP
- Reviewer Decision Summary has no blocking findings

For the detailed checklist, use `V1_RELEASE_CHECKLIST.md`.
