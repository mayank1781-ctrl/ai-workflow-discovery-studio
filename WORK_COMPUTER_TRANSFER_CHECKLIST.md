# Work Computer Transfer Checklist

Use this when moving the review ZIP from this machine to a work computer.

## Before Sending

1. Regenerate and validate the package:

```bash
node scripts/check-enterprise-transfer-kit.mjs
node scripts/check-work-environment-readiness.mjs
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

2. Send only the latest ZIP from `dist/`.
3. Do not send `.env.local`, API keys, local app data, screenshots, or generated package folders.
4. Prefer an approved internal file-transfer path such as SharePoint or OneDrive if email blocks ZIP files or command files.

## On The Work Computer

1. Unzip the package into a normal working folder.
2. Open Terminal, Command Prompt, or PowerShell in the unzipped package root.
3. Run the package doctor:

```bash
node scripts/check-review-package.mjs
```

4. Start the app:

```bash
node scripts/start-local.mjs
```

5. Open:

```text
http://localhost:5177/
```

6. Pick a safe scenario from `SAFE_SAMPLE_SCENARIOS.md`.
7. Capture notes in `COWORKER_FEEDBACK_TEMPLATE.md`.
8. For enterprise setup, follow `WORK_ENVIRONMENT_STANDUP_RUNBOOK.md`, `ENTERPRISE_DEPLOYMENT_GUIDE.md`, `GITHUB_ENTERPRISE_SETUP.md`, `MICROSOFT_365_CONNECTOR_SETUP.md`, and `V1_RELEASE_CHECKLIST.md`.

## Optional AI Setup

Code and logic review can happen without an API key. Live AI extraction, transcription, and voice need an approved local key on that work machine.

If approved, copy `discovery-intake-webapp/.env.example` to `discovery-intake-webapp/.env.local` on the work computer and add the key there. Do not email or paste the key into any review thread.

For Microsoft 365 connector planning, keep `CONNECTOR_MODE=mock` until the Entra app registration, Microsoft Graph permissions, source location, data owner, and security reviewer have been approved.

## First Review Run

Use synthetic, sanitized, or explicitly approved examples only.

Recommended first workflow:

1. Open Discovery.
2. Enter one scenario from `SAFE_SAMPLE_SCENARIOS.md`.
3. Capture the rough A-to-Z process.
4. Review Outputs.
5. Open the Build Recipe output and check whether the recommended route is ChatGPT-first, Microsoft 365 Copilot-first, or hybrid.
6. Confirm the recipe gives practical ChatGPT instructions, Copilot/M365 guidance, connector assumptions, human controls, MVP steps, and test criteria.
7. After creating a package, confirm `solution-build-spec.json` is present for code/logic review of the machine-readable build contract.
8. Confirm `solution-capability-plan.json` is present for review of the ChatGPT capability sequence, Microsoft Copilot surfaces, human checkpoints, and enterprise hardening phases.
9. Confirm `enterprise-connector-contracts.json` is present for enterprise connector/auth/read-write approval review.
10. Confirm `enterprise-readiness-brief.docx` or `.json` summarizes enterprise release gates, owners, testing evidence, connector approvals, and next actions.
11. Open Testing & Release.
12. Save one feedback snapshot.
13. Create Package.
14. Download ZIP.
15. Review the generated Reviewer Decision Summary.

## Stop Criteria

Stop and ask for help before broader sharing if:

- The package doctor fails.
- The local server does not start.
- A reviewer sees `.env.local`, API key text, raw client data, or unexpected generated local data in the package.
- The app asks for sensitive client data before the data boundary is approved.
