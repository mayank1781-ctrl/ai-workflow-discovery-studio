# Environment Variables

Use `discovery-intake-webapp/.env.example` as the template. Create `.env.local` only on the machine where the app runs.

Never commit `.env.local`.

## App Runtime

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | Yes | `5177` | Local server port |
| `APP_ENV` | Recommended | `enterprise-local` | Human-readable environment label |
| `APP_BASE_URL` | Recommended | `http://localhost:5177` | Used for enterprise setup notes and redirect planning |
| `ENTERPRISE_MODE` | Recommended | `on` | Set to `off` for personal/local review |
| `CONNECTOR_MODE` | Recommended | `mock` | Use `mock` until Microsoft 365 approval is complete |

## OpenAI / ChatGPT Features

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Optional | empty in template | Required only for live AI extraction, transcription, and voice |
| `REALTIME_MODEL` | Optional | `gpt-realtime-2` | Voice model label |
| `REALTIME_VOICE` | Optional | `marin` | Voice setting |
| `REALTIME_REASONING_EFFORT` | Optional | `low` | Voice reasoning setting |
| `TRANSCRIPTION_MODEL` | Optional | `gpt-4o-transcribe` | Post-turn transcription model |
| `EXTRACTION_MODEL` | Optional | `gpt-5.5` | Structured extraction model |
| `EXTRACTION_REASONING_EFFORT` | Optional | `medium` | Structured extraction reasoning setting |
| `EXTRACTION_VERBOSITY` | Optional | `low` | Structured extraction verbosity |
| `CHAT_REASONING_EFFORT` | Optional | `low` | Chat response setting |
| `CHAT_VERBOSITY` | Optional | `low` | Chat response setting |

## Microsoft 365 Connector Values

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `MICROSOFT_TENANT_ID` | For connector pilot | empty in template | Directory tenant ID from Entra |
| `MICROSOFT_CLIENT_ID` | For connector pilot | empty in template | Application client ID from Entra |
| `MICROSOFT_CLIENT_SECRET` | Usually no for local MVP | empty in template | Use only if IT approves a confidential-client flow |
| `MICROSOFT_REDIRECT_URI` | For sign-in pilot | `http://localhost:5177/auth/microsoft/callback` | Must match Entra app registration |
| `MICROSOFT_GRAPH_SCOPES` | For connector pilot | `User.Read Files.Read.All Sites.Read.All offline_access` | Keep read-only for MVP |
| `MICROSOFT_SHAREPOINT_HOSTNAME` | For SharePoint pilot | empty in template | Example shape: `contoso.sharepoint.com` |
| `MICROSOFT_SHAREPOINT_SITE_PATH` | For SharePoint pilot | empty in template | Example shape: `/sites/WorkflowDiscoveryPilot` |
| `MICROSOFT_GRAPH_SITE_ID` | Optional | empty in template | Use after IT confirms target site |
| `MICROSOFT_GRAPH_DRIVE_ID` | Optional | empty in template | Use after IT confirms target library/drive |
| `MICROSOFT_GRAPH_FOLDER_PATH` | Optional | empty in template | Narrow folder boundary for pilot data |

## GitHub Values

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `GITHUB_REPOSITORY` | Recommended | empty in template | Work repository name such as `org/repo` |
| `GITHUB_DEFAULT_BRANCH` | Recommended | `main` | Default branch for review workflow references |
| `GITHUB_ACTIONS_ENABLED` | Optional | `true` | Human-readable flag for enterprise setup status |

## Optional Add-On Provider Values

Leave these blank unless the work environment has approved the vendor, data boundary, retention settings, and secret-management path.

