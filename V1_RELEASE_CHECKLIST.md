# v1.0 Enterprise MVP Release Checklist

Use this checklist before you call the work-environment build ready for enterprise MVP review.

## Package And Transfer

- [ ] Latest review ZIP was generated with `node scripts/build-review-package.mjs`.
- [ ] Package doctor passed with `node scripts/check-review-package.mjs`.
- [ ] Enterprise transfer-kit check passed with `node scripts/check-enterprise-transfer-kit.mjs`.
- [ ] Work environment readiness check passed with `node scripts/check-work-environment-readiness.mjs`.
- [ ] ZIP does not include `.env.local`.
- [ ] ZIP does not include generated app data.
- [ ] ZIP does not include local user paths.
- [ ] ZIP does not include OpenAI, GitHub, or Microsoft secret-looking values.
- [ ] Transfer happened through an approved work channel.

## GitHub

- [ ] Private work repository created.
- [ ] `.env.local` is ignored and absent from Git.
- [ ] Reviewer access is limited to the pilot group.
- [ ] `.github/workflows/enterprise-transfer-check.yml` runs in the work repository.
- [ ] Required reviews or branch controls are configured if required by policy.
- [ ] GitHub Actions secrets are empty until CI secret use is approved.

## Local Work Runtime

- [ ] Node.js 18 or newer is available.
- [ ] `node scripts/check-local-setup.mjs --no-health` passes.
- [ ] `node scripts/check-work-environment-readiness.mjs --work-strict` passes after work `.env.local` and GitHub setup.
- [ ] `node scripts/start-local.mjs` starts the app.
- [ ] `http://localhost:5177/` loads.
- [ ] `http://localhost:5177/api/health` reports expected enterprise config booleans.
- [ ] App can run without a live AI key for code and logic review.
- [ ] Live AI key, if used, is approved for the work environment.

## Microsoft 365

- [ ] Microsoft 365 connector mode remains `mock` until approval.
- [ ] Entra app registration owner is identified.
- [ ] Tenant ID and client ID are captured only in `.env.local` or approved secret storage.
- [ ] Redirect URI matches the app registration.
- [ ] Requested Microsoft Graph scopes are read-only for MVP.
- [ ] Pilot SharePoint or OneDrive boundary is documented.
- [ ] Data owner and security reviewer are named.
- [ ] Write-back permissions are disabled.

## Pilot Data

- [ ] First run uses `SAFE_SAMPLE_SCENARIOS.md`.
- [ ] No client confidential, regulated, personal, MNPI, PCI, PHI, or production client data is used without explicit approval.
- [ ] Uploaded evidence is synthetic or approved.
- [ ] Data classification is recorded.
- [ ] Retention expectation is recorded.

## Output Quality

- [ ] Product PDR is useful and separates facts, assumptions, and open questions.
- [ ] Engineering Brief describes systems, data, integration, access, and non-functional needs.
- [ ] Business Value identifies value path and supplement-later finance/ops data.
- [ ] Governance Inputs identify approval path and data sensitivity.
- [ ] Solution Build Recipe reads like a practical ChatGPT plus Microsoft Copilot build recipe.
- [ ] Enterprise Readiness Brief gives gates, owners, evidence, and next actions.
- [ ] Connector Promotion Decision Packet recommends promote, defer, or block with reasons.

## Stop Criteria

Stop before broader sharing if:

- Any package or transfer-kit check fails.
- `.env.local` or a secret appears in Git or ZIP contents.
- The app requires real client data to demonstrate value.
- Microsoft Graph permissions are broader than the pilot boundary.
- A reviewer cannot identify the owner for pilot data, access, retention, or security approval.
