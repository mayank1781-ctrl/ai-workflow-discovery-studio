/**
 * connector-catalog.mjs
 *
 * Single source of truth for every connector the app knows about.
 * Adding a new connector here automatically makes it:
 *   - detectable in interviews (via `keywords`)
 *   - includable in Recipe Books (via `recipe`)
 *   - includable in Engineering Docs (via `engineering`)
 *
 * DROP INTO: discovery-intake-webapp/connectors/catalog.mjs
 */

// ─── Tier definitions ─────────────────────────────────────────────────────────
// "core"   — Microsoft 365 + OpenAI. Always present. Never needs explicit mention.
// "add-on" — Detected from interview text. Included when found.

export const CONNECTOR_CATEGORIES = {
  msft:    { label: "Microsoft Ecosystem", emoji: "🔵", color: "#4C9EFF" },
  openai:  { label: "OpenAI Ecosystem",    emoji: "🟢", color: "#4ADE80" },
  crm:     { label: "CRM & Sales",         emoji: "🟡", color: "#F0A500" },
  erp:     { label: "ERP & Finance",       emoji: "🔴", color: "#FF6B6B" },
  project: { label: "Project & Work",      emoji: "🟠", color: "#FB923C" },
  data:    { label: "Data & Analytics",    emoji: "🟣", color: "#A78BFA" },
  comms:   { label: "Communication",       emoji: "💬", color: "#00C9A7" },
  dev:     { label: "Developer & Cloud",   emoji: "⚙️", color: "#94A3B8" },
};