| Variable | Required | Unlocks | Notes |
| --- | --- | --- | --- |
| `ELEVENLABS_API_KEY` | Optional | Voice narration | Reviewer walkthrough or training playback after approval |
| `FISH_AUDIO_API_KEY` | Optional | Voice narration | Alternative generated voice provider after approval |
| `DEEPGRAM_API_KEY` | Optional | Speech-to-text | Long-form interview transcription, diarization, vocabulary tuning |
| `ASSEMBLYAI_API_KEY` | Optional | Speech intelligence | Long-form meeting transcript analysis and topic extraction |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Optional | Document intelligence | Enterprise OCR/layout extraction for PDFs, screenshots, forms, and tables |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Optional | Document intelligence | Pair with endpoint above; store only in `.env.local` or an approved secret manager |
| `LLAMAPARSE_API_KEY` | Optional | Document parsing | Complex PDF/table extraction after vendor approval |
| `MISTRAL_API_KEY` | Optional | OCR/document parsing | Optional OCR path for image-heavy files after vendor approval |
| `PRESIDIO_ENDPOINT` | Optional | PII review | Approved Presidio endpoint for PII detection/redaction checks |
| `AZURE_AI_LANGUAGE_ENDPOINT` | Optional | PII review | Managed Azure PII entity detection endpoint |
| `AZURE_AI_LANGUAGE_KEY` | Optional | PII review | Pair with Azure AI Language endpoint above |
| `BRAINTRUST_API_KEY` | Optional | Evals | Extraction/recipe regression evaluation after tool approval |
| `LANGFUSE_PUBLIC_KEY` | Optional | Observability | Pilot tracing after telemetry policy approval |
| `LANGFUSE_SECRET_KEY` | Optional | Observability | Pair with Langfuse public key; never commit |
| `ADDON_LIVE_TEST_TIMEOUT_MS` | Optional | Add-on Test Lab | Timeout for safe live provider preflight checks; defaults to `8000` |

## Phase 5 — Azure AD Sign-in Gate

The app can gate every route behind Microsoft (Azure AD) sign-in. The gate is a
no-op while `AUTH_ENABLED=false` (the default), so the app runs completely
un-gated until an Azure app registration is wired. Sessions are a stateless,
HMAC-signed, httpOnly cookie — no server-side session store, no new dependencies.

| Variable | Required when gated | Purpose |
|---|---|---|
| `AUTH_ENABLED` | Always | `true` turns the gate on; `false` (default) leaves the app fully open |
| `AUTH_AZURE_TENANT_ID` | Yes | Azure AD tenant (directory) ID — single-tenant; the `id_token` `tid` claim must match |
| `AUTH_AZURE_CLIENT_ID` | Yes | Application (client) ID of the login app registration |
| `AUTH_AZURE_CLIENT_SECRET` | Yes | Client secret for the code→token exchange; store only in `.env.local`/secret manager |
| `AUTH_REDIRECT_URI` | Yes | Must exactly match the redirect URI registered in Azure; defaults to `${APP_BASE_URL}/auth/microsoft/callback` |
| `AUTH_SESSION_SECRET` | Yes | Secret used to HMAC-sign the session cookie; generate with `node -e "console.log(crypto.randomBytes(32).toString('hex'))"` |
| `AUTH_SESSION_TTL_HOURS` | Optional | Cookie lifetime in hours (default `12`); on expiry the user re-signs in |

Routes added: `GET /auth/login` → Microsoft authorize redirect; `GET /auth/microsoft/callback`
→ token exchange + set cookie; `POST /auth/logout` → clear cookie; `GET /api/me` → current user.
`/api/health` and `/login.html` stay public. Azure app registration: scopes `openid profile email`,
redirect URI = `AUTH_REDIRECT_URI`. The `id_token` is verified (5b): its RS256 signature is checked
against the tenant's Azure JWKS, and the issuer, audience (`AUTH_AZURE_CLIENT_ID`), tenant
(`AUTH_AZURE_TENANT_ID`), and expiry claims are validated before a session is issued.

## Local Safety Rules

- Empty values in `.env.example` are intentional.
- Real values belong only in `.env.local`, GitHub Actions secrets, or an approved enterprise secret manager.
- The app health endpoint reports configuration booleans and provider names, not secret values.
- Keep `CONNECTOR_MODE=mock` until the Microsoft 365 connector gate is approved.
