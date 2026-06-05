# Install And Run

This app runs locally on your machine. It starts a small Node.js server and opens in a browser at `http://localhost:5177/`.

## Requirements

- Node.js 18 or newer
- A modern browser
- Optional: an approved OpenAI API key for live AI extraction, transcription, and voice

The app can be reviewed without an API key, but live AI features need one.

## Quick Start On macOS

1. Unzip the review package.
2. Open Terminal in the unzipped folder.
3. Run:

```bash
node scripts/start-local.mjs
```

4. Open:

```text
http://localhost:5177/
```

You can also double-click `start-mac.command` if your device allows local command files.

## Quick Start On Windows

1. Unzip the review package.
2. Open Command Prompt or PowerShell in the unzipped folder.
3. Run:

```bat
node scripts\start-local.mjs
```

4. Open:

```text
http://localhost:5177/
```

You can also double-click `start-windows.bat` if your device allows local batch files.

## Optional AI Setup

The review package does not include secrets.

To enable live AI features, create:

```text
discovery-intake-webapp/.env.local
```

Use the provided template:

```bash
cp discovery-intake-webapp/.env.example discovery-intake-webapp/.env.local
```

Then add an approved key:

```text
OPENAI_API_KEY=your-approved-key
```

Do not email, commit, or paste API keys into chat, tickets, or review comments.

## Health And Stabilization Check

The app itself has no package install step. The stabilization checks use Playwright, so install dev dependencies first if this is a fresh machine:

```bash
npm install
node node_modules/playwright/cli.js install chromium
```

With the server running, run:

```bash
node scripts/run-stabilization-checks.mjs
```

This verifies syntax, local server health, enterprise transfer-kit readiness, DOCX generation, workbook import, Discovery first-page layout, template alignment, Reviewer Decision Summary, package ZIP creation, review-package creation, review-package safety/completeness, and Discovery interview routing.

To run only the enterprise transfer gate:

```bash
node scripts/check-enterprise-transfer-kit.mjs
```

To check whether the unzipped package is ready for a work machine or private work GitHub repository:

```bash
node scripts/check-work-environment-readiness.mjs
```

After creating the private work repository and work-only `.env.local`, use:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict
```

To regenerate the sanitized coworker review ZIP directly, run:

```bash
node scripts/build-review-package.mjs
node scripts/check-review-package.mjs
```

The package is written under `dist/`. The package doctor can also inspect a specific ZIP:

```bash
node scripts/check-review-package.mjs path/to/review-package.zip
```

To validate that the latest review ZIP can be unzipped and run from a clean folder, run:

```bash
node scripts/check-review-package-install.mjs --copy-local-env
```

That command copies your local `.env.local` into the temporary install folder without printing it, starts the installed app on an available local port, checks health, opens the root page, and runs the enterprise readiness plus handoff package smokes.

For work-machine transfer and coworker instructions, read:

- `ENTERPRISE_DEPLOYMENT_GUIDE.md`
- `WORK_ENVIRONMENT_STANDUP_RUNBOOK.md`
- `V1_RELEASE_CHECKLIST.md`
- `GITHUB_ENTERPRISE_SETUP.md`
- `MICROSOFT_365_CONNECTOR_SETUP.md`
- `ENVIRONMENT_VARIABLES.md`
- `WORK_COMPUTER_TRANSFER_CHECKLIST.md`
- `COWORKER_REVIEW_BRIEF.md`
- `SAFE_SAMPLE_SCENARIOS.md`
- `COWORKER_FEEDBACK_TEMPLATE.md`