// ─── The catalog ──────────────────────────────────────────────────────────────
export const CATALOG = [

  // ── Microsoft Ecosystem ────────────────────────────────────────────────────

  {
    id: "sharepoint",
    name: "SharePoint",
    category: "msft",
    tier: "core",
    recipeReady: true,
    keywords: [
      "sharepoint", "share point", "sp site", "sharepoint online",
      "sharepoint library", "document library", "sp list", "sharepoint list",
    ],
    recipe: {
      buildTime: "10 min",
      itRequired: false,
      itNote: "IT admin approves scope once for your organisation — one-time setup.",
      steps: [
        "In GPT Builder → Actions → Add Microsoft 365 connector",
        "Search 'SharePoint' and click Connect",
        "Sign in with your work account when prompted",
        "Select which sites this GPT can access (start narrow — one site)",
        "Test: ask 'List files in /Finance/Invoices'",
      ],
      examplePrompt: "List all files in the {folder} folder on {site} and return their names, size, and last modified date.",
    },
    engineering: {
      authTypes: ["delegated (MSAL)", "application (client credentials)"],
      readScopes:  ["Sites.Read.All", "Files.Read.All"],
      writeScopes: ["Files.ReadWrite.All", "Sites.ReadWrite.All"],
      preciseScope: "Sites.Selected (recommended for app-only access to specific sites)",
      sdks: {
        python: "msgraph-sdk-python · pip install msgraph-sdk",
        node:   "@microsoft/microsoft-graph-client · npm i @microsoft/microsoft-graph-client",
        dotnet: "Microsoft.Graph · dotnet add package Microsoft.Graph",
        java:   "microsoft-graph · implementation 'com.microsoft.graph:microsoft-graph:6.x'",
      },
      patterns: [
        "Delegated flow: user signs in via MSAL, token scoped to user's accessible sites",
        "App-only: client credentials + Sites.Selected for minimal permission footprint",
        "Pagination: use @odata.nextLink for large libraries (>200 items)",
      ],
      watchouts: [
        "Sites.Read.All grants access to ALL sites — prefer Sites.Selected in production",
        "Large file downloads: use /content endpoint, stream don't buffer",
        "SharePoint throttling: implement exponential backoff on 429 responses",
      ],
      docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/sharepoint",
    },
  },

  {
    id: "onedrive_excel",
    name: "Excel / OneDrive",
    category: "msft",
    tier: "core",
    recipeReady: true,
    keywords: [
      "excel", "onedrive", "one drive", "spreadsheet", "xlsx", "workbook",
      "excel file", "excel sheet", "excel online", ".xlsx", "excel tracker",
    ],
    recipe: {
      buildTime: "10 min",
      itRequired: false,
      steps: [
        "In GPT Builder → Actions → Add Microsoft 365 connector",
        "Search 'OneDrive' and click Connect",
        "Sign in with your work account",
        "Test: ask 'Open my Q1 tracker from OneDrive and show the first 10 rows'",
      ],
      examplePrompt: "Open the file at {onedrive_path} and read all rows where column {column} equals {value}.",
    },
    engineering: {
      authTypes: ["delegated (MSAL)"],
      readScopes:  ["Files.Read.All"],
      writeScopes: ["Files.ReadWrite.All"],
      sdks: {
        python: "msgraph-sdk-python — use /me/drive/items/{id}/workbook/worksheets",
        node:   "@microsoft/microsoft-graph-client",
        dotnet: "Microsoft.Graph",
      },
      patterns: [
        "Excel REST API via Graph: read/write cells, tables, named ranges without downloading",
        "For large workbooks: download file, process with openpyxl (Python) or ExcelJS (Node)",
        "Table reads: GET /workbook/tables/{name}/rows — returns JSON rows directly",
      ],
      watchouts: [
        "Excel Online session required for write operations — create session first, keep alive",
        "Max 5MB for inline read/write — download + process locally for larger files",
      ],
      docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/excel",
    },
  },

  {
    id: "outlook",
    name: "Outlook / Exchange",
    category: "msft",
    tier: "core",
    recipeReady: true,
    keywords: [
      "outlook", "email", "e-mail", "exchange", "inbox", "mail", "mailbox",
      "email attachment", "calendar invite", "meeting request", "outlook calendar",
    ],
    recipe: {
      buildTime: "10 min",
      itRequired: false,
      itNote: "Sending emails requires user review — GPT drafts, user sends.",
      steps: [
        "In GPT Builder → Actions → Add Microsoft 365 connector",
        "Search 'Outlook' and click Connect",
        "Sign in with your work account",
        "For send: enable Mail.Send scope — review draft before sending",
        "Test: ask 'Search my inbox for emails from vendor X in the last 7 days'",
      ],
      examplePrompt: "Search my inbox for emails from {sender} with subject containing '{keyword}' sent in the last {days} days. List subject, date, and any attachments.",
    },
    engineering: {
      authTypes: ["delegated (MSAL)"],
      readScopes:  ["Mail.Read", "Mail.ReadBasic"],
      writeScopes: ["Mail.Send", "Mail.ReadWrite"],
      sdks: {
        python: "msgraph-sdk-python",
        node:   "@microsoft/microsoft-graph-client",
        dotnet: "Microsoft.Graph",
      },
      patterns: [
        "Search: GET /me/messages?$search='keyword' (KQL search syntax)",
        "Attachments: GET /me/messages/{id}/attachments — download individually",
        "Send: POST /me/sendMail with message body + recipients",
      ],
      watchouts: [
        "Mail.ReadBasic cannot read body content — use Mail.Read for full content",
        "Attachments are base64 encoded — decode before processing",
        "$search and $filter cannot be combined in the same request",
      ],
      docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview",
    },
  },

  {
    id: "teams",
    name: "Microsoft Teams",
    category: "msft",
    tier: "core",
    recipeReady: true,
    keywords: [
      "teams", "microsoft teams", "teams channel", "teams message",
      "teams chat", "teams meeting", "ms teams",
    ],
    recipe: {
      buildTime: "15 min",
      itRequired: false,
      steps: [
        "In GPT Builder → Actions → Add Microsoft 365 connector",
        "Search 'Teams' and click Connect",
        "Select which channels this GPT can post to",
        "Test: ask 'Post a summary to the Finance channel'",
      ],
      examplePrompt: "Post the following summary to the {channel} channel in the {team} team: {summary}",
    },
    engineering: {
      authTypes: ["delegated (MSAL)", "Bot Framework (for interactive bots)"],
      readScopes:  ["ChannelMessage.Read.All", "Chat.Read"],
      writeScopes: ["ChannelMessage.Send", "Chat.ReadWrite"],
      sdks: {
        python: "msgraph-sdk-python · botbuilder-core for interactive bots",
        node:   "@microsoft/microsoft-graph-client · botbuilder for bots",
        dotnet: "Microsoft.Graph · Microsoft.Bot.Builder",
      },
      patterns: [
        "Outbound notification: POST /teams/{id}/channels/{id}/messages",
        "Incoming webhook: simple one-way posting without full auth setup",
        "Adaptive Cards: rich formatted messages with action buttons",
        "Bot Framework: for interactive back-and-forth conversations in Teams",
      ],
      watchouts: [
        "Incoming webhooks are deprecated — prefer Graph API for production",
        "Rate limit: 50 messages/second per channel",
      ],
      docsUrl: "https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview",
    },
  },

  {
    id: "copilot_studio",
    name: "Copilot Studio",
    category: "msft",
    tier: "core",
    recipeReady: true,
    keywords: [
      "copilot studio", "power virtual agents", "pva", "copilot agent",
      "microsoft copilot", "m365 copilot", "copilot extension",
    ],
    recipe: {
      buildTime: "30 min",
      itRequired: true,
      itNote: "Copilot Studio requires a Power Platform licence and admin enablement.",
      steps: [
        "Go to copilotstudio.microsoft.com — sign in with work account",
        "Create a new Copilot → select 'Agent for Microsoft 365'",
        "Define topics (what the agent responds to) and actions (what it can do)",
        "Connect to data sources via Power Platform connectors",
        "Publish to Teams / SharePoint / web channel",
      ],
      examplePrompt: "When a user asks about invoice status, look up the invoice in SharePoint and return the current status, amount, and due date.",
    },
    engineering: {
      authTypes: ["Integrated with Entra ID — no separate auth setup"],
      patterns: [
        "Use for no-code/low-code agent surfaces inside Microsoft 365",
        "Actions connect to any REST API via Power Platform custom connectors",
        "For complex logic: use Azure Functions as backend, call from Copilot Studio action",
        "Preferred over Custom GPTs when the user base is entirely Microsoft 365",
      ],
      watchouts: [
        "Requires Power Platform environment provisioning",
        "Token limits lower than ChatGPT Enterprise — keep context concise",
        "Custom connectors need IT approval in enterprise tenants",
      ],
      docsUrl: "https://learn.microsoft.com/en-us/microsoft-copilot-studio/",
    },
  },

  {
    id: "azure_openai",
    name: "Azure OpenAI",
    category: "msft",
    tier: "core",
    recipeReady: false,
    keywords: [
      "azure openai", "azure ai", "aoai", "azure gpt", "azure model",
      "azure cognitive", "azure ai services",
    ],
    recipe: null,
    engineering: {
      authTypes: ["API key", "Entra ID managed identity (recommended for production)"],
      models: ["gpt-4o", "gpt-4o-mini", "o1", "text-embedding-3-large"],
      sdks: {
        python: "openai · pip install openai (set AZURE_OPENAI_ENDPOINT + api_key)",
        node:   "openai · npm i openai (AzureOpenAI client)",
        dotnet: "Azure.AI.OpenAI · dotnet add package Azure.AI.OpenAI",
        java:   "com.azure:azure-ai-openai",
      },
      patterns: [
        "Managed identity: no API key in code — use DefaultAzureCredential",
        "Private endpoint: deploy inside VNet for data residency compliance",
        "Content filtering: configure per-deployment for enterprise policy",
        "Quota management: set TPM limits per deployment, not globally",
      ],
      watchouts: [
        "Model availability varies by region — check deployment availability first",
        "Azure OpenAI endpoint format differs from OpenAI API — not a drop-in swap",
        "Requires approved use case — submit request if not already provisioned",
      ],
      docsUrl: "https://learn.microsoft.com/en-us/azure/ai-services/openai/",
    },
  },

  // ── OpenAI Ecosystem ───────────────────────────────────────────────────────

  {
    id: "custom_gpt",
    name: "Custom GPT",
    category: "openai",
    tier: "core",
    recipeReady: true,
    keywords: [
      "custom gpt", "gpt builder", "chatgpt", "chat gpt", "gpt enterprise",
      "openai", "custom model", "company gpt", "my gpt",
    ],
    recipe: {
      buildTime: "20–45 min",
      itRequired: false,
      itNote: "Publishing to your company requires ChatGPT Enterprise or Team plan.",
      steps: [
        "Go to chatgpt.com → top-left menu → Explore GPTs → Create",
        "In the Configure tab: set name, description, and system prompt",
        "Add Actions to connect external tools (see connector steps above)",
        "In the Share section: set to 'Only people at [Company]'",
        "Test with your 3 sample prompts before sharing",
      ],
      examplePrompt: "You are {agent_name} for {company_name}. Your job is to {purpose}. Always {key_behavior}. Never {constraint}.",
    },
    engineering: {
      patterns: [
        "Custom GPTs are the fastest path to value — no code, no deployment",
        "For automation: use the Actions schema (OpenAPI spec) to connect any REST API",
        "For orchestration between GPTs: use the Responses API with tool_choice",
        "For production scale: migrate Custom GPT logic to Assistants API or Responses API",
      ],
      docsUrl: "https://platform.openai.com/docs/guides/gpt",
    },
  },

  {
    id: "assistants_api",
    name: "Assistants API",
    category: "openai",
    tier: "core",
    recipeReady: false,
    keywords: [
      "assistants api", "openai assistant", "thread", "run", "file search",
      "code interpreter", "function calling", "tool use",
    ],
    recipe: null,
    engineering: {
      authTypes: ["API key (OPENAI_API_KEY)", "Azure managed identity for Azure OpenAI"],
      sdks: {
        python: "openai · pip install openai>=1.0",
        node:   "openai · npm i openai",
        dotnet: "OpenAI · dotnet add package OpenAI",
        java:   "com.openai:openai-java",
      },
      patterns: [
        "Create persistent assistants with tools (file_search, code_interpreter, function_calling)",
        "Threads maintain conversation state — one thread per user session",
        "File search: upload documents to vector store, assistant retrieves relevant chunks",
        "Function calling: define tools the assistant can invoke — your code executes them",
        "Streaming: stream run events for real-time UI updates",
      ],
      watchouts: [
        "Threads are persistent but not infinite — implement cleanup for old threads",
        "File search has token overhead — tune chunk_size and chunk_overlap",
        "Polling vs streaming: use streaming for interactive UIs, polling for batch jobs",
      ],
      docsUrl: "https://platform.openai.com/docs/assistants/overview",
    },
  },

  {
    id: "responses_api",
    name: "Responses API",
    category: "openai",
    tier: "core",
    recipeReady: false,
    keywords: [
      "responses api", "openai responses", "stateless api", "tool_choice",
      "multi-turn", "function calling",
    ],
    recipe: null,
    engineering: {
      authTypes: ["API key"],
      sdks: { python: "openai>=1.66.0", node: "openai>=4.80.0" },
      patterns: [
        "Preferred for agentic pipelines — stateless, composable, explicit tool control",
        "Built-in tools: web_search, file_search, code_interpreter — no setup needed",
        "Remote MCP: connect any MCP server as a tool with one config line",
        "Computer use: automate browser/desktop actions (beta)",
        "Multi-agent: orchestrate agents by passing responses between model calls",
      ],
      watchouts: [
        "Stateless — you manage conversation history explicitly (pass previous_response_id)",
        "Newer API — check SDK version compatibility before upgrading",
      ],
      docsUrl: "https://platform.openai.com/docs/guides/responses-vs-chat-completions",
    },
  },

  // ── CRM & Sales ────────────────────────────────────────────────────────────

  {
    id: "salesforce",
    name: "Salesforce",
    category: "crm",
    tier: "add-on",
    recipeReady: true,
    keywords: [
      "salesforce", "sfdc", "salesforce crm", "sf crm", "salesforce org",
      "opportunities", "leads", "accounts", "crm pipeline", "salesforce reports",
    ],
    recipe: {
      buildTime: "20 min",
      itRequired: true,
      itNote: "Requires Salesforce admin to create a Connected App with OAuth scopes.",
      steps: [
        "Salesforce admin creates a Connected App: Setup → App Manager → New Connected App",
        "Enable OAuth with scopes: api, refresh_token, offline_access",
        "In GPT Builder → Actions → Add custom action → paste Salesforce OpenAPI spec",
        "Enter Client ID + Client Secret from your Connected App",
        "Test: ask 'Show me all opportunities closing this quarter'",
      ],
      examplePrompt: "Query Salesforce for all {object_type} where {field} = '{value}' and return {return_fields}.",
    },
    engineering: {
      authTypes: ["OAuth 2.0 (Web Server flow)", "JWT Bearer (server-to-server)"],
      readScopes: ["api", "refresh_token"],
      sdks: {
        python: "simple-salesforce · pip install simple-salesforce",
        node:   "jsforce · npm i jsforce",
        java:   "Force.com Java SDK or REST API directly",
        dotnet: "NetCoreForce · dotnet add package NetCoreForce",
      },
      patterns: [
        "SOQL queries: SELECT Id, Name FROM Opportunity WHERE CloseDate = THIS_QUARTER",
        "Bulk API 2.0: for large data exports (>10k records)",
        "Platform Events: subscribe to real-time Salesforce events via streaming",
        "Composite API: batch multiple record operations in one HTTP call",
      ],
      watchouts: [
        "API limits per org — check daily API call consumption in System Overview",
        "Sandbox vs Production: always test in sandbox first, different credentials",
        "SOQL injection: sanitise any user input before interpolating into queries",
      ],
      docsUrl: "https://developer.salesforce.com/docs/apis",
    },
  },

  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    tier: "add-on",
    recipeReady: true,
    keywords: [
      "hubspot", "hub spot", "hubspot crm", "hs portal",
      "hubspot deals", "hubspot contacts", "marketing hub",
    ],
    recipe: {
      buildTime: "15 min",
      itRequired: false,
      steps: [
        "In HubSpot: Settings → Integrations → Private Apps → Create private app",
        "Enable scopes: crm.objects.contacts.read, crm.objects.deals.read",
        "Copy the access token",
        "In GPT Builder → Actions → Add custom action with HubSpot OpenAPI spec",
        "Paste access token as Bearer auth",
      ],
      examplePrompt: "Search HubSpot contacts for '{name}' and return their company, email, and last activity date.",
    },
    engineering: {
      authTypes: ["Private App token (simplest)", "OAuth 2.0 for multi-portal apps"],
      sdks: {
        python: "hubspot-api-client · pip install hubspot-api-client",
        node:   "@hubspot/api-client · npm i @hubspot/api-client",
      },
      patterns: [
        "CRM Objects API: contacts, companies, deals, tickets via unified schema",
        "Search API: POST /crm/v3/objects/{objectType}/search with filters",
        "Workflows API: trigger HubSpot workflows programmatically",
        "Webhooks: subscribe to property changes and lifecycle stage transitions",
      ],
      docsUrl: "https://developers.hubspot.com/docs/api/overview",
    },
  },

  // ── ERP & Finance ──────────────────────────────────────────────────────────

  {
    id: "sap",
    name: "SAP",
    category: "erp",
    tier: "add-on",
    recipeReady: false,
    keywords: [
      "sap", "sap erp", "sap s4", "s/4hana", "s4hana", "sap hana",
      "sap bw", "sap r3", "sap fi", "sap co", "sap mm", "sap sd",
      "sap transaction", "t-code", "sap report",
    ],
    recipe: null,
    engineering: {
      authTypes: ["Service account (RFC/BAPI)", "OAuth via SAP Integration Suite"],
      patterns: [
        "RFC/BAPI (Python): pyrfc · pip install pyrfc (requires SAP NW RFC Library)",
        "SAP Integration Suite: REST gateway over SAP modules — preferred for new builds",
        "OData API: SAP Gateway exposes OData v2/v4 services — use for S/4HANA",
        "SAP BTP: build extensions on SAP Business Technology Platform with Python/Node/Java",
      ],
      sdks: {
        python: "pyrfc (RFC) · requests (OData/REST) · SAP Cloud SDK for Python",
        java:   "SAP Cloud SDK for Java · spring-boot integration",
        node:   "@sap-cloud-sdk/core (SAP Cloud SDK for JavaScript)",
        dotnet: "SAP Cloud SDK .NET (preview)",
      },
      watchouts: [
        "SAP licence terms: integration projects often require SAP connectivity licence",
        "pyrfc requires native SAP NW RFC Library — not pip-installable alone",
        "OData pagination: use $skiptoken for SAP OData paging (not $skip/$top)",
        "Always involve SAP Basis team for service account creation",
      ],
      docsUrl: "https://api.sap.com",
    },
  },

  {
    id: "workday",
    name: "Workday",
    category: "erp",
    tier: "add-on",
    recipeReady: false,
    keywords: [
      "workday", "workday hcm", "workday financials", "workday reports",
      "workday prism", "workday integration",
    ],
    recipe: null,
    engineering: {
      authTypes: ["OAuth 2.0 (client credentials)", "Workday Web Services (SOAP)"],
      patterns: [
        "Workday REST API: modern JSON API for most HCM and financial objects",
        "RAAS (Reports-as-a-Service): expose any Workday report as a REST endpoint",
        "WWS (SOAP): legacy but still required for some financial operations",
        "Workday Studio: for complex bi-directional integrations",
      ],
      watchouts: [
        "Workday tenants are production/sandbox — never test against production",
        "API versioning is strict — pin version in URL, e.g. /v40.0/",
        "OAuth token expiry is 1hr — implement refresh flow",
      ],
      docsUrl: "https://community.workday.com/node/73099",
    },
  },

  // ── Project & Work ─────────────────────────────────────────────────────────

  {
    id: "jira",
    name: "Jira",
    category: "project",
    tier: "add-on",
    recipeReady: true,
    keywords: [
      "jira", "jira cloud", "jira software", "jira service", "jira tickets",
      "jira issues", "sprint", "epic", "story points", "jira board",
      "atlassian jira", "jira project",
    ],
    recipe: {
      buildTime: "15 min",
      itRequired: false,
      steps: [
        "Go to id.atlassian.com → API tokens → Create API token",
        "Copy token and your Atlassian email address",
        "In GPT Builder → Actions → Add custom action with Jira OpenAPI spec",
        "Use Basic auth: base64(email:token)",
        "Test: ask 'Show me all open bugs in the {project} project'",
      ],
      examplePrompt: "Search Jira for all issues in project {project_key} where status = '{status}' and assignee = '{assignee}'. Return key, summary, priority, and due date.",
    },
    engineering: {
      authTypes: ["API token (Basic)", "OAuth 2.0 (3LO for user context)"],
      sdks: {
        python: "jira · pip install jira  OR  requests with Basic auth",
        node:   "jira-client · npm i jira-client  OR  axios",
        java:   "Atlassian JIRA REST Java Client",
        dotnet: "Atlassian.NET SDK",
      },
      patterns: [
        "JQL queries: project = MYPROJ AND status = 'In Progress' ORDER BY priority DESC",
        "Bulk fetch: use maxResults + startAt pagination (default max 50/page)",
        "Webhooks: subscribe to issue events for real-time integrations",
        "Issue transitions: POST /issue/{key}/transitions to move between statuses",
      ],
      docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
    },
  },

  {
    id: "servicenow",
    name: "ServiceNow",
    category: "project",
    tier: "add-on",
    recipeReady: false,
    keywords: [
      "servicenow", "service now", "snow", "servicenow tickets",
      "incident management", "change request", "cmdb", "itsm",
    ],
    recipe: null,
    engineering: {
      authTypes: ["Basic auth", "OAuth 2.0 (Authorization Code)", "Service account"],
      patterns: [
        "Table API: GET/POST/PATCH to /api/now/table/{tablename}",
        "Scripted REST API: custom endpoints defined in ServiceNow platform",
        "Import Sets: bulk data ingestion via staging tables",
        "Flow Designer: trigger automations via REST from external systems",
      ],
      watchouts: [
        "Sysparm_query syntax for filtering: active=true^category=software",
        "sys_id vs number: always store sys_id for references, display number for humans",
        "ACLs may restrict fields — test with your integration user, not admin",
      ],
      docsUrl: "https://developer.servicenow.com/dev.do#!/reference/api/tokyo/rest/",
    },
  },

  // ── Data & Analytics ───────────────────────────────────────────────────────

  {
    id: "snowflake",
    name: "Snowflake",
    category: "data",
    tier: "add-on",
    recipeReady: false,
    keywords: [
      "snowflake", "snow", "snowflake warehouse", "snowflake sql",
      "snowflake data", "cortex", "snowpark",
    ],
    recipe: null,
    engineering: {
      authTypes: ["Username/password", "Key-pair authentication (production)", "OAuth"],
      sdks: {
        python: "snowflake-connector-python · pip install snowflake-connector-python",
        java:   "snowflake-jdbc driver",
        node:   "snowflake-sdk · npm i snowflake-sdk",
        dotnet: "Snowflake.Data · dotnet add package Snowflake.Data",
      },
      patterns: [
        "Snowpark: run Python/Java/Scala directly in Snowflake — no data movement",
        "Cortex AI: built-in LLM functions (COMPLETE, EMBED_TEXT) inside SQL",
        "Secure view: expose data to GPT without raw table access",
        "Time travel: query historical snapshots with AT/BEFORE syntax",
      ],
      watchouts: [
        "Warehouse auto-suspend: ensure warehouse is running before queries — or auto-resume",
        "Cost model: per-credit billing — use clustering keys to reduce scan size",
      ],
      docsUrl: "https://docs.snowflake.com/en/developer-guide/",
    },
  },

  // ── Communication ──────────────────────────────────────────────────────────

  {
    id: "slack",
    name: "Slack",
    category: "comms",
    tier: "add-on",
    recipeReady: true,
    keywords: [
      "slack", "slack channel", "slack message", "slack bot",
      "slack workspace", "slack notification",
    ],
    recipe: {
      buildTime: "20 min",
      itRequired: true,
      itNote: "Requires Slack workspace admin to install a Slack app.",
      steps: [
        "Go to api.slack.com/apps → Create New App → From scratch",
        "OAuth & Permissions: add chat:write, channels:read scopes",
        "Install app to workspace (admin approves)",
        "Copy Bot User OAuth Token",
        "In GPT Builder → Actions: add Slack OpenAPI spec with Bearer token",
      ],
      examplePrompt: "Post the following message to the #{channel} Slack channel: {message}",
    },
    engineering: {
      authTypes: ["Bot token (OAuth)", "Webhook URL (incoming only, simpler)"],
      sdks: {
        python: "slack-sdk · pip install slack-sdk",
        node:   "@slack/web-api · npm i @slack/web-api",
        java:   "slack-api-client · com.slack.api:slack-api-client",
        dotnet: "SlackNet · dotnet add package SlackNet",
      },
      patterns: [
        "Incoming webhooks: simplest path for one-way notifications (no bot token needed)",
        "Block Kit: rich message formatting with interactive components",
        "Socket Mode: real-time event delivery without public URL (good for internal tools)",
        "Events API: subscribe to message/reaction/file events",
      ],
      docsUrl: "https://api.slack.com/docs",
    },
  },

  {
    id: "google_workspace",
    name: "Google Workspace",
    category: "comms",
    tier: "add-on",
    recipeReady: true,
    keywords: [
      "google workspace", "gsuite", "g suite", "google drive", "google docs",
      "google sheets", "gmail", "google calendar", "google slides",
      "google forms", "drive", "gcp",
    ],
    recipe: {
      buildTime: "20 min",
      itRequired: true,
      itNote: "Requires Google Workspace admin to approve OAuth app.",
      steps: [
        "Go to console.cloud.google.com → Create project",
        "Enable APIs: Drive, Sheets, Gmail as needed",
        "OAuth 2.0 credentials: Web app type, add your domain",
        "In GPT Builder → Actions: add Google API OpenAPI spec",
        "Test: ask 'List my recent Google Drive files'",
      ],
      examplePrompt: "Open the Google Sheet at {sheet_url}, read the tab '{tab_name}', and return all rows where column {column} is not empty.",
    },
    engineering: {
      authTypes: ["OAuth 2.0 (user context)", "Service account (domain-wide delegation)"],
      sdks: {
        python: "google-api-python-client + google-auth · pip install google-api-python-client google-auth",
        node:   "googleapis · npm i googleapis",
        java:   "google-api-java-client",
        dotnet: "Google.Apis · dotnet add package Google.Apis.Drive.v3",
      },
      patterns: [
        "Sheets: read/write cells via spreadsheets.values.get/update",
        "Drive: search files with q parameter: mimeType='application/vnd.google-apps.spreadsheet'",
        "Service account + domain delegation: access user files without OAuth consent flow",
      ],
      docsUrl: "https://developers.google.com/workspace",
    },
  },

  // ── Developer & Cloud ─────────────────────────────────────────────────────

  {
    id: "github",
    name: "GitHub",
    category: "dev",
    tier: "add-on",
    recipeReady: false,
    keywords: [
      "github", "git", "github repo", "pull request", "pr", "github issues",
      "github actions", "repository", "code review", "git commit",
    ],
    recipe: null,
    engineering: {
      authTypes: ["Personal Access Token (PAT)", "GitHub App (production)"],
      sdks: {
        python: "PyGithub · pip install PyGithub  OR  gh CLI",
        node:   "octokit · npm i @octokit/rest",
        java:   "github-api · org.kohsuke:github-api",
        dotnet: "Octokit · dotnet add package Octokit",
      },
      patterns: [
        "GitHub Apps: preferred over PATs for production — scoped, auditable, rotatable",
        "REST API: repos, issues, PRs, actions — most use cases",
        "GraphQL API: efficient for complex queries with many related objects",
        "Webhooks: real-time events for push, PR, issue, workflow events",
      ],
      docsUrl: "https://docs.github.com/en/rest",
    },
  },

  {
    id: "rest_webhook",
    name: "REST API / Webhook",
    category: "dev",
    tier: "add-on",
    recipeReady: true,
    keywords: [
      "api", "rest api", "rest", "webhook", "http", "endpoint",
      "json api", "custom api", "internal api", "web service",
    ],
    recipe: {
      buildTime: "30 min",
      itRequired: false,
      steps: [
        "Get the API's OpenAPI/Swagger spec (ask the API owner or check /docs)",
        "If no spec exists: document 2–3 key endpoints manually in OpenAPI YAML",
        "In GPT Builder → Actions → Create new action → paste OpenAPI spec",
        "Set auth (API key / Bearer token) in the auth section",
        "Test with a simple read operation first before adding write operations",
      ],
      examplePrompt: "Call the {api_name} API to {action} and return {expected_output}.",
    },
    engineering: {
      authTypes: ["API key", "OAuth 2.0", "Bearer token", "Basic auth", "mTLS"],
      sdks: {
        python: "httpx (async) or requests (sync) · pip install httpx",
        node:   "fetch (native) or axios · npm i axios",
        dotnet: "HttpClient (built-in)",
        java:   "OkHttp · com.squareup.okhttp3:okhttp  OR  WebClient (Spring)",
      },
      patterns: [
        "Retry with exponential backoff for transient 429/503 errors",
        "Circuit breaker: fail fast after N consecutive errors (use tenacity in Python)",
        "Pagination: handle cursor, offset/limit, and Link header patterns",
        "Async: use httpx.AsyncClient / fetch for concurrent calls to multiple APIs",
      ],
      docsUrl: "https://swagger.io/specification/",
    },
  },

];

// ─── Helper exports ───────────────────────────────────────────────────────────

/** Returns all connectors for a given category */
export function getByCategory(categoryId) {
  return CATALOG.filter(c => c.category === categoryId);
}

/** Returns all recipe-ready connectors */
export function getRecipeReady() {
  return CATALOG.filter(c => c.recipeReady);
}

/** Returns a connector by id */
export function getById(id) {
  return CATALOG.find(c => c.id === id) ?? null;
}

/** Returns the full keyword list across all connectors — used by the detector */
export function getAllKeywords() {
  return CATALOG.flatMap(c =>
    c.keywords.map(kw => ({ connectorId: c.id, keyword: kw }))
  );
}
