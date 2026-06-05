# Security And Data Handling

This review build is intended for local review and safe sample testing.

## Data Boundary

By default, the app runs on your machine at:

```text
http://localhost:5177/
```

The browser UI stores the active session in browser `localStorage`. The local server can also write sessions and output packages under:

```text
discovery-intake-webapp/data/
```

The review package excludes that generated data directory.

## OpenAI API Usage

The app only calls OpenAI APIs when an approved API key is configured in:

```text
discovery-intake-webapp/.env.local
```

The review package does not include `.env.local` or API keys.

When configured, the local server may send typed answers, transcript text, and evidence content to the configured AI endpoints for extraction, transcription, evidence analysis, or voice.

Do not use sensitive data unless your internal governance process approves that data path.

## Evidence Uploads

The app supports optional evidence uploads such as screenshots, documents, spreadsheets, and notes.

For review:

- Use synthetic examples or approved internal test data.
- Do not upload client confidential, personal, regulated, MNPI, PCI, PHI, or production client data.
- Do not upload documents with credentials, tokens, API keys, system URLs, private client names, or proprietary client details.

## Included And Excluded From Review Packages

Included:

- Source code
- Docs
- Launcher scripts
- Vendor browser libraries
- Sanitized sample extraction JSON for demo review

Excluded:

- `.env.local`
- API keys and secrets
- `node_modules`
- `.git`
- generated server sessions
- generated handoff packages
- local test screenshots/workbooks
- server logs and PID files

## Reviewer Rule Of Thumb

Treat this as a local prototype until Enterprise hosting, identity, storage, retention, audit, and approved connector contracts are reviewed.

