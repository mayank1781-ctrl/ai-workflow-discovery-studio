# Email Transfer Note

Use this note when sending the review ZIP to yourself or coworkers.

## File To Send

Send the latest ZIP from `dist/` only. Do not send the extracted folder.

Use the newest file matching:

```text
dist/ai-workflow-discovery-studio-review-*.zip
```

## Copy-Ready Email

Subject: AI Workflow Discovery Studio review ZIP

Hi,

Attached is the local review ZIP for AI Workflow Discovery Studio.

Please unzip it into a normal working folder, then from the unzipped package root run:

```bash
node scripts/check-review-package.mjs
node scripts/start-local.mjs
```

Then open:

```text
http://localhost:5177/
```

Use only synthetic, sanitized, or explicitly approved sample workflows. Do not use client confidential, regulated, personal, MNPI, PCI, PHI, or production client data.

Please review:

- Discovery question order
- Product PDR, Engineering Brief, Business Value, Governance Inputs, Build Recipe, and Combined Packet outputs
- Build Recipe routing: ChatGPT-first, Microsoft 365 Copilot-first, or hybrid agent/action path
- Solution Capability Plan: ChatGPT capabilities, Microsoft Copilot surfaces, human checkpoints, and enterprise hardening phases
- Enterprise Readiness Brief: release gates, owners, testing evidence, connector approvals, and next actions
- Workbook/package export behavior
- Security and data-handling assumptions

Live AI features need a separate approved API key on the target machine. The ZIP does not include `.env.local` or any API key.

## Attachment Safety Check

Before sending, run:

```bash
node scripts/check-review-package.mjs
```

Expected result: the doctor checks the latest review ZIP and confirms no `.env.local`, API key, generated data, dependency folders, or local user paths are included.
