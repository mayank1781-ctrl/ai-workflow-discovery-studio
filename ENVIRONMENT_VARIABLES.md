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

## Local Safety Rules

- Empty values in `.env.example` are intentional.
- Real values belong only in `.env.local`, GitHub Actions secrets, or an approved enterprise secret manager.
- The app health endpoint reports configuration booleans, not secret values.
- Keep `CONNECTOR_MODE=mock` until the Microsoft 365 connector gate is approved.

