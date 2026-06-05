# Microsoft 365 Connector Setup

This project is connector-ready, but the default enterprise MVP posture is `CONNECTOR_MODE=mock`.

That means the app can describe connector requirements, generate approval packets, and support import/export workflows before it is granted real Microsoft 365 access.

## Plain-English Model

There are three different things people often blur together:

- Authentication: who the user is, usually through Microsoft Entra ID.
- Authorization: what the app is allowed to read or write, usually through Microsoft Graph permissions.
- Connector boundary: which SharePoint site, OneDrive folder, Teams channel, workbook, or mailbox the pilot is allowed to touch.

For finance-client work, keep these separate. A user being signed in does not automatically mean the app should read every file the user can access.

## Recommended v1.0 MVP Posture

Start here:

- Sign-in: optional until IT approves it
- Microsoft 365 connector mode: mock
- Data source: safe sample or approved test SharePoint location
- Operations: read-only
- Write-back: disabled
- Scope: one approved site, library, folder, or workbook
- Audit: human owner records each pilot run and approval decision

## Microsoft Entra App Registration

Ask an Entra admin to create or approve an app registration for the work environment.

Capture these values:

- Directory tenant ID
- Application client ID
- Redirect URI
- Approved Graph scopes
- Approved SharePoint site or OneDrive location
- Owner group for the app registration

Reference:

- Register an app for Microsoft Graph: https://learn.microsoft.com/en-us/graph/auth-register-app-v2
- Microsoft identity platform concepts: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols

## Redirect URI

For local work-machine MVP testing:

```text
http://localhost:5177/auth/microsoft/callback
```

Microsoft permits `http://localhost` redirect URIs for local development. Production or shared web hosting should use HTTPS and a separate app registration.

Reference:

- Redirect URI best practices: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url

## Permission Request Ladder

Request the smallest permission set that can prove the workflow.

| Phase | Permission | Purpose | Notes |
| --- | --- | --- | --- |
| 0 | None | Mock connector review | Default package posture |
| 1 | `User.Read` | Basic sign-in/user profile | Low-risk starting point |
| 2 | `Files.Read.All` or `Sites.Read.All` delegated | Read approved files the signed-in user can access | Use only for controlled pilot users |
| 3 | `Sites.Selected` | Limit app access to selected SharePoint sites | Preferred hardening path when app-only access is needed |
| 4 | Write permissions | Save outputs back to Microsoft 365 | Separate approval gate; disabled for MVP |

Reference:

- Microsoft Graph permission reference: https://learn.microsoft.com/en-us/graph/permissions-reference

## Environment Variables

Populate only in work-machine `.env.local` or an approved secret manager:

```text
ENTERPRISE_MODE=on
CONNECTOR_MODE=mock
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_REDIRECT_URI=http://localhost:5177/auth/microsoft/callback
MICROSOFT_GRAPH_SCOPES=User.Read Files.Read.All Sites.Read.All offline_access
MICROSOFT_SHAREPOINT_HOSTNAME=
MICROSOFT_SHAREPOINT_SITE_PATH=
MICROSOFT_GRAPH_SITE_ID=
MICROSOFT_GRAPH_DRIVE_ID=
```

Use `MICROSOFT_CLIENT_SECRET` only if IT explicitly approves a confidential-client flow. Do not commit it.

## SharePoint / OneDrive Pilot Boundary

Before live connector testing, document:

- Site hostname
- Site path
- Library or drive name
- Folder path
- Allowed workbook names or file patterns
- Data classification
- Business owner
- Security reviewer
- Retention expectation
- Whether outputs can be downloaded locally

Use `enterprise/microsoft-365-permissions.json` as the machine-readable request contract.

## Approval Gates

Gate 1: Mock connector package review

- Build Recipe and Connector Contracts are generated
- No live Microsoft 365 access
- Safe sample data only

Gate 2: Read-only test connector

- Entra app registration approved
- Read-only scope approved
- One pilot source location approved
- No write-back

Gate 3: Controlled pilot

- Named users only
- Data owner approval recorded
- Evidence log and promotion packet generated

Gate 4: Write-back or automation

- Separate security review
- Separate Graph permission request
- Audit and retention owner identified

## Stop Criteria

Stop before connector testing if:

- The requested scope is broader than the pilot boundary
- A reviewer cannot identify the data owner
- The source contains client confidential, regulated, personal, MNPI, PCI, PHI, or production client data without explicit approval
- The app would write to Microsoft 365 before the write gate is approved
- The package doctor or enterprise transfer-kit check fails

