# GitHub Enterprise Setup

Use this guide to stand up the project in a work GitHub organization or GitHub Enterprise environment.

## Repository Shape

Recommended settings for the first work repository:

- Visibility: private
- Owner: approved work organization or team
- Default branch: `main`
- Direct collaborators: limited to reviewers and pilot builders
- Secrets: none at first
- Actions: enabled for validation only

The repository should contain the sanitized review package contents, not the original personal working folder.

## First Commit From The Review ZIP

From the unzipped review package root on a work machine:

```bash
git init
git add .
git status --short
```

Confirm this file is not staged:

```text
discovery-intake-webapp/.env.local
```

Then commit and push:

```bash
git commit -m "Add AI Workflow Discovery Studio enterprise MVP package"
git branch -M main
git remote add origin <approved-private-repository-url>
git push -u origin main
```

## Access Model

Recommended initial access:

- Repository admin: you or approved technical owner
- Reviewer access: code reviewers, security reviewer, Microsoft 365 admin reviewer
- Write access: only the small build group
- Read access: only people who need review visibility

If your organization uses teams, prefer team-based access rather than one-off personal collaborators.

Reference:

- Managing repository teams and people: https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository/

## Branch And Review Controls

Recommended controls before broader pilot work:

- Require pull requests for changes to `main`
- Require at least one reviewer
- Require status checks to pass
- Restrict who can push to `main`
- Enable secret scanning if available in your plan
- Keep generated app data out of Git

For this MVP, a simple protected `main` branch plus package checks is enough to support review. More formal release branching can wait until the app moves beyond local pilot.

## GitHub Actions

The included workflow is:

```text
.github/workflows/enterprise-transfer-check.yml
```

It runs:

```bash
node --check discovery-intake-webapp/app.js
node --check discovery-intake-webapp/server.mjs
node --check scripts/check-enterprise-transfer-kit.mjs
node scripts/check-enterprise-transfer-kit.mjs
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

This is intentionally a validation workflow, not a deployment workflow.

## Repository Secrets

Start with no secrets. Add secrets only after the repository owner approves the CI path.

Possible future secrets:

- `OPENAI_API_KEY` for live AI checks
- `MICROSOFT_TENANT_ID` for Microsoft 365 connector checks
- `MICROSOFT_CLIENT_ID` for Microsoft 365 connector checks
- `MICROSOFT_CLIENT_SECRET` only if a confidential-client flow is approved

Reference:

- GitHub Actions secrets: https://docs.github.com/en/actions/reference/security/secrets
- GitHub Actions environments: https://docs.github.com/en/actions/reference/environments

## Pull Request Review Checklist

Every enterprise MVP pull request should answer:

- Does this change alter what data leaves the browser or local server?
- Does this change require new Microsoft Graph permissions?
- Does this change write to Microsoft 365, SharePoint, OneDrive, Teams, Outlook, or GitHub?
- Does this change add generated files that should stay out of Git?
- Does `node scripts/check-enterprise-transfer-kit.mjs` still pass?
- Does `node scripts/check-review-package.mjs` still pass after rebuilding the package?

