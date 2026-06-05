# Next-Level Enterprise Roadmap

Use this after the v1.0 enterprise MVP is running on the work computer.

This roadmap separates what to do immediately from what to request or build after IT/security approval. It is intentionally practical: the next level should improve real workflow discovery, package quality, connector readiness, and controlled enterprise adoption without prematurely turning the app into a production platform.

## Current Position

Current app state: v1.0 enterprise MVP transfer-ready.

Strong now:

- Local app runs from a sanitized review ZIP.
- Full stabilization and clean-install smoke passed.
- Package doctor excludes `.env.local`, secrets, generated app data, and local machine paths.
- App generates Product, Engineering, Business, Governance, Build Recipe, Execution Plan, Enterprise Readiness, and Connector review artifacts.
- Work-environment readiness checker exists.
- Microsoft 365 connector posture is explicit: keep `CONNECTOR_MODE=mock` until approved.

Known next gaps:

- Work GitHub repository must be created.
- Work-approved `.env.local` must be created.
- Work-approved OpenAI / ChatGPT Enterprise / Azure OpenAI path must be decided.
- Microsoft Entra app registration and Microsoft Graph permissions are not configured yet.
- Real Microsoft 365 connector implementation has not been enabled.
- Audit, retention, and enterprise storage patterns are still MVP-level.

## Recommended Next Sequence

### 1. Work Repo And Local Runtime

Do first on the work computer:

```bash
node scripts/check-work-environment-readiness.mjs
node scripts/check-enterprise-transfer-kit.mjs
node scripts/start-local.mjs
```

Then create a private work GitHub repository and run:

```bash
node scripts/check-work-environment-readiness.mjs --github-required
node scripts/check-work-environment-readiness.mjs --work-strict
```

Goal: prove the app runs and can be developed safely before connector work begins.

### 2. Safe-Sample Pilot

Run 2-3 safe-sample discovery sessions:

- One client-delivery workflow
- One pre-delivery/workshop-prep workflow
- One internal/reusable asset workflow

For each session, export:

- Product PDR
- Engineering Brief
- Business Value
- Governance Inputs
- Solution Build Recipe
- Solution Execution Plan
- Enterprise Readiness Brief
- Connector Promotion Decision Packet

Goal: tune the discovery questions and output quality before real data or live connectors.

### 3. Work-Approved AI Path

Decide which AI path is approved:

- ChatGPT Enterprise manual use
- OpenAI API with work-owned project key
- Azure OpenAI / enterprise managed endpoint, if required by policy
- No live AI during early review

Keep the app usable without live AI. Live AI should improve extraction and drafting, not become required for code and logic review.

### 4. Microsoft 365 Connector Approval

Start with the smallest useful Microsoft 365 data boundary:

- One SharePoint site
- One document library or folder
- Read-only access
- Named pilot users
- No write-back

Run only after approval:

```bash
node scripts/check-work-environment-readiness.mjs --work-strict --connector-approved
```

Goal: graduate from connector contracts to a safe real connector pilot.

## Connector Options To Consider

### Microsoft 365 Copilot Connectors

Best for: making approved external knowledge discoverable in Microsoft 365 Copilot and Microsoft Search.

Current Microsoft docs distinguish:

- Synced connectors: index data into Microsoft 365 / Microsoft Graph.
- Federated connectors: early access preview; use MCP to fetch data live without indexing into Microsoft 365.

Recommendation for this app:

- Use synced/prebuilt connectors where available for stable enterprise sources.
- Consider federated connectors later for sensitive or dynamic data where indexing is not appropriate.
- Use custom connectors only when prebuilt connectors do not cover the source.

Useful source types:

- SharePoint / OneDrive
- Network file shares
- Confluence / MediaWiki / internal wiki
- Salesforce / ServiceNow / Jira / Zendesk, if relevant
- SQL / Oracle / SAP / Azure data sources, if approved

### Microsoft Graph API

Best for: controlled read-only access to Microsoft 365 files, sites, drives, workbook content, and identity context.

Recommended MVP path:

- `User.Read` for sign-in
- Read-only SharePoint/OneDrive scopes for approved pilot data
- `Sites.Selected` for stronger site-level boundaries when app-only access is needed
- No write scopes until a separate approval gate

Build idea:

- Add a Microsoft config screen that reads only non-secret status from `/api/enterprise/config-status`.
- Add a source-boundary form for site, library, folder, owner, and data class.
- Add a read-only file picker after Entra approval.
- Keep manual upload as fallback.

### Copilot Studio / Power Platform Connectors

Best for: controlled agent actions and workflows once the use case is clear.

Recommendation:

- Do not start here for MVP discovery.
- Use the app to produce the Solution Build Recipe and Connector Build Request Pack first.
- Use Copilot Studio connectors or Power Automate only after a workflow owner approves specific read/write actions.

Good later use cases:

- Create a Teams notification after a reviewed intake package is ready.
- Save approved output artifacts to SharePoint.
- Open an approval task for a data owner or governance reviewer.
- Trigger follow-up workflow from the Connector Promotion Decision Packet.

### OpenAI Tools, MCP, And ChatGPT Apps

Best for: turning the app into a richer assistant or tool surface after core MVP review.

Options:

- OpenAI Responses API with tools/function calling for structured generation.
- Remote MCP servers for enterprise systems that have approved access controls.
- OpenAI-maintained connectors where available and approved.
- ChatGPT Apps SDK if you want the app to become an interactive ChatGPT app surface.
- OpenAI developer docs MCP in Codex so the work-computer Codex can fetch current docs while building.

Recommendation:

- Keep current local web app first.
- Add MCP/connector capability behind approval gates.
- Keep all connector outputs explainable in the Solution Build Recipe and Enterprise Readiness Brief.

### GitHub And Codex

Best for: ongoing engineering, code review, issue tracking, branch discipline, and CI checks.

Use on work computer:

- GitHub plugin/connector for repo, PR, issue, and CI review if available.
- Codex local terminal commands for app checks.
- Browser plugin for local app screenshots and visual checks.
- Documents / Spreadsheets plugins for polished reviewer artifacts.

Recommended GitHub upgrades:

- Private repository
- Branch protection
- Required review before merging to `main`
- GitHub Actions using `.github/workflows/enterprise-transfer-check.yml`
- Issues for workflow pilots, connector approval tasks, and output-quality backlog
- Pull request template that asks about data boundary, permissions, generated files, and package doctor

## Useful Codex Plugins / Skills

If available on the work computer, these are the most useful:

- GitHub: repository setup, PR review, CI debugging, issue tracking, and publishing changes.
- Browser: open and screenshot the local app at `localhost`, verify UI flows, and catch layout issues.
- OpenAI Developers: API key setup, OpenAI docs, Apps SDK, Agents SDK, and troubleshooting.
- Documents: generate polished DOCX/PDF reviewer documents.
- Spreadsheets: inspect workbook exports and create Excel-ready templates.
- Presentations: create internal pilot/demo decks.
- Multi-agent tools: split review across code quality, UX, enterprise controls, and connector contracts.
- Gmail: only if work policy allows mailbox access; not needed for core app development.
- Hugging Face: optional; useful only if you later evaluate open-source models, datasets, or Spaces.

## Practical Next Features

### Highest Value

1. Work GitHub setup wizard/checklist inside the docs panel.
2. Safe-sample pilot launcher with 3 built-in scenarios.
3. Better “Create Package” walkthrough and package contents preview.
4. One-page reviewer summary generated from each handoff package.
5. Microsoft 365 source-boundary setup screen.
6. Entra/Graph config status panel that never exposes secrets.
7. Read-only SharePoint/OneDrive file import after approval.
8. Workbook import/export polishing for real reviewer round-trips.

### Enterprise Controls

1. Local audit log for package creation, import, export, and connector checks.
2. Data classification field required before package export.
3. Explicit retention warning before saving generated local sessions.
4. Review gate that blocks “enterprise ready” label unless owner, data class, test evidence, and connector approval are present.
5. JSON schema validation for all machine-readable outputs.
6. Package doctor enforcement in GitHub Actions.

### UX Improvements

1. “Start a safe sample” button.
2. Cleaner first-run onboarding for reviewers.
3. “What to review next” panel in Analysis Studio.
4. Better visual distinction between captured facts, inferred assumptions, and supplement-later items.
5. One-click export bundle for reviewer overview plus generated output package.

## What Not To Do Yet

- Do not enable write-back to Microsoft 365.
- Do not connect to production client data.
- Do not make the app tenant-wide.
- Do not store secrets in GitHub or docs.
- Do not make live AI mandatory for review.
- Do not add broad Microsoft Graph scopes just to make testing easier.

## Source Links

- Microsoft 365 Copilot connectors overview: https://learn.microsoft.com/en-us/microsoftsearch/connectors-overview
- Microsoft Graph / Copilot connectors overview: https://learn.microsoft.com/en-us/graph/connecting-external-content-connectors-overview
- Federated connectors overview: https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/federated-connectors-overview
- Copilot Studio Power Platform connectors as tools: https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-connectors
- Microsoft 365 Copilot extensibility ecosystem: https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/ecosystem
- OpenAI MCP and connectors guide: https://platform.openai.com/docs/guides/tools-remote-mcp
- OpenAI developer docs MCP: https://platform.openai.com/docs/docs-mcp

