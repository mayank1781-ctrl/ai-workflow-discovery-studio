import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import dotenv from "dotenv";
import Busboy from "busboy";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { detectConnectors, formatForRecipe } from "./connectors/connector-detector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// pdf-parse's package index runs a debug routine against a bundled test PDF
// when required as the main module; importing the lib file directly avoids it.
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fsSync.existsSync(envPath)) return;

  const lines = fsSync.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

// Load `.env.local` first (it keeps precedence for existing setups), then fall
// back to `.env` via dotenv. Both are directory-relative and neither overrides
// a variable already present in the real environment (e.g. PORT from a script).
loadLocalEnv();
dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = Number(process.env.PORT || 5173);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PATTERN_HANDOFF_MODEL = process.env.PATTERN_HANDOFF_MODEL || "claude-sonnet-4-6";
const AI_MIRROR_MODEL = process.env.AI_MIRROR_MODEL || "claude-sonnet-4-6";
const DUMP_EXTRACT_MODEL = process.env.DUMP_EXTRACT_MODEL || "claude-sonnet-4-6";
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-realtime-2";
const REALTIME_VOICE = process.env.REALTIME_VOICE || "marin";
const REALTIME_REASONING_EFFORT = process.env.REALTIME_REASONING_EFFORT || "low";
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE || "alloy";
const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || process.env.OPENAI_MODEL || "gpt-5.5";
const DOCUMENT_EXTRACTION_MODEL = process.env.EXTRACT_DOC_MODEL || "gpt-4o";
const HARVEST_MODEL = process.env.HARVEST_MODEL || "gpt-4o";
const RECIPE_MODEL = process.env.RECIPE_MODEL || "gpt-4o-mini";
const EXTRACTION_REASONING_EFFORT = process.env.EXTRACTION_REASONING_EFFORT || "medium";
const EXTRACTION_VERBOSITY = process.env.EXTRACTION_VERBOSITY || "low";
const CHAT_REASONING_EFFORT = process.env.CHAT_REASONING_EFFORT || "low";
const CHAT_VERBOSITY = process.env.CHAT_VERBOSITY || "low";
const APP_ENV = process.env.APP_ENV || "local";
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const ENTERPRISE_MODE = process.env.ENTERPRISE_MODE || "off";
const CONNECTOR_MODE = process.env.CONNECTOR_MODE || "mock";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "";
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || "";
const MICROSOFT_GRAPH_SCOPES = process.env.MICROSOFT_GRAPH_SCOPES || "";
const MICROSOFT_SHAREPOINT_HOSTNAME = process.env.MICROSOFT_SHAREPOINT_HOSTNAME || "";
const MICROSOFT_SHAREPOINT_SITE_PATH = process.env.MICROSOFT_SHAREPOINT_SITE_PATH || "";
const MICROSOFT_GRAPH_SITE_ID = process.env.MICROSOFT_GRAPH_SITE_ID || "";
const MICROSOFT_GRAPH_DRIVE_ID = process.env.MICROSOFT_GRAPH_DRIVE_ID || "";
const MICROSOFT_GRAPH_FOLDER_PATH = process.env.MICROSOFT_GRAPH_FOLDER_PATH || "";
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "";
const GITHUB_DEFAULT_BRANCH = process.env.GITHUB_DEFAULT_BRANCH || "main";
const GITHUB_ACTIONS_ENABLED = process.env.GITHUB_ACTIONS_ENABLED || "false";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY || "";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY || "";
const AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "";
const AZURE_DOCUMENT_INTELLIGENCE_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "";
const LLAMAPARSE_API_KEY = process.env.LLAMAPARSE_API_KEY || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const PRESIDIO_ENDPOINT = process.env.PRESIDIO_ENDPOINT || "";
const AZURE_AI_LANGUAGE_ENDPOINT = process.env.AZURE_AI_LANGUAGE_ENDPOINT || "";
const AZURE_AI_LANGUAGE_KEY = process.env.AZURE_AI_LANGUAGE_KEY || "";
const BRAINTRUST_API_KEY = process.env.BRAINTRUST_API_KEY || "";
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || "";
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || "";
const ADDON_LIVE_TEST_TIMEOUT_MS = Number(process.env.ADDON_LIVE_TEST_TIMEOUT_MS || 8000);

// --- Phase 5a: Azure AD auth gate (scaffolding) -----------------------------
// Single-tenant OAuth2 code flow with stateless signed-cookie sessions. The
// whole gate is a no-op while AUTH_ENABLED is false, so the app runs completely
// un-gated by default (local dev + CI stay green). JWKS signature verification
// of the id_token is intentionally deferred to 5b — in 5a the token is trusted
// because it arrives over a direct server-to-server TLS channel.
const AUTH_ENABLED = String(process.env.AUTH_ENABLED || "false").toLowerCase() === "true";
const AUTH_AZURE_TENANT_ID = process.env.AUTH_AZURE_TENANT_ID || "";
const AUTH_AZURE_CLIENT_ID = process.env.AUTH_AZURE_CLIENT_ID || "";
const AUTH_AZURE_CLIENT_SECRET = process.env.AUTH_AZURE_CLIENT_SECRET || "";
const AUTH_REDIRECT_URI = process.env.AUTH_REDIRECT_URI
  || `${process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5173}`}/auth/microsoft/callback`;
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || "";
const AUTH_SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS || 12);
const AUTH_COOKIE_SECURE = String(process.env.APP_ENV || "local").toLowerCase() !== "local";
const AUTH_COOKIE_NAME = "ds_session";
// Phase 5e: Azure oids allowed to read the full audit log (comma-separated).
// Everyone else only sees their own entries via /api/audit.
const AUTH_ADMIN_SUBS = new Set(
  String(process.env.AUTH_ADMIN_SUBS || "").split(",").map((s) => s.trim()).filter(Boolean)
);

const DATA_DIR = path.join(__dirname, "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const AUDIT_DIR = path.join(DATA_DIR, "audit");
const PACKAGES_DIR = path.join(DATA_DIR, "packages");
const CONNECTIONS_DIR = path.join(DATA_DIR, "connections");

// Phase 6a: Jira (Atlassian Cloud) connector — OAuth2 3LO, zero new deps.
const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID || "";
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET || "";
const JIRA_REDIRECT_URI = process.env.JIRA_REDIRECT_URI || "http://localhost:5173/api/connectors/jira/callback";
const jiraOAuthStates = new Map(); // state → { userId, exp }

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip"
};

const intakeFieldKeys = [
  "submittedIdea",
  "submittedWorkflowTask",
  "submittedWhereToday",
  "submittedFrequency",
  "submittedCurrentEffort",
  "submittedCandidateAiAssist",
  "submittedHumanReviewNeeded",
  "submittedRepeatability",
  "submittedExpectedImpact",
  "submittedNotes",
  "useCaseArchetype",
  "workflowCategory",
  "recordType",
  "practice",
  "unitOfAnalysis",
  "ideaValidationStatus",
  "buildReadiness",
  "primaryTimeDriver",
  "candidateAiAssistValidation",
  "productClarifications",
  "engineeringClarifications",
  "commercialValuePath",
  "projectType",
  "priority",
  "automationPotential",
  "gateDecision",
  "workflowName",
  "domain",
  "engagementProjectType",
  "projectPhase",
  "intervieweeRole",
  "deliverableType",
  "outputConsumer",
  "availableTooling",
  "commercialContext",
  "businessOwner",
  "stakeholders",
  "businessOutcome",
  "valueHypothesis",
  "startPoint",
  "endPoint",
  "definitionOfDone",
  "currentStateSummary",
  "workshopType",
  "expectedWorkshopOutput",
  "participantProfile",
  "prepArtifactsNeeded",
  "reusableCollateralSource",
  "facilitationTechnique",
  "humanJudgmentArea",
  "triggerType",
  "triggerSource",
  "triggerFrequency",
  "entryConditions",
  "runsPerPeriod",
  "averageDuration",
  "peopleInvolved",
  "roleMix",
  "capacityTeamCompositionImpact",
  "reworkNotes",
  "qualityVariability",
  "reusePotential",
  "businessImpact",
  "biggestPain",
  "hoursSavedHypothesis",
  "marginImpactHypothesis",
  "qualityImpactHypothesis",
  "kpiTypes",
  "qualityBenefits",
  "eqIqDemand",
  "changeImpact",
  "playbackConfirmed",
  "mostValuableStep",
  "mostRiskyStep",
  "pilotCandidate",
  "evidenceArtifacts",
  "followUpOwner",
  "reusePermission",
  "recommendedNextStep",
  "solutionHypothesis",
  "mvpScope",
  "userStories",
  "acceptanceCriteria",
  "successMetrics",
  "toolFitRecommendation",
  "openQuestions",
  "engineeringUnknowns",
  "solutionType",
  "msaBoundary",
  "dataSensitivity",
  "deploymentEnvironment",
  "governancePath",
  "lifecycleStage",
  "lifecycleStatus",
  "stageOwner",
  "fieldConfidence"
];

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "confidence",
    "fields",
    "newRecords",
    "ideas",
    "progressNotes",
    "nextQuestion",
    "mapCheckpointRecommended"
  ],
  properties: {
    summary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    fields: {
      type: "object",
      additionalProperties: false,
      required: intakeFieldKeys,
      properties: Object.fromEntries(intakeFieldKeys.map((key) => [key, { type: "string" }]))
    },
    newRecords: {
      type: "object",
      additionalProperties: false,
      required: ["steps", "data", "systems", "decisions", "patterns"],
      properties: {
        steps: {
          type: "array",
          items: objectSchema(["name", "actor", "tool", "accessMode", "action", "input", "dataHandling", "output", "handoff", "trigger", "time", "decision", "pain", "risk", "exceptions", "dataSensitivity", "pattern", "toolFit", "evidenceConfidence", "interviewNotes", "openQuestions"])
        },
        data: {
          type: "array",
          items: objectSchema(["category", "source", "format", "sensitivity", "usageMode", "processing", "tool", "storage", "access", "avoidRaw", "splitNotes"])
        },
        systems: {
          type: "array",
          items: objectSchema(["name", "purpose", "access", "owner", "integration", "clientData"])
        },
        decisions: {
          type: "array",
          items: objectSchema(["decision", "owner", "criteria", "risk", "approval", "escalation"])
        },
        patterns: {
          type: "array",
          items: objectSchema(["step", "pattern", "riskNote", "toolFit"])
        }
      }
    },
    ideas: {
      type: "array",
      items: objectSchema(["idea", "source", "notes"])
    },
    progressNotes: { type: "string" },
    nextQuestion: { type: "string" },
    mapCheckpointRecommended: { type: "boolean" }
  }
};

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "confidence",
    "artifactType",
    "sourceKind",
    "suggestedFieldUpdates",
    "suggestedRecords",
    "suggestedIdeas",
    "followUpQuestions",
    "confirmationPrompt",
    "warnings"
  ],
  properties: {
    summary: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    artifactType: { type: "string" },
    sourceKind: { type: "string", enum: ["document", "screenshot", "spreadsheet", "notes", "other"] },
    suggestedFieldUpdates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value", "rationale"],
        properties: {
          key: { type: "string", enum: intakeFieldKeys },
          value: { type: "string" },
          rationale: { type: "string" }
        }
      }
    },
    suggestedRecords: {
      type: "object",
      additionalProperties: false,
      required: ["steps", "data", "systems", "decisions", "patterns"],
      properties: {
        steps: {
          type: "array",
          items: objectSchema(["name", "actor", "tool", "accessMode", "action", "input", "dataHandling", "output", "handoff", "trigger", "time", "decision", "pain", "risk", "exceptions", "dataSensitivity", "pattern", "toolFit", "evidenceConfidence", "interviewNotes", "openQuestions"])
        },
        data: {
          type: "array",
          items: objectSchema(["category", "source", "format", "sensitivity", "usageMode", "processing", "tool", "storage", "access", "avoidRaw", "splitNotes"])
        },
        systems: {
          type: "array",
          items: objectSchema(["name", "purpose", "access", "owner", "integration", "clientData"])
        },
        decisions: {
          type: "array",
          items: objectSchema(["decision", "owner", "criteria", "risk", "approval", "escalation"])
        },
        patterns: {
          type: "array",
          items: objectSchema(["step", "pattern", "riskNote", "toolFit"])
        }
      }
    },
    suggestedIdeas: {
      type: "array",
      items: objectSchema(["idea", "source", "notes"])
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" }
    },
    confirmationPrompt: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  }
};

function objectSchema(keys) {
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }]))
  };
}

function splitConfigList(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function providerStatus({ id, label, category, provider, purpose, configured, mode = CONNECTOR_MODE, defaultUse = "optional", enterpriseGate = "Approval required before production use", envVars = [], surfaces = [], setup = [], blockedUntil = [] }) {
  const active = Boolean(configured);
  return {
    id,
    label,
    category,
    provider,
    purpose,
    status: active ? "configured" : defaultUse === "native" ? "included" : "needs-setup",
    configured: active,
    mode,
    defaultUse,
    enterpriseGate,
    envVars,
    surfaces,
    setup,
    blockedUntil,
    secretsExposed: false
  };
}

function addOnProviderTestPlans() {
  return {
    "openai-responses": {
      capability: "OpenAI API key and model-list preflight",
      docsUrl: "https://platform.openai.com/docs/api-reference/models/list",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      })
    },
    "openai-realtime": {
      capability: "Realtime model access uses the same OpenAI project key",
      docsUrl: "https://developers.openai.com/api/docs/models/all",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      })
    },
    "openai-transcription": {
      capability: "Transcription model access uses the same OpenAI project key",
      docsUrl: "https://developers.openai.com/api/docs/models/all",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
      })
    },
    "elevenlabs-voice": {
      capability: "ElevenLabs subscription/auth preflight",
      docsUrl: "https://elevenlabs.io/docs/api-reference/user/subscription/get",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.elevenlabs.io/v1/user/subscription",
        headers: { "xi-api-key": ELEVENLABS_API_KEY }
      })
    },
    "fish-audio-voice": {
      capability: "Fish Audio model-list preflight",
      docsUrl: "https://docs.fish.audio/api-reference/endpoint/model/list-models",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.fish.audio/model",
        headers: { Authorization: `Bearer ${FISH_AUDIO_API_KEY}` }
      })
    },
    "deepgram-stt": {
      capability: "Deepgram projects/auth preflight",
      docsUrl: "https://developers.deepgram.com/reference/authentication",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.deepgram.com/v1/projects",
        headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` }
      })
    },
    "assemblyai-stt": {
      capability: "AssemblyAI transcript-list auth preflight",
      docsUrl: "https://www.assemblyai.com/docs/api-reference/transcripts/list",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.assemblyai.com/v2/transcript?limit=1",
        headers: { Authorization: ASSEMBLYAI_API_KEY }
      })
    },
    "azure-document-intelligence": {
      capability: "Azure Document Intelligence resource-info preflight",
      docsUrl: "https://learn.microsoft.com/en-us/rest/api/aiservices/miscellaneous-operations/get-resource-details",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: `${normalizeBaseUrl(AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT)}/documentintelligence/info?api-version=2024-11-30`,
        headers: { "Ocp-Apim-Subscription-Key": AZURE_DOCUMENT_INTELLIGENCE_KEY }
      })
    },
    "llamaparse": {
      capability: "LlamaParse cloud API auth preflight",
      docsUrl: "https://docs.llamaindex.ai/en/stable/llama_cloud/llama_parse/",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.cloud.llamaindex.ai/api/v1/parsing/jobs?limit=1",
        headers: { Authorization: `Bearer ${LLAMAPARSE_API_KEY}` }
      })
    },
    "mistral-ocr": {
      capability: "Mistral model-list preflight for OCR/model access",
      docsUrl: "https://docs.mistral.ai/api/endpoint/models",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.mistral.ai/v1/models",
        headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` }
      })
    },
    "presidio-pii": {
      capability: "Presidio service health preflight",
      docsUrl: "https://microsoft.github.io/presidio/api-docs/api-docs.html",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: `${presidioBaseUrl(PRESIDIO_ENDPOINT)}/health`
      })
    },
    "azure-ai-language-pii": {
      capability: "Azure AI Language PII synthetic-text preflight",
      docsUrl: "https://learn.microsoft.com/en-us/rest/api/language/analyze-text/analyze-text/analyze-text",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: `${normalizeBaseUrl(AZURE_AI_LANGUAGE_ENDPOINT)}/language/:analyze-text?api-version=2025-11-01`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": AZURE_AI_LANGUAGE_KEY
        },
        body: {
          kind: "PiiEntityRecognition",
          analysisInput: {
            documents: [
              {
                id: "safe-synthetic-check",
                text: "Jane Doe at Contoso requested a sample workflow review.",
                language: "en"
              }
            ]
          },
          parameters: {
            loggingOptOut: true
          }
        }
      })
    },
    "mermaid-workflow-map": {
      capability: "Local Mermaid workflow-map renderer",
      docsUrl: "https://mermaid.js.org/",
      safeLiveCheck: false,
      run: null
    },
    "braintrust-evals": {
      capability: "Braintrust project-list auth preflight",
      docsUrl: "https://www.braintrust.dev/docs/api-reference/introduction",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://api.braintrust.dev/v1/project?limit=1",
        headers: { Authorization: `Bearer ${BRAINTRUST_API_KEY}` }
      })
    },
    "langfuse-tracing": {
      capability: "Langfuse public API project preflight",
      docsUrl: "https://langfuse.com/docs/api-and-data-platform/features/public-api",
      safeLiveCheck: true,
      run: () => addonHttpCheck({
        url: "https://cloud.langfuse.com/api/public/projects",
        headers: { Authorization: `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64")}` }
      })
    }
  };
}

async function handleAddOnProviderTest(req, res) {
  const body = await readJson(req);
  const allowLiveChecks = Boolean(body.allowLiveChecks);
  const requestedProviderId = String(body.providerId || "").trim();
  const status = buildAddOnProviderStatus();
  const providers = requestedProviderId
    ? status.providers.filter((provider) => provider.id === requestedProviderId)
    : status.providers;
  if (requestedProviderId && !providers.length) {
    return sendJson(res, 404, { error: "Unknown add-on provider" });
  }

  const results = [];
  for (const provider of providers) {
    results.push(await runAddOnProviderTest(provider, { allowLiveChecks }));
  }

  return sendJson(res, 200, {
    ok: true,
    checkedAt: new Date().toISOString(),
    allowLiveChecks,
    summary: summarizeAddOnTestResults(results),
    results,
    secretsExposed: false
  });
}

async function runAddOnProviderTest(provider, { allowLiveChecks = false } = {}) {
  const plan = addOnProviderTestPlans()[provider.id] || {};
  const base = {
    id: provider.id,
    label: provider.label,
    provider: provider.provider,
    category: provider.category,
    configured: Boolean(provider.configured),
    envVars: provider.envVars || [],
    capability: plan.capability || "Provider readiness contract",
    docsUrl: plan.docsUrl || "",
    checkedAt: new Date().toISOString(),
    secretsExposed: false
  };

  if (provider.id === "mermaid-workflow-map") {
    return {
      ...base,
      testStatus: "passed",
      statusLabel: "Local check passed",
      detail: "Workflow Map Studio is included locally and does not require an external provider key.",
      action: "Use Outputs > Workflow Map Studio to review generated Mermaid source."
    };
  }

  if (!provider.configured) {
    return {
      ...base,
      testStatus: "missing-config",
      statusLabel: "Missing configuration",
      detail: `Required local environment values are not configured: ${(provider.envVars || []).join(", ") || "none"}.`,
      action: "Add approved values to discovery-intake-webapp/.env.local, restart the app, then rerun this test."
    };
  }

  if (!allowLiveChecks) {
    return {
      ...base,
      testStatus: "configured",
      statusLabel: "Config present",
      detail: "Required local environment values are present. No external provider call was made.",
      action: "Use Run safe live checks when you are ready to call provider preflight endpoints."
    };
  }

  if (!plan.run) {
    return {
      ...base,
      testStatus: "skipped",
      statusLabel: "No live adapter",
      detail: "This provider has a readiness contract but no live probe adapter yet.",
      action: "Keep it in planning mode until a vendor-specific adapter is approved."
    };
  }

  try {
    const probe = await plan.run();
    return {
      ...base,
      testStatus: probe.ok ? "passed" : "failed",
      statusLabel: probe.ok ? "Live check passed" : "Live check failed",
      detail: probe.ok ? "Provider endpoint responded successfully to the safe preflight request." : `Provider endpoint returned HTTP ${probe.status}.`,
      action: probe.ok ? "Provider can move to a synthetic pilot test after enterprise approval." : "Check the key, endpoint, region, account permissions, and vendor dashboard status.",
      httpStatus: probe.status,
      latencyMs: probe.latencyMs
    };
  } catch (error) {
    return {
      ...base,
      testStatus: "failed",
      statusLabel: "Live check failed",
      detail: String(error.message || error),
      action: "Check local network access, endpoint URL, key validity, provider status, and enterprise proxy requirements."
    };
  }
}

function summarizeAddOnTestResults(results = []) {
  return {
    total: results.length,
    passed: results.filter((result) => result.testStatus === "passed").length,
    configured: results.filter((result) => result.testStatus === "configured").length,
    missingConfig: results.filter((result) => result.testStatus === "missing-config").length,
    failed: results.filter((result) => result.testStatus === "failed").length,
    skipped: results.filter((result) => result.testStatus === "skipped").length
  };
}

async function addonHttpCheck({ url, method = "GET", headers = {}, body = undefined }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADDON_LIVE_TEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    await response.arrayBuffer();
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      latencyMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/g, "");
}

function presidioBaseUrl(value) {
  return normalizeBaseUrl(String(value || "").replace(/\/(analyze|anonymize|deanonymize).*$/i, ""));
}

function buildAddOnProviderStatus() {
  const azureDocumentConfigured = Boolean(AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && AZURE_DOCUMENT_INTELLIGENCE_KEY);
  const azureLanguageConfigured = Boolean(AZURE_AI_LANGUAGE_ENDPOINT && AZURE_AI_LANGUAGE_KEY);
  const langfuseConfigured = Boolean(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: CONNECTOR_MODE,
    summary: {
      openAiCoreConfigured: Boolean(OPENAI_API_KEY),
      realtimeConfigured: Boolean(OPENAI_API_KEY),
      transcriptionConfigured: Boolean(OPENAI_API_KEY),
      optionalProvidersConfigured: [
        ELEVENLABS_API_KEY,
        FISH_AUDIO_API_KEY,
        DEEPGRAM_API_KEY,
        ASSEMBLYAI_API_KEY,
        azureDocumentConfigured,
        LLAMAPARSE_API_KEY,
        MISTRAL_API_KEY,
        PRESIDIO_ENDPOINT,
        azureLanguageConfigured,
        BRAINTRUST_API_KEY,
        langfuseConfigured
      ].filter(Boolean).length
    },
    providers: [
      providerStatus({
        id: "openai-responses",
        label: "OpenAI Responses API",
        category: "Core reasoning",
        provider: "OpenAI",
        purpose: "Structured workflow analysis, native tool planning, multimodal reasoning, and agent-ready recipe generation.",
        configured: Boolean(OPENAI_API_KEY),
        defaultUse: "native",
        envVars: ["OPENAI_API_KEY", "EXTRACTION_MODEL", "EXTRACTION_REASONING_EFFORT"],
        surfaces: ["Analyze Answer", "Analyze attachments", "Solution Build Recipe", "Agent Build Pack"],
        setup: ["Keep using the existing local OPENAI_API_KEY.", "Use store=false or enterprise retention settings when policy requires stateless processing."]
      }),
      providerStatus({
        id: "openai-realtime",
        label: "OpenAI Realtime voice",
        category: "Voice capture",
        provider: "OpenAI",
        purpose: "Low-latency spoken workflow intake and spoken clarifying questions.",
        configured: Boolean(OPENAI_API_KEY),
        defaultUse: "native",
        envVars: ["OPENAI_API_KEY", "REALTIME_MODEL", "REALTIME_VOICE"],
        surfaces: ["AI Voice On", "AI speaks back", "Discovery interview"],
        setup: ["Confirm microphone access in the browser.", "Pilot with safe sample workflows before client data."]
      }),
      providerStatus({
        id: "openai-transcription",
        label: "OpenAI transcription",
        category: "Voice capture",
        provider: "OpenAI",
        purpose: "Post-turn audio transcription for dictated workflow notes.",
        configured: Boolean(OPENAI_API_KEY),
        defaultUse: "native",
        envVars: ["OPENAI_API_KEY", "TRANSCRIPTION_MODEL"],
        surfaces: ["Dictate", "Stop", "Text Intake"],
        setup: ["Keep browser microphone permissions enabled.", "Validate transcription quality with consulting and finance vocabulary."]
      }),
      providerStatus({
        id: "elevenlabs-voice",
        label: "ElevenLabs voice output",
        category: "Voice narration",
        provider: "ElevenLabs",
        purpose: "Optional high-quality narration for summaries, playback, and guided reviewer walkthroughs.",
        configured: Boolean(ELEVENLABS_API_KEY),
        envVars: ["ELEVENLABS_API_KEY"],
        surfaces: ["Guided pilot", "Reviewer packet playback", "Training mode"],
        setup: ["Add ELEVENLABS_API_KEY only after procurement/security approval.", "Keep generated voice disabled for confidential review until policy approves it."],
        blockedUntil: ["Vendor approval", "Data handling review", "Voice retention settings"]
      }),
      providerStatus({
        id: "fish-audio-voice",
        label: "Fish Audio voice output",
        category: "Voice narration",
        provider: "Fish Audio",
        purpose: "Optional voice generation alternative for narrated workflow summaries and role-based training prompts.",
        configured: Boolean(FISH_AUDIO_API_KEY),
        envVars: ["FISH_AUDIO_API_KEY"],
        surfaces: ["Training mode", "Reviewer packet playback"],
        setup: ["Add FISH_AUDIO_API_KEY only after vendor review.", "Use only approved voices and retention settings."],
        blockedUntil: ["Vendor approval", "Voice policy approval"]
      }),
      providerStatus({
        id: "deepgram-stt",
        label: "Deepgram speech-to-text",
        category: "Voice capture",
        provider: "Deepgram",
        purpose: "Optional speech-to-text add-on for long interviews, diarization, and domain vocabulary tuning.",
        configured: Boolean(DEEPGRAM_API_KEY),
        envVars: ["DEEPGRAM_API_KEY"],
        surfaces: ["Long-form interview import", "Post-meeting transcript cleanup"],
        setup: ["Add DEEPGRAM_API_KEY after enterprise approval.", "Benchmark against OpenAI transcription before enabling."],
        blockedUntil: ["Vendor approval", "Retention policy", "Transcript storage approval"]
      }),
      providerStatus({
        id: "assemblyai-stt",
        label: "AssemblyAI speech intelligence",
        category: "Voice capture",
        provider: "AssemblyAI",
        purpose: "Optional transcript intelligence for long meetings, speaker labels, and topic extraction.",
        configured: Boolean(ASSEMBLYAI_API_KEY),
        envVars: ["ASSEMBLYAI_API_KEY"],
        surfaces: ["Long-form interview import", "Meeting transcript analysis"],
        setup: ["Add ASSEMBLYAI_API_KEY after enterprise approval.", "Use safe-sample recordings for comparison testing."],
        blockedUntil: ["Vendor approval", "Retention policy", "PII review"]
      }),
      providerStatus({
        id: "azure-document-intelligence",
        label: "Azure Document Intelligence",
        category: "Document intelligence",
        provider: "Microsoft Azure",
        purpose: "Enterprise OCR/layout extraction for PDFs, screenshots, scanned forms, tables, and finance artifacts.",
        configured: azureDocumentConfigured,
        envVars: ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_KEY"],
        surfaces: ["Evidence upload", "Workbook import", "Evidence linkage"],
        setup: ["Create an approved Azure resource in the work tenant.", "Route extracted fields through human approval before writing to the intake."],
        blockedUntil: ["Azure subscription approval", "Tenant networking", "Data residency review"]
      }),
      providerStatus({
        id: "llamaparse",
        label: "LlamaParse document extraction",
        category: "Document intelligence",
        provider: "LlamaIndex",
        purpose: "Optional complex PDF/table extraction for messy consulting artifacts and packaged reports.",
        configured: Boolean(LLAMAPARSE_API_KEY),
        envVars: ["LLAMAPARSE_API_KEY"],
        surfaces: ["Evidence upload", "Bulk document import"],
        setup: ["Add LLAMAPARSE_API_KEY after security review.", "Use only approved sample/client-safe documents."],
        blockedUntil: ["Vendor approval", "Data retention review"]
      }),
      providerStatus({
        id: "mistral-ocr",
        label: "Mistral OCR",
        category: "Document intelligence",
        provider: "Mistral AI",
        purpose: "Optional OCR/document parsing path for image-heavy PDFs and screenshots.",
        configured: Boolean(MISTRAL_API_KEY),
        envVars: ["MISTRAL_API_KEY"],
        surfaces: ["Evidence upload", "Document triage"],
        setup: ["Add MISTRAL_API_KEY after enterprise approval.", "Benchmark against Azure Document Intelligence before production use."],
        blockedUntil: ["Vendor approval", "Data boundary review"]
      }),
      providerStatus({
        id: "presidio-pii",
        label: "Microsoft Presidio PII review",
        category: "Privacy and controls",
        provider: "Microsoft / Presidio",
        purpose: "Optional PII detection and redaction before evidence is sent to AI analysis or shared in packages.",
        configured: Boolean(PRESIDIO_ENDPOINT),
        envVars: ["PRESIDIO_ENDPOINT"],
        surfaces: ["Evidence upload", "Package doctor", "Governance Inputs"],
        setup: ["Deploy or point to an approved Presidio service.", "Keep redaction warnings visible to the human reviewer."],
        blockedUntil: ["Security architecture approval", "PII taxonomy signoff"]
      }),
      providerStatus({
        id: "azure-ai-language-pii",
        label: "Azure AI Language PII",
        category: "Privacy and controls",
        provider: "Microsoft Azure",
        purpose: "Optional managed PII entity detection for enterprise Microsoft environments.",
        configured: azureLanguageConfigured,
        envVars: ["AZURE_AI_LANGUAGE_ENDPOINT", "AZURE_AI_LANGUAGE_KEY"],
        surfaces: ["Evidence upload", "Governance Inputs", "Reviewer packet"],
        setup: ["Create an approved Azure AI Language resource.", "Pilot with synthetic finance examples first."],
        blockedUntil: ["Azure subscription approval", "PII policy approval"]
      }),
      providerStatus({
        id: "mermaid-workflow-map",
        label: "Mermaid workflow map",
        category: "Workflow visualization",
        provider: "Local app",
        purpose: "Included visual process mapping for activities, data, systems, decisions, handoffs, and approvals.",
        configured: true,
        defaultUse: "native",
        envVars: [],
        surfaces: ["Workflow Map Studio", "Reviewer packet", "Package export"],
        setup: ["No external account required.", "Export Mermaid source with the review package."]
      }),
      providerStatus({
        id: "braintrust-evals",
        label: "Braintrust evals",
        category: "Evaluation and observability",
        provider: "Braintrust",
        purpose: "Optional regression evaluation and review dashboards for extraction quality and recipe quality.",
        configured: Boolean(BRAINTRUST_API_KEY),
        envVars: ["BRAINTRUST_API_KEY"],
        surfaces: ["Live Test Lab", "Release controls", "Pilot evidence"],
        setup: ["Add BRAINTRUST_API_KEY after tool approval.", "Run with sanitized pilot records first."],
        blockedUntil: ["Vendor approval", "Evaluation data policy"]
      }),
      providerStatus({
        id: "langfuse-tracing",
        label: "Langfuse tracing",
        category: "Evaluation and observability",
        provider: "Langfuse",
        purpose: "Optional tracing and prompt/version observability for enterprise pilots.",
        configured: langfuseConfigured,
        envVars: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"],
        surfaces: ["Release controls", "Pilot evidence", "Builder diagnostics"],
        setup: ["Add Langfuse keys after approval.", "Disable raw prompt logging unless governance approves it."],
        blockedUntil: ["Vendor approval", "Telemetry policy"]
      })
    ]
  };
}

function buildEnterpriseConfigStatus() {
  return {
    appEnv: APP_ENV,
    appBaseUrl: APP_BASE_URL,
    enterpriseMode: ENTERPRISE_MODE,
    connectorMode: CONNECTOR_MODE,
    microsoftConfigured: Boolean(MICROSOFT_TENANT_ID && MICROSOFT_CLIENT_ID),
    microsoftRedirectConfigured: Boolean(MICROSOFT_REDIRECT_URI),
    microsoftGraphScopes: splitConfigList(MICROSOFT_GRAPH_SCOPES),
    microsoftSharePointConfigured: Boolean(
      MICROSOFT_SHAREPOINT_HOSTNAME ||
      MICROSOFT_SHAREPOINT_SITE_PATH ||
      MICROSOFT_GRAPH_SITE_ID ||
      MICROSOFT_GRAPH_DRIVE_ID ||
      MICROSOFT_GRAPH_FOLDER_PATH
    ),
    githubConfigured: Boolean(GITHUB_REPOSITORY),
    githubRepository: GITHUB_REPOSITORY,
    githubDefaultBranch: GITHUB_DEFAULT_BRANCH,
    githubActionsEnabled: /^(true|1|yes)$/i.test(GITHUB_ACTIONS_ENABLED),
    addOns: buildAddOnProviderStatus(),
    secretsExposed: false
  };
}

async function handleDetectConnectors(req, res) {
  const body = await readJson(req);
  const sessionState = body.sessionState || {};
  // This server talks to OpenAI through raw fetch and has no OpenAI SDK client
  // object, so there is none to pass. The detector then runs keyword-only
  // detection and skips the optional AI-enhancement pass.
  const result = await detectConnectors(sessionState, null);
  return sendJson(res, 200, {
    ok: true,
    ...result,
    recipe: formatForRecipe(result)
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

    // Auth gate (no-op unless AUTH_ENABLED=true): unauthenticated API calls get
    // 401; unauthenticated page/asset loads are redirected to the login page.
    if (AUTH_ENABLED && !isPublicPath(requestUrl.pathname) && !readSession(req)) {
      if (requestUrl.pathname.startsWith("/api/")) {
        return sendJson(res, 401, { error: "auth_required" });
      }
      return sendRedirect(res, "/login.html");
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        aiConfigured: Boolean(OPENAI_API_KEY),
        model: REALTIME_MODEL,
        extractionModel: EXTRACTION_MODEL,
        primaryModel: REALTIME_MODEL,
        realtimeConfigured: Boolean(OPENAI_API_KEY),
        realtimeModel: REALTIME_MODEL,
        realtimeVoice: REALTIME_VOICE,
        transcriptionConfigured: Boolean(OPENAI_API_KEY),
        transcriptionModel: TRANSCRIPTION_MODEL,
        ttsConfigured: Boolean(OPENAI_API_KEY),
        ttsModel: TTS_MODEL,
        ttsVoice: TTS_VOICE,
        extractionReasoningEffort: EXTRACTION_REASONING_EFFORT,
        extractionVerbosity: EXTRACTION_VERBOSITY,
        enterprise: buildEnterpriseConfigStatus()
      });
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/enterprise/config-status") {
      return sendJson(res, 200, {
        ok: true,
        enterprise: buildEnterpriseConfigStatus()
      });
    }

    if (req.method === "GET" && requestUrl.pathname === "/auth/login") {
      return await handleAuthLogin(req, res);
    }

    if (req.method === "GET" && requestUrl.pathname === "/auth/microsoft/callback") {
      return await handleAuthCallback(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/auth/logout") {
      return await handleAuthLogout(req, res);
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/me") {
      return await handleMe(req, res);
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/audit") {
      return await handleGetAudit(req, res);
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/connectors/jira/auth") {
      return await handleJiraAuth(req, res);
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/connectors/jira/callback") {
      return await handleJiraCallback(req, res);
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/connectors/jira/status") {
      return await handleJiraStatus(req, res);
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/connectors/jira/projects") {
      return await handleJiraProjects(req, res);
    }
    if (req.method === "POST" && requestUrl.pathname === "/api/connectors/jira/push") {
      return await handleJiraPush(req, res);
    }
    if (req.method === "DELETE" && requestUrl.pathname === "/api/connectors/jira/disconnect") {
      return await handleJiraDisconnect(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/add-ons/test") {
      return await handleAddOnProviderTest(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/detect-connectors") {
      return await handleDetectConnectors(req, res);
    }

    if (requestUrl.pathname === "/api/sessions") {
      if (req.method === "GET") return await handleListSessions(req, res);
      if (req.method === "POST") return await handleSaveSession(req, res);
    }

    if (requestUrl.pathname.startsWith("/api/sessions/")) {
      const sessionId = requestUrl.pathname.split("/").pop();
      if (req.method === "GET") return await handleGetSession(req, res, sessionId);
      if (req.method === "DELETE") return await handleDeleteSession(req, res, sessionId);
    }

    if (requestUrl.pathname === "/api/packages" && req.method === "POST") {
      return await handleCreatePackage(req, res);
    }

    if (requestUrl.pathname === "/api/packages" && req.method === "GET") {
      return await handleListPackages(req, res);
    }

    if (requestUrl.pathname.startsWith("/api/packages/") && requestUrl.pathname.endsWith("/download") && req.method === "GET") {
      const packageName = decodeURIComponent(requestUrl.pathname.split("/").at(-2) || "");
      return await handleDownloadPackageZip(req, res, packageName);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/extract") {
      return await handleExtract(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/extract-document") {
      return await handleExtractDocument(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/harvest-grid") {
      return await handleHarvestGrid(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/evidence/analyze") {
      return await handleEvidenceAnalyze(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/chat") {
      return await handleChat(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/recipe") {
      return await handleRecipe(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/realtime/session") {
      return await handleRealtimeSession(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/transcribe/audio") {
      return await handleTranscribeAudio(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/tts/speak") {
      return await handleTextToSpeech(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/recipe-book-export") {
      return await handleRecipeBookExport(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/engineering-doc-export") {
      return await handleEngineeringDocExport(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/pattern-handoff") {
      return await handlePatternHandoff(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/ai-mirror") {
      return await handleAiMirror(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/dump-extract") {
      return await handleDumpExtract(req, res);
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/pdf-export") {
      return await handlePdfExport(req, res);
    }

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    const status = error.statusCode || error.status || 500;
    return sendJson(res, status, { error: status === 400 ? "Invalid request" : "Server error", detail: String(error.message || error) });
  }
});

async function handleExtract(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  const body = await readJson(req);
  appendAudit(req, "ai_analysis_run", { detail: "extract", content: body });
  const payload = {
    currentSection: body.currentSection,
    transcript: body.transcript,
    answer: body.answer,
    // Stage 1b: optional grid-awareness. When present, the model treats it as
    // a summary of what is already known and focuses on gaps. When null/absent,
    // behavior is unchanged (normal open-ended discovery).
    gridContext: body.gridContext || null,
    state: pruneState(body.state)
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      reasoning: {
        effort: EXTRACTION_REASONING_EFFORT
      },
      instructions: extractionInstructions(body.gridSummary || ""),
      input: JSON.stringify(payload),
      text: {
        verbosity: EXTRACTION_VERBOSITY,
        format: {
          type: "json_schema",
          name: "discovery_intake_extraction",
          strict: true,
          schema: extractionSchema
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "OpenAI API request failed",
      detail: data
    });
  }

  const outputText = extractOutputText(data);
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Model returned non-JSON output",
      outputText
    });
  }

  return sendJson(res, 200, parsed);
}

// Count distinct numbered sections in raw document text — list markers like
// "1." / "2)" and "Step 3". Used only as a completeness heuristic: if the model
// returns fewer steps than the document appears to contain, we surface a
// non-blocking warning rather than silently dropping the tail steps.
function countNumberedSections(text) {
  if (!text || typeof text !== "string") return 0;
  const numbers = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:step\s+(\d{1,2})\b|(\d{1,2})[.)]\s)/i);
    if (match) {
      const n = Number(match[1] || match[2]);
      if (n >= 1 && n <= 99) numbers.add(n);
    }
  }
  return numbers.size;
}

// ── Data-sensitivity normalisation ────────────────────────────────────────
// The reviewer UI grades each step's sensitivity purely from a substring of
// the step's `dataSensitivity` cell value (high|confidential|pii|sensitive →
// HIGH, medium → MEDIUM, else LOW). Free-text classification labels such as
// "Internal Restricted" therefore silently fall through to LOW even though
// they are HIGH. To keep that downstream grader correct, every value we emit
// here begins with a canonical "High" / "Medium" / "Low" token, and any
// appended reason is a controlled string with no stray high-regex tokens.

// Numeric rank so we can take the higher of two levels without lowering.
const SENSITIVITY_RANK = { High: 3, Medium: 2, Low: 1 };

// FIX 1 — map a document classification label to a sensitivity level.
// Order matters: the more specific "Internal Restricted" / "Restricted" HIGH
// rules are tested before the generic "Internal" MEDIUM rule. Returns null
// when the label is absent or unrecognised.
function mapLabelToSensitivity(label) {
  const text = String(label || "").toLowerCase();
  if (!text.trim()) return null;
  // HIGH labels (restricted / confidential family). "Internal Restricted"
  // is caught here by the "restricted" test before the "internal" MEDIUM rule.
  if (/\b(highly|strictly)\s+confidential\b/.test(text)) return "High";
  if (/\bconfidential\b/.test(text)) return "High";
  if (/\brestricted\b/.test(text)) return "High";
  // MEDIUM labels (internal use). Reached only when no restricted/confidential
  // token is present above.
  if (/\binternal\b/.test(text)) return "Medium";
  // LOW labels (openly shareable).
  if (/\b(public|unrestricted|external)\b/.test(text)) return "Low";
  return null;
}

// FIX 2 — infer a sensitivity level from a step's combined cell text when no
// document classification label is available. Returns null when no signal is
// found (so genuinely empty/unknown cells are left untouched downstream).
function inferSensitivityFromContent(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return null;

  // HIGH: financial instrument identifiers, named parties, money movement,
  // personal data, named regulatory regimes, or explicit sensitivity words.
  const high = [
    /\bisin\b/, /\bcusip\b/, /\bsedol\b/, /\btrade\s*ref(erence)?\b/,
    /\bcounterpart(y|ies)\b/, /\bclient\s+name/, /\bclient\b/, /\bmandate\b/,
    /\bsettlement\s+(amount|value|instruction)/, /\bcash\s+(amount|figure|movement|flow)/,
    /\bdate\s+of\s+birth\b/, /\bd\.?o\.?b\.?\b/, /\bpassport\b/, /\bpersonal\s+data\b/,
    /\bhome\s+address\b/, /\b(full\s+)?name\s+and\s+address\b/,
    /\bgdpr\b/, /\bmifid\b/, /\bfca\b/, /\baml\b/, /\bkyc\b/, /\bfatca\b/, /\bpoca\b/,
    /\bsar\b/, /\bsuspicious\s+activity\b/,
    /\bconfidential\b/, /\brestricted\b/
  ];
  if (high.some((re) => re.test(t))) return "High";

  // MEDIUM: internal fund/portfolio data and aggregate metrics not tied to a
  // specific client, or named internal systems carrying operational data.
  const medium = [
    /\bnav\b/, /\bnet\s+asset\s+value\b/, /\bfund\s+name/, /\bportfolio\s+position/,
    /\bportfolio\b/, /\baggregate\b/, /\binternal\s+system/, /\bcost\s+basis\b/,
    /\bperformance\s+metric/, /\bbenchmark\b/
  ];
  if (medium.some((re) => re.test(t))) return "Medium";

  // LOW: purely operational / process content with no financial or personal
  // data (status checks, confirmations, routine process steps).
  const low = [
    /\bstatus\s+check/, /\bsystem\s+status\b/, /\bconfirmation\b/, /\bconfirm\b/,
    /\bprocess\s+step\b/, /\boperational\b/, /\bhealth\s*check\b/, /\bheartbeat\b/
  ];
  if (low.some((re) => re.test(t))) return "Low";

  return null;
}

// Concatenate the descriptive cell values that may carry sensitivity signals.
const SENSITIVITY_SIGNAL_CELLS = [
  "workflowStep", "description", "personaActors", "systemsTools",
  "dataProcessing", "rulesDecisionLogic", "output", "trigger", "handoff",
  "regulatoryContext", "exceptionBranching", "dataSensitivity"
];
function stepSensitivityText(step) {
  return SENSITIVITY_SIGNAL_CELLS.map((key) => recipeCellValue(step, key)).filter(Boolean).join(" \n ");
}

// Short controlled reason shown after the level token. Deliberately avoids the
// words high/confidential/pii/sensitive so it never collides with the
// downstream HIGH regex on Medium/Low rows.
const SENSITIVITY_REASON = {
  High: "client / regulatory / financial-identifier data",
  Medium: "internal fund / portfolio / aggregate data",
  Low: "operational / process step"
};

// Rewrite each step's dataSensitivity cell so the reviewer UI grades it
// correctly. A recognised document label sets a baseline for every step;
// per-step content signals may raise a step above that baseline but never
// lower it. With no label, fall back to pure content inference. Steps with
// neither a label nor any signal are left untouched.
function normalizeStepSensitivity(grid) {
  if (!grid || !Array.isArray(grid.steps)) return grid;
  const baseline = mapLabelToSensitivity(grid.dataSensitivityBaseline);
  for (const step of grid.steps) {
    if (!step || typeof step !== "object") continue;
    const content = inferSensitivityFromContent(stepSensitivityText(step));
    // Higher of baseline vs content; null when neither produced a signal.
    let level = baseline;
    if (content && (!level || SENSITIVITY_RANK[content] > SENSITIVITY_RANK[level])) {
      level = content;
    }
    if (!level) continue;
    const reason = baseline && level === baseline && String(grid.dataSensitivityBaseline || "").trim()
      ? String(grid.dataSensitivityBaseline).trim()
      : SENSITIVITY_REASON[level];
    const cells = step.cells || (step.cells = {});
    const existing = cells.dataSensitivity || {};
    cells.dataSensitivity = {
      ...existing,
      value: `${level} — ${reason}`,
      confidence: typeof existing.confidence === "number" ? existing.confidence : 0.7
    };
  }
  return grid;
}

const DOCUMENT_EXTRACTION_SYSTEM_PROMPT = `You are a workflow analysis expert. Extract a structured workflow grid from the provided document. Return ONLY valid JSON — no markdown fences, no explanation, just the raw JSON object.

Return this exact schema:
{
  workflowName: string,
  dataSensitivityBaseline: string,
  steps: [
    {
      id: 'step-1',
      nextStepId: 'step-2' (null for last step),
      cells: {
        workflowStep: { value: string, confidence: number },
        description: { value: string, confidence: number },
        personaActors: { value: string, confidence: number },
        systemsTools: { value: string, confidence: number },
        dataProcessing: { value: string, confidence: number },
        rulesDecisionLogic: { value: string, confidence: number },
        output: { value: string, confidence: number },
        trigger: { value: string, confidence: number },
        handoff: { value: string, confidence: number },
        humanCheckpoint: { value: string, confidence: number },
        timeTaken: { value: string, confidence: number },
        frequencyVolume: { value: string, confidence: number },
        painFriction: { value: '', confidence: 0 },
        dataSensitivity: { value: string, confidence: number },
        exceptionBranching: { value: string, confidence: number },
        regulatoryContext: { value: string, confidence: number }
      }
    }
  ]
}

Confidence rules: 0.9+ = explicitly stated in the document, 0.7 = clearly implied, 0.5 = reasonably inferred, below 0.5 = leave value as empty string.
State rule: if the document explicitly states a field is unclear, not specified, unknown, TBD, or unavailable, include that cell as { "value": "", "confidence": 0, "state": "unknown" }. If a topic is simply not mentioned at all, leave it empty (do not include a state). Only use state:"unknown" for explicitly-flagged-as-unknown information.
painFriction: always value '' and confidence 0 — documents describe how things should work, not where they hurt.
Data sensitivity:
- dataSensitivityBaseline: if the document carries a classification or sensitivity label (e.g. in a header, footer, cover page, or watermark — "Internal Restricted", "Restricted", "Confidential", "Strictly Confidential", "Internal Use Only", "Public", etc.), copy that label verbatim into dataSensitivityBaseline. Leave it as "" if the document has no such label.
- Per-step dataSensitivity.value: begin the value with one word — "High", "Medium", or "Low" — then a short reason. HIGH for restricted/confidential labels or steps touching ISIN/CUSIP/SEDOL/trade references, counterparty or client names, settlement amounts or cash figures, personal data (name, address, date of birth, passport), or regulatory terms (GDPR, MiFID, FCA, AML, KYC, FATCA, POCA, SAR). MEDIUM for internal-use labels or internal fund names, NAV, portfolio positions, or aggregate financial metrics not tied to a specific client. LOW for public labels or purely operational/process steps with no financial or personal data.
aiPattern: do not include — it is generated later.
Only extract steps actually present in the document — never invent steps that aren't there.
Extract ALL steps from the document. Do not stop early. A document may have up to 20 steps. Return every step you find, even if the list is long.`;

// Stage 1a Part 2: extract a draft workflow grid from an uploaded document.
// The file is parsed entirely in memory (no disk writes) and the extracted
// text is sent to OpenAI for structured extraction. Failures resolve as
// { success: false, error } (HTTP 200) so the frontend can offer a
// conversation fallback rather than treating it as a hard error.
async function handleExtractDocument(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 200, {
      success: false,
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server, or start with conversation instead."
    });
  }

  let upload;
  try {
    upload = await readMultipartFile(req);
  } catch (error) {
    return sendJson(res, 200, { success: false, error: error.message || "Could not read the uploaded file." });
  }
  if (!upload || !upload.buffer?.length) {
    return sendJson(res, 200, { success: false, error: "No file was received. Please choose a document and try again." });
  }

  // Images go straight to the vision model; everything else (PDF/Word/Excel)
  // is parsed to text first — that path is unchanged.
  let userMessageContent;
  // Raw parsed document text, kept in function scope so the completeness check
  // after extraction can compare the model's step count against the number of
  // numbered sections in the source. Stays "" for image uploads (no text).
  let rawDocumentText = "";
  if (isImageUpload(upload)) {
    const dataUrl = `data:${upload.mimeType || "image/png"};base64,${upload.buffer.toString("base64")}`;
    userMessageContent = [
      { type: "text", text: "Extract the workflow grid from this image or screenshot." },
      { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
    ];
  } else {
    let text;
    try {
      text = await extractDocumentText(upload);
    } catch (error) {
      console.error("Document text extraction failed", error);
      return sendJson(res, 200, { success: false, error: "We couldn't read that document. Try a different file or start with conversation." });
    }
    if (!text || !text.trim()) {
      return sendJson(res, 200, { success: false, error: "That document didn't contain readable text. Try a different file or start with conversation." });
    }
    rawDocumentText = text;
    // Send the FULL document text. A multi-page SOP must not be cut short, or
    // its later steps never reach the model (the cause of long SOPs extracting
    // only the first handful of steps). The bound below only guards against a
    // pathologically large file overflowing the model context window — a
    // 9-page PDF is far below it and is sent in full.
    userMessageContent = text.length > 300_000 ? text.slice(0, 300_000) : text;
  }

  let data;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: DOCUMENT_EXTRACTION_MODEL,
        response_format: { type: "json_object" },
        // A 14-step SOP with full cell values produces a large JSON object.
        // Without enough headroom the response is cut off mid-array and the
        // tail steps silently disappear, so reserve room for a long step list.
        max_tokens: 16000,
        messages: [
          { role: "system", content: DOCUMENT_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userMessageContent }
        ]
      })
    });
    data = await response.json();
    if (!response.ok) {
      return sendJson(res, 200, { success: false, error: data.error?.message || "The extraction request failed." });
    }
  } catch (error) {
    console.error("Document extraction request failed", error);
    return sendJson(res, 200, { success: false, error: "Could not reach the extraction service. Start with conversation or try again." });
  }

  const outputText = data.choices?.[0]?.message?.content || "";
  let grid;
  try {
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    grid = JSON.parse(jsonMatch[0]);
  } catch {
    console.error('Raw model response:', outputText);
    return sendJson(res, 200, { success: false, error: "The model returned an unreadable result. Try again or start with conversation." });
  }

  // Normalise each step's dataSensitivity cell so the reviewer UI grades it
  // correctly: map the document classification label (FIX 1) and infer from
  // step content when no label is present (FIX 2).
  normalizeStepSensitivity(grid);

  // Completeness check: if the document clearly contains more numbered sections
  // than the model returned steps, the extraction may have been truncated. Flag
  // it so the UI can prompt the user to add the missing steps manually instead
  // of silently losing them. Skipped for images (no raw text to count).
  const stepCount = Array.isArray(grid?.steps) ? grid.steps.length : 0;
  const detectedSections = countNumberedSections(rawDocumentText);
  let extractionWarning;
  if (rawDocumentText && stepCount > 0 && detectedSections > stepCount) {
    extractionWarning = "Some steps may not have been captured. The document appears to contain more sections than were extracted. You can continue the interview and add missing steps manually.";
  }

  return sendJson(res, 200, { success: true, grid, extractionWarning });
}

// Parse a single multipart/form-data file field ("file") fully into memory.
function readMultipartFile(req, maxBytes = 25_000_000) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      reject(new Error("Expected a multipart/form-data upload."));
      return;
    }
    let busboy;
    try {
      busboy = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes } });
    } catch (error) {
      reject(error);
      return;
    }
    let result = null;
    let tooLarge = false;
    busboy.on("file", (_name, stream, info) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("limit", () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on("end", () => {
        result = {
          buffer: Buffer.concat(chunks),
          filename: info.filename || "",
          mimeType: info.mimeType || ""
        };
      });
    });
    busboy.on("error", reject);
    busboy.on("close", () => {
      if (tooLarge) reject(new Error("That file is too large to process."));
      else resolve(result);
    });
    req.pipe(busboy);
  });
}

// Extract raw text from a buffered PDF, Word, or Excel document.
async function extractDocumentText({ buffer, filename = "", mimeType = "" }) {
  const probe = `${filename} ${mimeType}`.toLowerCase();
  if (probe.includes("pdf")) {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }
  if (probe.includes("word") || probe.includes("officedocument.wordprocessing") || /\.docx?(\s|$)/.test(probe)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }
  if (probe.includes("sheet") || probe.includes("excel") || /\.xlsx?(\s|$)/.test(probe)) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return firstSheet ? XLSX.utils.sheet_to_csv(firstSheet) : "";
  }
  throw new Error("Unsupported document type.");
}

// Images are sent to the vision model rather than parsed to text.
function isImageUpload({ filename = "", mimeType = "" }) {
  const probe = `${filename} ${mimeType}`.toLowerCase();
  return mimeType.toLowerCase().startsWith("image/") || /\.(png|jpe?g|webp)(\s|$)/.test(probe);
}

const HARVEST_GRID_SYSTEM_PROMPT = `You are a workflow data extraction specialist. Extract structured workflow field values from a conversation transcript and return updates to a workflow grid.

Read the ENTIRE transcript holistically — information mentioned anywhere applies to any step's fields.

Confidence rules (apply universally to all input types):
0.9+ = explicitly stated by the person
0.7  = clearly implied
0.5  = reasonably inferred
<0.5 = do not include

Special rules:
- painFriction: only include if the person explicitly expressed frustration, difficulty, or pain. Never infer this field.
- aiPattern: never include — it is generated separately.
- state "unknown": if the person was asked about a field and said they don't know, can't answer, or it is genuinely unclear/TBD/unavailable, set that field to { "value": "", "confidence": 0, "state": "unknown" }. If a topic was simply never raised in the conversation, do not include it (leave it empty). Never use "unknown" to overwrite a field that already has a real answer.
- Only update a cell if the new confidence exceeds the existing confidence, or the existing state is 'empty'.
- Match updates to existing steps by name or position. If a genuinely new step is mentioned, add it to newSteps.

Return ONLY valid JSON — no markdown, no explanation:
{
  stepUpdates: [
    {
      stepId: 'existing-step-id or new',
      stepName: string,
      fieldUpdates: {
        fieldKey: {
          value: string,
          confidence: number,
          state: 'confirmed', 'inferred', or 'unknown'
        }
      }
    }
  ],
  newSteps: []
}`;

// Stage 1b: harvest structured grid updates from the live conversation. Called
// after each user answer. Failures are intentionally benign — they resolve to
// an empty update set (HTTP 200) so the frontend can ignore them silently and
// never interrupt the interview.
async function handleHarvestGrid(req, res) {
  const empty = { stepUpdates: [], newSteps: [] };
  if (!OPENAI_API_KEY) {
    return sendJson(res, 200, empty);
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 200, empty);
  }

  appendAudit(req, "ai_analysis_run", { detail: "harvest-grid", content: body });
  const payload = {
    transcript: body.transcript || [],
    currentGrid: body.currentGrid || null,
    latestAnswer: body.latestAnswer || ""
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: HARVEST_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: HARVEST_GRID_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.warn("Grid harvest request failed", data.error?.message || response.status);
      return sendJson(res, 200, empty);
    }
    const outputText = data.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return sendJson(res, 200, empty);
    }
    return sendJson(res, 200, {
      stepUpdates: Array.isArray(parsed.stepUpdates) ? parsed.stepUpdates : [],
      newSteps: Array.isArray(parsed.newSteps) ? parsed.newSteps : []
    });
  } catch (error) {
    console.warn("Grid harvest unavailable", error.message);
    return sendJson(res, 200, empty);
  }
}

async function handleEvidenceAnalyze(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  const body = await readJson(req);
  appendAudit(req, "ai_analysis_run", { detail: "evidence-analyze", content: body });
  const evidence = body.evidence || {};
  const metadata = {
    fileName: evidence.fileName,
    mimeType: evidence.mimeType,
    size: evidence.size,
    sourceKind: evidence.sourceKind,
    artifactType: evidence.artifactType,
    text: evidence.text || "",
    state: pruneState(body.state)
  };
  const content = [
    {
      type: "input_text",
      text: JSON.stringify(metadata)
    }
  ];

  if (evidence.dataUrl && String(evidence.mimeType || "").startsWith("image/")) {
    content.push({
      type: "input_image",
      image_url: evidence.dataUrl,
      detail: "high"
    });
  } else if (evidence.dataUrl) {
    content.push({
      type: "input_file",
      filename: evidence.fileName || "evidence-file",
      file_data: evidence.dataUrl
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      reasoning: {
        effort: EXTRACTION_REASONING_EFFORT
      },
      instructions: evidenceInstructions(),
      input: [
        {
          role: "user",
          content
        }
      ],
      text: {
        verbosity: EXTRACTION_VERBOSITY,
        format: {
          type: "json_schema",
          name: "evidence_intake_analysis",
          strict: true,
          schema: evidenceSchema
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "OpenAI API request failed",
      detail: data
    });
  }

  const outputText = extractOutputText(data);
  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    return sendJson(res, 500, {
      error: "Model returned non-JSON output",
      outputText
    });
  }

  return sendJson(res, 200, parsed);
}

async function handleChat(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  const body = await readJson(req);
  const payload = {
    message: body.message,
    chatHistory: body.chatHistory || [],
    state: pruneState(body.state)
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      reasoning: {
        effort: CHAT_REASONING_EFFORT
      },
      instructions: chatInstructions(body.gridSummary || ""),
      input: JSON.stringify(payload),
      text: {
        verbosity: CHAT_VERBOSITY
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "OpenAI API request failed",
      detail: data
    });
  }

  return sendJson(res, 200, {
    reply: extractOutputText(data)
  });
}

// Recipe Book: generate a ready-to-paste ChatGPT Enterprise prompt for a single
// workflow step. The step arrives as a full workflowGrid step object whose cells
// have the { value, state, confidence } shape; the aiPattern cell's value is an
// array of { pattern, confidence } entries. Uses chat/completions with a
// cost-efficient model.
function recipeCellValue(step, key) {
  const cell = step?.cells?.[key];
  if (!cell) return "";
  if (key === "aiPattern") {
    const entries = Array.isArray(cell.value) ? cell.value : [];
    return entries.map((entry) => entry?.pattern).filter(Boolean).join(", ");
  }
  return typeof cell.value === "string" ? cell.value.trim() : "";
}

function recipeSystemPrompt() {
  return [
    "You are a senior AI enablement lead who writes production-ready prompts for ChatGPT Enterprise.",
    "Your audience is an operations or finance professional (not an engineer) who will paste your prompt into ChatGPT Enterprise to perform one step of a business workflow.",
    "Write ONE complete, copy-paste-ready prompt for the single workflow step described in the user message.",
    "Remember a hard constraint: ChatGPT cannot log into, query, or read from any of the analyst's systems, and it cannot produce binary files (Excel, PDF, etc.). It can only work with text the analyst pastes in, and it can only return text. Every section you write must respect this.",
    "The prompt you write MUST begin with a single 'How to use' line, then contain the six clearly labelled sections below.",
    "HOW TO USE LINE (this is the very first line of the prompt, before the Role/persona section): Write one sentence in this exact shape — \"How to use: Copy this prompt into ChatGPT Enterprise, then paste [the specific data type the analyst will supply, e.g. the reconciliation break report] at the end where indicated.\" Name the concrete data type drawn from the step, not a generic placeholder.",
    "The six labelled sections, in order:",
    "1. Role/persona context — who ChatGPT should act as for this step.",
    "2. Task instruction — a clear instruction grounded in the step's AI pattern (e.g. Retrieve, Extract, Generate, Summarise, Classify, Match, Route, Optimise, Search).",
    "3. Input — describe the actual pasteable text the analyst must supply, NOT the fact that a system exists. ChatGPT cannot access any system. Write the Input in this shape: \"Paste the [specific report, export, or extract] from [system] here. The analyst retrieves this from [where in that system it lives].\" For example, write \"Paste the daily reconciliation break report exported from ReconDesk here. The analyst retrieves this from ReconDesk > Reports > Daily Breaks\" — never \"Access to ReconDesk and Murex systems\". End this section by indicating where the analyst pastes the data (e.g. \"<<< Paste the report below this line >>>\").",
    "4. Output format — describe ONLY something an LLM can actually produce from pasted text: a markdown table, a structured/bulleted list of flagged items, ready-to-use Python or spreadsheet-formula logic, or a formatted email or summary. Never ask for an Excel sheet, PDF, or any file. When the step involves filtering, matching, or data manipulation, specify the output as a markdown table or a structured list of the resulting/flagged rows that the analyst can act on — not a file.",
    "5. Rules & constraints — any rules, decision logic, compliance, or data-sensitivity guardrails from the step.",
    "6. Example invocation — a single example line showing how the analyst would kick it off, consistent with pasting text in (not pointing ChatGPT at a system).",
    "Be specific and practical. Do not include commentary, preamble, or markdown code fences around the whole thing — return only the prompt text itself.",
    "Keep it concise enough to fit comfortably in one screen."
  ].join("\n");
}

function recipeUserPayload(step, workflowName) {
  const lines = [
    `Workflow: ${workflowName || "Unnamed workflow"}`,
    `Step name: ${recipeCellValue(step, "name") || "Untitled step"}`,
    `Description: ${recipeCellValue(step, "description") || "(none provided)"}`,
    `Persona / actors: ${recipeCellValue(step, "personaActors") || "(none provided)"}`,
    `Systems / tools: ${recipeCellValue(step, "systemsTools") || "(none provided)"}`,
    `Data processing: ${recipeCellValue(step, "dataProcessing") || "(none provided)"}`,
    `Rules / decision logic: ${recipeCellValue(step, "rulesDecisionLogic") || "(none provided)"}`,
    `Output: ${recipeCellValue(step, "output") || "(none provided)"}`,
    `Trigger: ${recipeCellValue(step, "trigger") || "(none provided)"}`,
    `Handoff: ${recipeCellValue(step, "handoff") || "(none provided)"}`,
    `Human checkpoint: ${recipeCellValue(step, "humanCheckpoint") || "(none provided)"}`,
    `Pain / friction: ${recipeCellValue(step, "painFriction") || "(none provided)"}`,
    `Data sensitivity: ${recipeCellValue(step, "dataSensitivity") || "(none provided)"}`,
    `Exception branching: ${recipeCellValue(step, "exceptionBranching") || "(none provided)"}`,
    `Regulatory / compliance context: ${recipeCellValue(step, "regulatoryContext") || "(none provided)"}`,
    `AI pattern: ${recipeCellValue(step, "aiPattern") || "(infer the most fitting pattern)"}`
  ];
  return lines.join("\n");
}

async function handleRecipe(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Invalid request body" });
  }

  const step = body.step;
  if (!step || typeof step !== "object") {
    return sendJson(res, 400, { error: "A workflow step object is required." });
  }
  const workflowName = typeof body.workflowName === "string" ? body.workflowName.trim() : "";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: RECIPE_MODEL,
        max_tokens: 800,
        messages: [
          { role: "system", content: recipeSystemPrompt() },
          { role: "user", content: recipeUserPayload(step, workflowName) }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data.error?.message || "OpenAI API request failed",
        detail: data
      });
    }
    const prompt = data.choices?.[0]?.message?.content?.trim() || "";
    if (!prompt) {
      return sendJson(res, 502, { error: "The model returned an empty prompt." });
    }
    return sendJson(res, 200, { prompt });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Recipe generation failed" });
  }
}

async function handleRealtimeSession(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  const sdp = await readText(req);
  // The realtime body is raw SDP, so the grid summary (when present) rides in on
  // a URI-encoded header set by the client at session creation.
  const rawGridSummary = req.headers["x-grid-summary"];
  let gridSummary = "";
  if (typeof rawGridSummary === "string" && rawGridSummary) {
    try {
      gridSummary = decodeURIComponent(rawGridSummary);
    } catch {
      gridSummary = "";
    }
  }
  const formData = new FormData();
  formData.set("sdp", sdp);
  formData.set(
    "session",
    JSON.stringify({
      type: "realtime",
      model: REALTIME_MODEL,
      instructions: realtimeInstructions(gridSummary),
      reasoning: {
        effort: REALTIME_REASONING_EFFORT
      },
      audio: {
        output: {
          voice: REALTIME_VOICE
        }
      }
    })
  );

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": "local-discovery-intake"
    },
    body: formData
  });

  const text = await response.text();
  if (!response.ok) {
    res.writeHead(response.status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(text);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/sdp",
    "Cache-Control": "no-store"
  });
  res.end(text);
}

async function handleTranscribeAudio(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  const audioBuffer = await readBuffer(req, 30_000_000);
  if (!audioBuffer.length) {
    return sendJson(res, 400, { error: "No audio was received." });
  }

  const contentType = String(req.headers["content-type"] || "audio/webm");
  const extension = audioExtensionForContentType(contentType);
  const currentQuestion = decodeHeaderValue(req.headers["x-current-question"] || "");
  const domainTerms = decodeHeaderValue(req.headers["x-domain-terms"] || "");
  const file = new Blob([audioBuffer], { type: contentType });
  const formData = new FormData();
  formData.set("file", file, `discovery-turn.${extension}`);
  formData.set("model", TRANSCRIPTION_MODEL);
  formData.set("response_format", "json");
  formData.set("prompt", transcriptionPrompt({ currentQuestion, domainTerms }));

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: formData
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }

  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || "OpenAI transcription request failed",
      detail: data
    });
  }

  return sendJson(res, 200, {
    transcript: String(data.text || data.transcript || "").trim(),
    model: TRANSCRIPTION_MODEL
  });
}

async function handleTextToSpeech(req, res) {
  if (!OPENAI_API_KEY) {
    return sendJson(res, 400, {
      error: "OPENAI_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  const body = await readJson(req);
  const text = String(body.text || "").trim();
  if (!text) {
    return sendJson(res, 400, { error: "No text was provided to speak." });
  }
  // Voice is env-configurable (TTS_VOICE); the request may override per call,
  // but we fall back to the server default so it works with no client changes.
  const voice = String(body.voice || TTS_VOICE).trim() || TTS_VOICE;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input: text.slice(0, 4000),
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    let parsed = {};
    try {
      parsed = detail ? JSON.parse(detail) : {};
    } catch {
      parsed = { raw: detail };
    }
    return sendJson(res, response.status, {
      error: parsed.error?.message || "OpenAI text-to-speech request failed",
      detail: parsed
    });
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": audioBuffer.length,
    "Cache-Control": "no-store"
  });
  return res.end(audioBuffer);
}

async function handleListSessions(req, res) {
  await ensureDataDirs();
  const userId = currentUserId(req);
  const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true }).catch(() => []);
  const summaries = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const payload = JSON.parse(await fs.readFile(path.join(SESSIONS_DIR, entry.name), "utf8"));
      // No user (auth off) → list everything, as before. With a user, show only
      // their own sessions; legacy/unclaimed sessions (no userId) stay hidden
      // until claimed via load/save (claim-on-access).
      if (userId && payload.userId !== userId) continue;
      summaries.push(payload.summary || summarizeSession(payload.state || {}));
    } catch (error) {
      console.warn(`Could not read session ${entry.name}:`, error.message);
    }
  }
  summaries.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return sendJson(res, 200, { sessions: summaries });
}

async function handleGetSession(req, res, sessionId) {
  const safeId = safeIdentifier(sessionId);
  if (!safeId) return sendJson(res, 400, { error: "Invalid session id" });
  await ensureDataDirs();
  const filePath = path.join(SESSIONS_DIR, `${safeId}.json`);
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return sendJson(res, 404, { error: "Session not found" });
  }
  const userId = currentUserId(req);
  if (userId) {
    // Owned by someone else → 404 (don't leak existence).
    if (payload.userId && payload.userId !== userId) return sendJson(res, 404, { error: "Session not found" });
    // Legacy/unclaimed → claim-on-access: stamp this user and resave.
    if (!payload.userId) {
      payload.userId = userId;
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2)).catch((error) => {
        console.warn(`Could not claim session ${safeId}:`, error.message);
      });
    }
  }
  appendAudit(req, "session_loaded", { sessionId: safeId, content: payload.state });
  return sendJson(res, 200, payload);
}

async function handleSaveSession(req, res) {
  const body = await readJson(req);
  const state = body.state || {};
  const summary = summarizeSession(state);
  if (!summary.id) return sendJson(res, 400, { error: "Session id is required" });
  await ensureDataDirs();
  const userId = currentUserId(req);
  const filePath = path.join(SESSIONS_DIR, `${safeIdentifier(summary.id)}.json`);
  let existed = false;
  if (userId) {
    // Block overwriting a session owned by a different user (404, no leak).
    try {
      const existing = JSON.parse(await fs.readFile(filePath, "utf8"));
      existed = true;
      if (existing.userId && existing.userId !== userId) return sendJson(res, 404, { error: "Session not found" });
    } catch {
      // no existing file — first save
    }
  }
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    summary,
    state
  };
  if (userId) payload.userId = userId; // stamp owner only when a user is present
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  appendAudit(req, existed ? "session_saved" : "session_created", { sessionId: safeIdentifier(summary.id), content: state });
  return sendJson(res, 200, { ok: true, summary });
}

async function handleDeleteSession(req, res, sessionId) {
  const safeId = safeIdentifier(sessionId);
  if (!safeId) return sendJson(res, 400, { error: "Invalid session id" });
  await ensureDataDirs();
  const filePath = path.join(SESSIONS_DIR, `${safeId}.json`);
  const userId = currentUserId(req);
  if (userId) {
    // Same ownership check as get: another user's session → 404, don't delete.
    try {
      const existing = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (existing.userId && existing.userId !== userId) return sendJson(res, 404, { error: "Session not found" });
    } catch {
      // missing file → fall through to the idempotent rm below
    }
  }
  await fs.rm(filePath, { force: true });
  appendAudit(req, "session_deleted", { sessionId: safeId });
  return sendJson(res, 200, { ok: true });
}

async function handleListPackages(req, res) {
  await ensureDataDirs();
  const entries = await fs.readdir(PACKAGES_DIR, { withFileTypes: true }).catch(() => []);
  const packages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(PACKAGES_DIR, entry.name);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(packageDir, "package-manifest.json"), "utf8"));
      const stats = await fs.stat(packageDir);
      packages.push({
        packageName: entry.name,
        relativePath: path.relative(__dirname, packageDir),
        createdAt: manifest.createdAt || stats.mtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        summary: manifest.summary || {},
        files: Array.isArray(manifest.files) ? manifest.files : []
      });
    } catch (error) {
      console.warn(`Could not read package ${entry.name}:`, error.message);
    }
  }
  packages.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return sendJson(res, 200, { packages });
}

async function handleDownloadPackageZip(req, res, packageName) {
  await ensureDataDirs();
  const safeName = safePackageName(packageName);
  if (!safeName) return sendJson(res, 400, { error: "Invalid package name" });

  const packageDir = path.resolve(PACKAGES_DIR, safeName);
  const packagesRoot = path.resolve(PACKAGES_DIR);
  if (!packageDir.startsWith(`${packagesRoot}${path.sep}`)) {
    return sendJson(res, 400, { error: "Invalid package path" });
  }

  const entries = await fs.readdir(packageDir, { withFileTypes: true }).catch(() => null);
  if (!entries) return sendJson(res, 404, { error: "Package not found" });

  const zipEntries = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    zipEntries[`${safeName}/${entry.name}`] = await fs.readFile(path.join(packageDir, entry.name));
  }

  const zipBuffer = createZipBuffer(zipEntries);
  const filename = `${safeName}.zip`;
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Length": zipBuffer.length,
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  return res.end(zipBuffer);
}

async function handleCreatePackage(req, res) {
  const body = await readJson(req);
  const state = body.state || {};
  const summary = summarizeSession(state);
  if (!summary.id) return sendJson(res, 400, { error: "Session id is required" });
  await ensureDataDirs();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const packageName = `${fileSafe(summary.name || summary.workflowName || "discovery-intake")}-${stamp}`;
  const packageDir = path.join(PACKAGES_DIR, packageName);
  await fs.mkdir(packageDir, { recursive: true });

  const files = {
    "README.md": buildPackageReadme(summary),
    "session.json": JSON.stringify(state, null, 2),
    "blueprint.json": JSON.stringify(body.blueprint || {}, null, 2),
    "pdr-draft.md": String(body.pdr || ""),
    "product-pdr-template.json": JSON.stringify(body.productBrief || {}, null, 2),
    "product-pdr-template.md": String(body.productBrief?.markdown || ""),
    "product-pdr-template.docx": createDocxBuffer(body.productBrief?.title || "Product PDR", body.productBrief?.markdown || ""),
    "engineering-brief-template.json": JSON.stringify(body.engineeringBrief || {}, null, 2),
    "engineering-brief-template.md": String(body.engineeringBrief?.markdown || ""),
    "engineering-brief-template.docx": createDocxBuffer(body.engineeringBrief?.title || "Engineering Brief", body.engineeringBrief?.markdown || ""),
    "business-value-template.json": JSON.stringify(body.businessBrief || {}, null, 2),
    "business-value-template.md": String(body.businessBrief?.markdown || ""),
    "business-value-template.docx": createDocxBuffer(body.businessBrief?.title || "Business Value", body.businessBrief?.markdown || ""),
    "governance-inputs-template.json": JSON.stringify(body.governanceBrief || {}, null, 2),
    "governance-inputs-template.md": String(body.governanceBrief?.markdown || ""),
    "governance-inputs-template.docx": createDocxBuffer(body.governanceBrief?.title || "Governance Inputs", body.governanceBrief?.markdown || ""),
    "solution-build-recipe.json": JSON.stringify(body.solutionBuildRecipe || {}, null, 2),
    "solution-build-recipe.md": String(body.solutionBuildRecipe?.markdown || ""),
    "solution-build-recipe.docx": createDocxBuffer(body.solutionBuildRecipe?.title || "Solution Build Recipe", body.solutionBuildRecipe?.markdown || ""),
    "solution-build-recipe-rows.json": JSON.stringify(body.solutionBuildRecipeRows || [], null, 2),
    "solution-build-spec.json": JSON.stringify(body.solutionBuildSpec || {}, null, 2),
    "solution-build-spec-rows.json": JSON.stringify(body.solutionBuildSpecRows || [], null, 2),
    "agent-build-pack.json": JSON.stringify(body.agentBuildPack || {}, null, 2),
    "agent-build-pack.md": String(body.agentBuildPackMarkdown || ""),
    "agent-build-pack.docx": createDocxBuffer("Agent Build Pack", body.agentBuildPackMarkdown || ""),
    "agent-build-pack-rows.json": JSON.stringify(body.agentBuildPackRows || [], null, 2),
    "add-on-provider-plan.json": JSON.stringify(body.addOnProviderPlan || {}, null, 2),
    "add-on-provider-plan.md": String(body.addOnProviderPlanMarkdown || ""),
    "add-on-provider-plan.docx": createDocxBuffer("Add-On Provider Plan", body.addOnProviderPlanMarkdown || ""),
    "add-on-provider-plan-rows.json": JSON.stringify(body.addOnProviderPlanRows || [], null, 2),
    "add-on-test-results.json": JSON.stringify(body.addOnTestResults || {}, null, 2),
    "add-on-test-results.md": String(body.addOnTestResultsMarkdown || ""),
    "add-on-test-results.docx": createDocxBuffer("Add-On Test Results", body.addOnTestResultsMarkdown || ""),
    "add-on-test-results-rows.json": JSON.stringify(body.addOnTestResultsRows || [], null, 2),
    "add-on-setup-runbook.json": JSON.stringify(body.addOnSetupRunbook || {}, null, 2),
    "add-on-setup-runbook.md": String(body.addOnSetupRunbookMarkdown || ""),
    "add-on-setup-runbook.docx": createDocxBuffer("Add-On Setup Runbook", body.addOnSetupRunbookMarkdown || ""),
    "add-on-setup-runbook-rows.json": JSON.stringify(body.addOnSetupRunbookRows || [], null, 2),
    "workflow-map-studio.json": JSON.stringify(body.workflowMapStudio || {}, null, 2),
    "workflow-map-studio.md": String(body.workflowMapStudioMarkdown || ""),
    "workflow-map-studio.mmd": String(body.workflowMapMermaid || ""),
    "workflow-map-studio.docx": createDocxBuffer("Workflow Map Studio", body.workflowMapStudioMarkdown || ""),
    "workflow-map-studio-rows.json": JSON.stringify(body.workflowMapStudioRows || [], null, 2),
    "solution-capability-plan.json": JSON.stringify(body.solutionCapabilityPlan || {}, null, 2),
    "solution-capability-plan-rows.json": JSON.stringify(body.solutionCapabilityPlanRows || [], null, 2),
    "solution-execution-plan.json": JSON.stringify(body.solutionExecutionPlan || {}, null, 2),
    "solution-execution-plan.md": String(body.solutionExecutionPlanMarkdown || body.solutionExecutionBrief?.markdown || ""),
    "solution-execution-plan.docx": createDocxBuffer(body.solutionExecutionBrief?.title || "Solution Execution Plan", body.solutionExecutionPlanMarkdown || body.solutionExecutionBrief?.markdown || ""),
    "solution-execution-plan-rows.json": JSON.stringify(body.solutionExecutionPlanRows || [], null, 2),
    "enterprise-connector-contracts.json": JSON.stringify(body.enterpriseConnectorContracts || {}, null, 2),
    "enterprise-connector-contracts.md": String(body.enterpriseConnectorContractsMarkdown || ""),
    "enterprise-connector-contracts.docx": createDocxBuffer("Enterprise Connector Contracts", body.enterpriseConnectorContractsMarkdown || ""),
    "enterprise-connector-contract-rows.json": JSON.stringify(body.enterpriseConnectorContractRows || [], null, 2),
    "connector-approval-checklist.json": JSON.stringify(body.connectorApprovalChecklist || {}, null, 2),
    "connector-approval-checklist.md": String(body.connectorApprovalChecklistMarkdown || ""),
    "connector-approval-checklist.docx": createDocxBuffer("Connector Approval Checklist", body.connectorApprovalChecklistMarkdown || ""),
    "connector-approval-checklist-rows.json": JSON.stringify(body.connectorApprovalChecklistRows || [], null, 2),
    "connector-validation-plan.json": JSON.stringify(body.connectorValidationPlan || {}, null, 2),
    "connector-validation-plan.md": String(body.connectorValidationPlanMarkdown || ""),
    "connector-validation-plan.docx": createDocxBuffer("Connector Validation Plan", body.connectorValidationPlanMarkdown || ""),
    "connector-validation-plan-rows.json": JSON.stringify(body.connectorValidationPlanRows || [], null, 2),
    "connector-validation-evidence-log.json": JSON.stringify(body.connectorValidationEvidenceLog || {}, null, 2),
    "connector-validation-evidence-log.md": String(body.connectorValidationEvidenceLogMarkdown || ""),
    "connector-validation-evidence-log.docx": createDocxBuffer("Connector Validation Evidence Log", body.connectorValidationEvidenceLogMarkdown || ""),
    "connector-validation-evidence-log-rows.json": JSON.stringify(body.connectorValidationEvidenceLogRows || [], null, 2),
    "connector-build-request-pack.json": JSON.stringify(body.connectorBuildRequestPack || {}, null, 2),
    "connector-build-request-pack.md": String(body.connectorBuildRequestMarkdown || ""),
    "connector-build-request-pack.docx": createDocxBuffer("Connector Build Request Pack", body.connectorBuildRequestMarkdown || ""),
    "connector-build-request-pack-rows.json": JSON.stringify(body.connectorBuildRequestRows || [], null, 2),
    "connector-pilot-runbook.json": JSON.stringify(body.connectorPilotRunbook || {}, null, 2),
    "connector-pilot-runbook.md": String(body.connectorPilotRunbookMarkdown || ""),
    "connector-pilot-runbook.docx": createDocxBuffer("Connector Pilot Runbook", body.connectorPilotRunbookMarkdown || ""),
    "connector-pilot-runbook-rows.json": JSON.stringify(body.connectorPilotRunbookRows || [], null, 2),
    "connector-promotion-decision-packet.json": JSON.stringify(body.connectorPromotionDecisionPacket || {}, null, 2),
    "connector-promotion-decision-packet.md": String(body.connectorPromotionDecisionMarkdown || ""),
    "connector-promotion-decision-packet.docx": createDocxBuffer("Connector Promotion Decision Packet", body.connectorPromotionDecisionMarkdown || ""),
    "connector-promotion-decision-packet-rows.json": JSON.stringify(body.connectorPromotionDecisionRows || [], null, 2),
    "enterprise-readiness-brief.json": JSON.stringify(body.enterpriseReadinessBrief || {}, null, 2),
    "enterprise-readiness-brief.md": String(body.enterpriseReadinessBriefMarkdown || body.enterpriseReadinessBrief?.markdown || ""),
    "enterprise-readiness-brief.docx": createDocxBuffer("Enterprise Readiness Brief", body.enterpriseReadinessBriefMarkdown || body.enterpriseReadinessBrief?.markdown || ""),
    "enterprise-readiness-brief-rows.json": JSON.stringify(body.enterpriseReadinessBriefRows || [], null, 2),
    "combined-handoff-packet.json": JSON.stringify(body.combinedHandoff || {}, null, 2),
    "combined-handoff-packet.md": String(body.combinedHandoff?.markdown || ""),
    "combined-handoff-packet.docx": createDocxBuffer(body.combinedHandoff?.title || "Combined Handoff Packet", body.combinedHandoff?.markdown || ""),
    "template-alignment-contract.json": JSON.stringify(body.templateAlignmentContract || {}, null, 2),
    "template-alignment-contract-rows.json": JSON.stringify(body.templateAlignmentRows || [], null, 2),
    "output-manifest.json": JSON.stringify(body.outputManifest || [], null, 2),
    "output-manifest-rows.json": JSON.stringify(body.outputManifestRows || [], null, 2),
    "connector-registry.json": JSON.stringify(body.connectorRegistry || [], null, 2),
    "connector-registry-rows.json": JSON.stringify(body.connectorRegistryRows || [], null, 2),
    "live-data-setup.json": JSON.stringify(body.liveDataSetup || {}, null, 2),
    "live-data-setup-rows.json": JSON.stringify(body.liveDataSetupRows || [], null, 2),
    "mvp-host-readiness.json": JSON.stringify(body.mvpHostReadiness || {}, null, 2),
    "mvp-host-readiness-rows.json": JSON.stringify(body.mvpHostReadinessRows || [], null, 2),
    "question-routing.json": JSON.stringify(body.questionRouting || [], null, 2),
    "question-routing.md": String(body.questionRoutingMarkdown || ""),
    "question-routing.docx": createDocxBuffer("Open Question Routing", body.questionRoutingMarkdown || ""),
    "process-matrix.json": JSON.stringify(body.processMatrix || [], null, 2),
    "handoff-checklist.json": JSON.stringify(body.handoffChecklist || [], null, 2),
    "handoff-questions.json": JSON.stringify(body.handoffQuestions || {}, null, 2),
    "completion-questions.json": JSON.stringify(body.completionQuestions || [], null, 2),
    "handoff-snapshot.json": JSON.stringify(body.handoffSnapshot || [], null, 2),
    "session-metadata.json": JSON.stringify(body.sessionMetadata || [], null, 2),
    "lifecycle-status.json": JSON.stringify(body.lifecycleStatus || [], null, 2),
    "gate-a-score.json": JSON.stringify(body.gateScore || [], null, 2),
    "governance-route.json": JSON.stringify(body.governanceRoute || [], null, 2),
    "inference-lens.json": JSON.stringify(body.inferenceLens || [], null, 2),
    "reference-dropdowns.json": JSON.stringify(body.referenceDropdowns || [], null, 2),
    "live-test-plan.json": JSON.stringify(body.liveTestPlan || [], null, 2),
    "live-test-plan.md": String(body.liveTestPlanMarkdown || ""),
    "live-test-script-rubric.json": JSON.stringify(body.liveTestScript || [], null, 2),
    "live-test-script-rubric.md": String(body.liveTestScriptMarkdown || ""),
    "live-test-colleague-handoff.json": JSON.stringify(body.liveTestHandoff || [], null, 2),
    "live-test-colleague-handoff.md": String(body.liveTestHandoffMarkdown || ""),
    "pilot-round-tracker.json": JSON.stringify(body.pilotRoundTracker || [], null, 2),
    "pilot-round-tracker.md": String(body.pilotRoundTrackerMarkdown || ""),
    "small-team-pilot-kit.json": JSON.stringify(body.smallTeamPilotKit || [], null, 2),
    "small-team-pilot-kit.md": String(body.smallTeamPilotKitMarkdown || ""),
    "guided-pilot.json": JSON.stringify(body.pilotGuide || [], null, 2),
    "guided-pilot.md": String(body.pilotGuideMarkdown || ""),
    "pilot-controls.json": JSON.stringify(body.pilotControls || [], null, 2),
    "pilot-runbook.md": String(body.pilotRunbook || ""),
    "pilot-feedback.json": JSON.stringify(body.pilotFeedback || [], null, 2),
    "pilot-feedback.md": String(body.pilotFeedbackMarkdown || ""),
    "pilot-insights.json": JSON.stringify(body.pilotInsights || [], null, 2),
    "pilot-insights.md": String(body.pilotInsightsMarkdown || ""),
    "reviewer-decision-summary.json": JSON.stringify(body.reviewerDecisionSummary || {}, null, 2),
    "reviewer-decision-summary-rows.json": JSON.stringify(body.reviewerDecisionRows || [], null, 2),
    "reviewer-decision-summary.md": String(body.reviewerDecisionMarkdown || ""),
    "reviewer-one-page-summary.json": JSON.stringify(body.reviewerOnePage || {}, null, 2),
    "reviewer-one-page-summary-rows.json": JSON.stringify(body.reviewerOnePageRows || [], null, 2),
    "reviewer-one-page-summary.md": String(body.reviewerOnePageMarkdown || ""),
    "reviewer-one-page-summary.docx": createDocxBuffer("Reviewer One-Page Summary", body.reviewerOnePageMarkdown || ""),
    "evidence-summary.md": String(body.evidenceSummary || "No evidence summary captured."),
    "evidence-linkage.json": JSON.stringify(body.evidenceLinkage || {}, null, 2),
    "evidence-linkage-rows.json": JSON.stringify(body.evidenceLinkageRows || [], null, 2),
    "evidence-linkage.md": String(body.evidenceLinkageMarkdown || ""),
    "package-manifest.json": JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      summary,
      files: [
        "README.md",
        "session.json",
        "blueprint.json",
        "pdr-draft.md",
        "product-pdr-template.json",
        "product-pdr-template.md",
        "product-pdr-template.docx",
        "engineering-brief-template.json",
        "engineering-brief-template.md",
        "engineering-brief-template.docx",
        "business-value-template.json",
        "business-value-template.md",
        "business-value-template.docx",
        "governance-inputs-template.json",
        "governance-inputs-template.md",
        "governance-inputs-template.docx",
        "solution-build-recipe.json",
        "solution-build-recipe.md",
        "solution-build-recipe.docx",
        "solution-build-recipe-rows.json",
        "solution-build-spec.json",
        "solution-build-spec-rows.json",
        "agent-build-pack.json",
        "agent-build-pack.md",
        "agent-build-pack.docx",
        "agent-build-pack-rows.json",
        "add-on-provider-plan.json",
        "add-on-provider-plan.md",
        "add-on-provider-plan.docx",
        "add-on-provider-plan-rows.json",
        "add-on-test-results.json",
        "add-on-test-results.md",
        "add-on-test-results.docx",
        "add-on-test-results-rows.json",
        "add-on-setup-runbook.json",
        "add-on-setup-runbook.md",
        "add-on-setup-runbook.docx",
        "add-on-setup-runbook-rows.json",
        "workflow-map-studio.json",
        "workflow-map-studio.md",
        "workflow-map-studio.mmd",
        "workflow-map-studio.docx",
        "workflow-map-studio-rows.json",
        "solution-capability-plan.json",
        "solution-capability-plan-rows.json",
        "solution-execution-plan.json",
        "solution-execution-plan.md",
        "solution-execution-plan.docx",
        "solution-execution-plan-rows.json",
        "enterprise-connector-contracts.json",
        "enterprise-connector-contracts.md",
        "enterprise-connector-contracts.docx",
        "enterprise-connector-contract-rows.json",
        "connector-approval-checklist.json",
        "connector-approval-checklist.md",
        "connector-approval-checklist.docx",
        "connector-approval-checklist-rows.json",
        "connector-validation-plan.json",
        "connector-validation-plan.md",
        "connector-validation-plan.docx",
        "connector-validation-plan-rows.json",
        "connector-validation-evidence-log.json",
        "connector-validation-evidence-log.md",
        "connector-validation-evidence-log.docx",
        "connector-validation-evidence-log-rows.json",
        "connector-build-request-pack.json",
        "connector-build-request-pack.md",
        "connector-build-request-pack.docx",
        "connector-build-request-pack-rows.json",
        "connector-pilot-runbook.json",
        "connector-pilot-runbook.md",
        "connector-pilot-runbook.docx",
        "connector-pilot-runbook-rows.json",
        "connector-promotion-decision-packet.json",
        "connector-promotion-decision-packet.md",
        "connector-promotion-decision-packet.docx",
        "connector-promotion-decision-packet-rows.json",
        "enterprise-readiness-brief.json",
        "enterprise-readiness-brief.md",
        "enterprise-readiness-brief.docx",
        "enterprise-readiness-brief-rows.json",
        "combined-handoff-packet.json",
        "combined-handoff-packet.md",
        "combined-handoff-packet.docx",
        "template-alignment-contract.json",
        "template-alignment-contract-rows.json",
        "output-manifest.json",
        "output-manifest-rows.json",
        "connector-registry.json",
        "connector-registry-rows.json",
        "live-data-setup.json",
        "live-data-setup-rows.json",
        "mvp-host-readiness.json",
        "mvp-host-readiness-rows.json",
        "question-routing.json",
        "question-routing.md",
        "question-routing.docx",
        "process-matrix.json",
        "handoff-checklist.json",
        "handoff-questions.json",
        "completion-questions.json",
        "handoff-snapshot.json",
        "session-metadata.json",
        "lifecycle-status.json",
        "gate-a-score.json",
        "governance-route.json",
        "inference-lens.json",
        "reference-dropdowns.json",
        "live-test-plan.json",
        "live-test-plan.md",
        "live-test-script-rubric.json",
        "live-test-script-rubric.md",
        "live-test-colleague-handoff.json",
        "live-test-colleague-handoff.md",
        "pilot-round-tracker.json",
        "pilot-round-tracker.md",
        "small-team-pilot-kit.json",
        "small-team-pilot-kit.md",
        "guided-pilot.json",
        "guided-pilot.md",
        "pilot-controls.json",
        "pilot-runbook.md",
        "pilot-feedback.json",
        "pilot-feedback.md",
        "pilot-insights.json",
        "pilot-insights.md",
        "reviewer-decision-summary.json",
        "reviewer-decision-summary-rows.json",
        "reviewer-decision-summary.md",
        "reviewer-one-page-summary.json",
        "reviewer-one-page-summary-rows.json",
        "reviewer-one-page-summary.md",
        "reviewer-one-page-summary.docx",
        "evidence-summary.md",
        "evidence-linkage.json",
        "evidence-linkage-rows.json",
        "evidence-linkage.md",
        "package-manifest.json"
      ]
    }, null, 2)
  };

  for (const [fileName, content] of Object.entries(files)) {
    await fs.writeFile(path.join(packageDir, fileName), content);
  }

  return sendJson(res, 200, {
    ok: true,
    packageName,
    packagePath: packageDir,
    relativePath: path.relative(__dirname, packageDir),
    zipUrl: `/api/packages/${encodeURIComponent(packageName)}/download`,
    files: Object.keys(files)
  });
}

async function ensureDataDirs() {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(PACKAGES_DIR, { recursive: true });
}

function summarizeSession(state = {}) {
  const meta = state.sessionMeta || {};
  const fields = state.fields || {};
  const now = new Date().toISOString();
  const id = safeIdentifier(meta.id) || `session-${Date.now().toString(36)}`;
  return {
    id,
    // `sessionId` / `savedAt` are convenience aliases for the saved-sessions UI
    // (the canonical fields remain `id` / `updatedAt`).
    sessionId: id,
    name: meta.name || fields.workflowName || fields.submittedWorkflowTask || "Untitled discovery",
    owner: meta.owner || "",
    source: meta.source || "Live discovery",
    dataClassification: meta.dataClassification || "Unknown",
    status: meta.status || "Discovery",
    createdAt: meta.createdAt || now,
    updatedAt: meta.updatedAt || now,
    savedAt: meta.updatedAt || now,
    workflowName: fields.workflowName || fields.submittedWorkflowTask || "",
    category: fields.workflowCategory && fields.workflowCategory !== "unknown" ? fields.workflowCategory : "Category TBD",
    recordType: fields.recordType || "Live Opportunity",
    practice: fields.practice || "unknown",
    projectType: fields.projectType || "unknown",
    lifecycleStage: fields.lifecycleStage || "2 - Problem Deep Dive and Intake",
    lifecycleStatus: fields.lifecycleStatus || "Intake In Progress",
    priority: fields.priority || "Medium",
    gateDecision: fields.gateDecision || "More discovery",
    domain: fields.domain || "",
    readiness: fields.buildReadiness || "unknown",
    stepCount: Array.isArray(state.steps) ? state.steps.length : 0,
    dataCount: Array.isArray(state.data) ? state.data.length : 0,
    systemCount: Array.isArray(state.systems) ? state.systems.length : 0,
    decisionCount: Array.isArray(state.decisions) ? state.decisions.length : 0,
    serverStored: true
  };
}

function buildPackageReadme(summary) {
  return [
    `# ${summary.name || "Discovery Intake Package"}`,
    "",
    "This local package is generated by the AI Workflow Discovery Studio for Product and Engineering handoff review.",
    "",
    "## Session",
    `- Session ID: ${summary.id}`,
    `- Workflow: ${summary.workflowName || "TBD"}`,
    `- Category: ${summary.category || "TBD"}`,
    `- Domain: ${summary.domain || "TBD"}`,
    `- Status: ${summary.status || "TBD"}`,
    `- Data classification: ${summary.dataClassification || "Unknown"}`,
    `- Updated: ${summary.updatedAt || "TBD"}`,
    "",
    "## Files",
    "- `session.json`: full saved application state.",
    "- `blueprint.json`: Product/Engineering blueprint JSON.",
    "- `pdr-draft.md`: readable PDR-style draft.",
    "- `product-pdr-template.docx` / `.json` / `.md`: Product PDR handoff aligned to the implementation template.",
    "- `engineering-brief-template.docx` / `.json` / `.md`: Engineering / Solution Architecture brief aligned to the implementation template.",
    "- `business-value-template.docx` / `.json` / `.md`: Business Value brief aligned to the implementation template.",
    "- `governance-inputs-template.docx` / `.json` / `.md`: basic data boundary, deployment, human review, and later governance review inputs.",
    "- `solution-build-recipe.docx` / `.json` / `.md` / `-rows.json`: practical ChatGPT and Microsoft Copilot implementation recipe, including platform route, prompt pack, connector plan, controls, MVP steps, and pilot test script.",
    "- `solution-build-spec.json` / `solution-build-spec-rows.json`: machine-readable ChatGPT/Copilot build contract for route logic, platform responsibilities, connector candidates, controls, MVP steps, and test criteria.",
    "- `agent-build-pack.docx` / `.md` / `.json` / `-rows.json`: build-surface guide for Custom GPT/ChatGPT project, ChatGPT tools, OpenAI Agents SDK app, Microsoft 365 Copilot/Copilot Studio, and full custom app options.",
    "- `add-on-provider-plan.docx` / `.md` / `.json` / `-rows.json`: optional provider registry for voice, speech-to-text, OCR/document intelligence, PII/privacy review, workflow visualization, and eval/observability add-ons with setup and enterprise approval gates.",
    "- `add-on-test-results.docx` / `.md` / `.json` / `-rows.json`: latest Operator Add-ons Test Lab evidence showing local configuration checks, optional safe live preflight checks, missing provider values, and next actions.",
    "- `add-on-setup-runbook.docx` / `.md` / `.json` / `-rows.json`: step-by-step provider setup guide covering missing env vars, restart command, safe live-check behavior, and enterprise guardrails.",
    "- `workflow-map-studio.docx` / `.md` / `.json` / `.mmd` / `-rows.json`: visual workflow map contract covering steps, data, systems, decisions, handoffs, controls, open questions, and Mermaid source.",
    "- `solution-capability-plan.json` / `solution-capability-plan-rows.json`: feature-level plan mapping ChatGPT capabilities, Microsoft Copilot surfaces, human checkpoints, and enterprise hardening phases.",
    "- `solution-execution-plan.docx` / `.json` / `.md` / `-rows.json`: builder-facing runbook mapping each ChatGPT/Copilot capability to required data inputs, permissions, enterprise controls, human checkpoints, package evidence, and expected output.",
    "- `enterprise-connector-contracts.docx` / `.md` / `.json` / `-rows.json`: enterprise connector contract pack covering source systems, source locations, permission scope, allowed/blocked operations, approval gates, pilot data policy, fallback mode, setup steps, and test criteria.",
    "- `connector-approval-checklist.docx` / `.md` / `.json` / `-rows.json`: decision checklist for source owner, platform owner, governance, permission, evidence, and fallback approval before connector build.",
    "- `connector-validation-plan.docx` / `.md` / `.json` / `-rows.json`: executable validation plan for source reachability, permission boundaries, blocked operations, safe pilot data, audit evidence, human review gates, fallback mode, and write/action safeguards.",
    "- `connector-validation-evidence-log.docx` / `.md` / `.json` / `-rows.json`: reviewer evidence log for validation proof, evidence owner, result options, decision impact, package target, and fallback routing.",
    "- `connector-build-request-pack.docx` / `.md` / `.json` / `-rows.json`: ticket-ready connector build or approval request pack with requested decision, minimum build scope, owners, controls, evidence package, and out-of-scope behavior.",
    "- `connector-pilot-runbook.docx` / `.md` / `.json` / `-rows.json`: controlled safe-sample pilot runbook with preflight, sample setup, access setup, validation, evidence capture, human signoff, fallback drill, promotion decision, stop triggers, and package evidence.",
    "- `connector-promotion-decision-packet.docx` / `.md` / `.json` / `-rows.json`: reviewer decision packet for promote/defer/block recommendations, evidence gaps, fallback posture, enterprise handoff, stop criteria, and package evidence.",
    "- `enterprise-readiness-brief.docx` / `.json` / `.md` / `-rows.json`: approval-style enterprise readiness brief covering release gates, owners, testing evidence, connector approvals, data/storage/auth/audit posture, and next actions.",
    "- `combined-handoff-packet.docx` / `.json` / `.md`: combined Product, Engineering, Business, and routing packet.",
    "- `template-alignment-contract.json` / `template-alignment-contract-rows.json`: shared contract for template routes, workbook sheets, package files, required sections, and output surfaces.",
    "- `output-manifest.json` / `output-manifest-rows.json`: export contract showing each downloadable output, owner, readiness, source of truth, and supplement-later flag.",
    "- `connector-registry.json` / `connector-registry-rows.json`: source and endpoint planning contract for local intake, evidence, Microsoft 365, Finance/Ops supplements, and package storage.",
    "- `live-data-setup.json` / `live-data-setup-rows.json`: mode-by-mode checklist for local self testing, colleague sharing, and enterprise source setup.",
    "- `mvp-host-readiness.json` / `mvp-host-readiness-rows.json`: compact hostability gates for local self testing, share testing, and later enterprise deployment.",
    "- `question-routing.docx` / `.md` / `.json`: standalone open question routing by Product, Engineering, Business, Governance Inputs, Finance/Ops, and Domain Sponsor.",
    "- `process-matrix.json`: process matrix rows for the intake template.",
    "- `handoff-checklist.json`: color-status checklist for Product, Engineering, Business, and basic Governance Input readiness.",
    "- `handoff-questions.json`: open Product, Engineering, Business, and Governance Input questions.",
    "- `completion-questions.json`: top missing questions before handoff readiness.",
    "- `handoff-snapshot.json`: Product, Engineering, and Governance Input snapshot rows.",
    "- `session-metadata.json`: session metadata rows.",
    "- `lifecycle-status.json`: AI Infusion lifecycle stage status and required outputs.",
    "- `gate-a-score.json`: prioritization/build gate score and recommended decision.",
    "- `governance-route.json`: MSA boundary, data sensitivity, deployment, and later review path.",
    "- `inference-lens.json`: known facts, AI approximations, and top completion questions.",
    "- `reference-dropdowns.json`: lifecycle and classification dropdown reference values.",
    "- `live-test-plan.json` / `live-test-plan.md`: live usability test status, controls, steps, and benchmark context.",
    "- `live-test-script-rubric.json` / `live-test-script-rubric.md`: facilitator script, output-review tasks, and feedback scoring rubric.",
    "- `live-test-colleague-handoff.json` / `live-test-colleague-handoff.md`: short pre-read and decision checklist for a colleague tester.",
    "- `pilot-round-tracker.json` / `pilot-round-tracker.md`: first-round pilot run plan, evidence targets, package history, and decision criteria.",
    "- `small-team-pilot-kit.json` / `small-team-pilot-kit.md`: 3-5 colleague MVP pilot plan, safe data rules, success criteria, and decision gates.",
    "- `guided-pilot.json`: guided pilot mode status and completion signals.",
    "- `guided-pilot.md`: readable guided pilot walkthrough status.",
    "- `pilot-controls.json`: local pilot control settings and readiness gates.",
    "- `pilot-runbook.md`: facilitator runbook for a colleague pilot.",
    "- `pilot-feedback.json`: structured feedback rows from colleague pilots.",
    "- `pilot-feedback.md`: readable feedback summary from colleague pilots.",
    "- `pilot-insights.json`: feedback-derived themes and improvement backlog.",
    "- `pilot-insights.md`: readable pilot insights and recommended next fixes.",
    "- `reviewer-decision-summary.json` / `reviewer-decision-summary-rows.json` / `reviewer-decision-summary.md`: compact coworker review decision, reviewer snapshots, quality signals, and comment-derived backlog items.",
    "- `reviewer-one-page-summary.docx` / `.md` / `.json` / `-rows.json`: brief business/product/engineering overview of what the app does, current MVP status, next decisions, package files to review, and key controls.",
    "- `evidence-summary.md`: optional evidence summary.",
    "- `evidence-linkage.json` / `evidence-linkage-rows.json` / `evidence-linkage.md`: optional evidence-to-field, step, system, risk, and open-question mapping.",
    "",
    "Use the website's Export Excel button to generate the Excel workbook for the same session."
  ].join("\n");
}

function createDocxBuffer(title, markdown) {
  const now = new Date().toISOString();
  const entries = {
    "[Content_Types].xml": docxContentTypesXml(),
    "_rels/.rels": docxRootRelationshipsXml(),
    "docProps/core.xml": docxCoreXml(title, now),
    "docProps/app.xml": docxAppXml(),
    "word/styles.xml": docxStylesXml(),
    "word/document.xml": docxDocumentXml(title, markdown)
  };
  return createZipBuffer(entries);
}

function docxContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function docxRootRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function docxCoreXml(title, timestamp) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title || "Discovery handoff")}</dc:title>
  <dc:creator>AI Workflow Discovery Studio</dc:creator>
  <cp:lastModifiedBy>AI Workflow Discovery Studio</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(timestamp)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(timestamp)}</dcterms:modified>
</cp:coreProperties>`;
}

function docxAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>AI Workflow Discovery Studio</Application>
</Properties>`;
}

function docxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="111827"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="111827"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="1f2937"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="374151"/></w:rPr>
  </w:style>
</w:styles>`;
}

function docxDocumentXml(title, markdown) {
  const paragraphs = markdownToDocxParagraphs(title, markdown);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1200" w:bottom="1440" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function markdownToDocxParagraphs(title, markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const titleText = stripMarkdownSyntax(lines[0]?.replace(/^#\s+/, "") || title || "Discovery handoff");
  const paragraphs = [docxParagraph(titleText, "Title")];
  lines.slice(1).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(docxParagraph(""));
      return;
    }
    if (/^###\s+/.test(trimmed)) {
      paragraphs.push(docxParagraph(stripMarkdownSyntax(trimmed.replace(/^###\s+/, "")), "Heading3"));
      return;
    }
    if (/^##\s+/.test(trimmed)) {
      paragraphs.push(docxParagraph(stripMarkdownSyntax(trimmed.replace(/^##\s+/, "")), "Heading2"));
      return;
    }
    if (/^#\s+/.test(trimmed)) {
      paragraphs.push(docxParagraph(stripMarkdownSyntax(trimmed.replace(/^#\s+/, "")), "Heading1"));
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const bulletText = escapeXml(stripMarkdownSyntax(trimmed.replace(/^[-*]\s+/, "")));
      paragraphs.push(docxParagraph(`&#8226; ${bulletText}`, "Normal", { preEscaped: true }));
      return;
    }
    paragraphs.push(docxParagraph(stripMarkdownSyntax(trimmed)));
  });
  return paragraphs;
}

function docxParagraph(text, style = "Normal", options = {}) {
  const body = options.preEscaped ? String(text || "") : escapeXml(text || "");
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">${body}</w:t></w:r></w:p>`;
}

function stripMarkdownSyntax(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/^>\s*/, "");
}

function createZipBuffer(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  Object.entries(entries).forEach(([name, value]) => {
    const nameBytes = encoder.encode(name);
    const dataBytes = value instanceof Uint8Array ? value : encoder.encode(String(value || ""));
    const crc = crc32(dataBytes);
    const { time, date } = zipDosDateTime(new Date());
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);
  return Buffer.concat([...localParts, ...centralParts, endRecord].map((part) => Buffer.from(part)));
}

function zipDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crc32Table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeIdentifier(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
}

function safePackageName(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 160);
}

function fileSafe(value) {
  return String(value || "discovery-intake")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "discovery-intake";
}

// Post-extraction pivot block injected into every prompt builder when a
// non-empty grid summary is supplied (i.e. a document has pre-populated the
// grid). Tells the model to acknowledge the extraction, confirm the step list,
// and then drill only the empty/unknown cells listed in the summary.
function documentExtractionPivotBlock(gridSummary) {
  return [
    "CRITICAL OVERRIDE — DOCUMENT EXTRACTION COMPLETE.",
    "",
    "You have just received a SYSTEM_TRIGGER message, not a user answer.",
    "Do NOT echo or repeat the trigger text under any circumstances.",
    "Do NOT ask \"what do you call this workflow\" or any generic intake question.",
    "",
    gridSummary,
    "",
    "Your ONLY permitted response right now is:",
    "1. One sentence acknowledging the number of steps extracted (e.g. \"I've pulled [N] steps from your document.\")",
    "2. List the step names briefly so the user can scan them.",
    "3. Ask: \"Do these steps look right, or is anything missing or named incorrectly?\"",
    "",
    "After the user confirms, drill ONLY on empty/unknown cells listed above. Never re-ask confirmed or inferred cells."
  ].join("\n");
}

function extractionInstructions(gridSummary = "") {
  const lines = [
    "You extract structured current-state repetitive workflow intake details from interview text.",
    "The user works in a finance-industry-focused management consulting environment. North star: understand real current-state work across client delivery, pre-delivery, pursuit, internal delivery enablement, and post-delivery synthesis, then turn it into Product/Engineering-ready AI opportunities. Business-case metrics such as capacity, margin, volume, cost rate, and project economics can often be supplemented later by Finance, Operations, PMO, Account Reporting, or practice leadership.",
    "Do not assume every idea is client delivery execution. Always classify workflowCategory as Client delivery execution, Pre-delivery / workshop prep, Pursuit / revenue enablement, Internal delivery enablement, Post-delivery synthesis, Other, or unknown.",
    "Also classify the opportunity using the AI Infusion lifecycle fields when supported: recordType (Live Opportunity, Example Seed, Backlog Candidate, Merged/Duplicate, Archived), practice (Banking, Insurance, Fraud & Risk, Cybersecurity, Business Consulting, Strategy, Data, Tech, Tech & Engineering, Project Governance, Testing, FRRF, Banking & Payments, Capital Markets, Wealth Asset Management), projectType (Regulatory / Compliance, Risk / Controls, Data / Analytics, Technology Delivery, Process Transformation, PMO / Delivery Management, Model / Analytics Validation, Client Reporting, Operations / Run-the-bank, Strategy / Advisory), unitOfAnalysis (Individual Role, End-to-End Workflow, Both), lifecycleStage, lifecycleStatus, priority, automationPotential, and gateDecision.",
    "Classify useCaseArchetype when supported by the submitted idea or current-state facts. Use exact values such as Testing / QA automation, Requirements / traceability, Project governance summaries, Agile ceremony / PI planning, Document review and system upload, Data quality / exception resolution, Risk assessment and controls, Analytics and market insights, UAT test script automation, Research / benchmarking, Workshop acceleration, Pursuit / proposal response, Post-delivery reusable assets, or unknown.",
    "For dropdown-like fields, use exact app values. lifecycleStatus must be one of Not Started, Intake In Progress, In Review, Approved, Backlog, Build, Pilot, Scaled, On Hold, Rejected, Complete. gateDecision must be one of Build now, Backlog, Merge, Hold, Reject, More discovery, Approved, Conditionally approved, Blocked, Scaled. dataSensitivity must be Public, Internal, Confidential, Client Confidential, PII, MNPI, PCI, PHI, Regulated model/data, or Unknown. governancePath must be No governance review, Standard AI review, Data privacy review, Model risk review, Cybersecurity review, Legal/MSA review, Client approval required, or Multiple / TBD.",
    "For lifecycleStage, default live discovery sessions to 2 - Problem Deep Dive and Intake until commercial value is clear, then 3 - Business Validation, then 4 - AI Fit Assessment & Solution Designing. Only suggest Gate A - Prioritization / Build Gate when workflow steps, value, and AI/tool fit are sufficiently clear. Capture governance inputs, but do not treat governance as the main preparedness driver.",
    "Capture commercialContext and commercialValuePath only when the user clearly provides them. If they are unclear, leave them Unknown and put the gap in business follow-up or openQuestions; do not keep interrogating the workflow SME for Finance-owned or account-owned metrics.",
    "Capture KPI and value fields when supported: kpiTypes (Time saved, Delivery acceleration, Rework reduction, Quality / accuracy, SLA improvement, Risk reduction, Adoption, Client experience), qualityBenefits, eqIqDemand, changeImpact, and fieldConfidence. Treat detailed volume, margin, cost rate, fixed-fee impact, and staffing mix as supplement-later fields unless the user volunteers them.",
    "Capture governance routing fields when supported: msaBoundary, dataSensitivity, deploymentEnvironment, and governancePath. Use Unknown or Multiple / TBD when the evidence is not clear. If sensitive, regulated, PII, MNPI, PCI, PHI, client confidential, or model-risk data appears, surface this as basic governance input, productClarifications, engineeringClarifications, or openQuestions rather than treating it as the primary build-readiness blocker.",
    "For Pre-delivery / workshop prep, capture workshopType, expectedWorkshopOutput, participantProfile, prepArtifactsNeeded, reusableCollateralSource, facilitationTechnique, and humanJudgmentArea when mentioned or ask nextQuestion to fill the most important missing workshop field. Treat Strategy-origin workshop prep as a cross-practice, lower-technical-density benchmark that can apply before client work or during active client delivery.",
    "Capture workflows from Banking, Insurance, Strategy, FRRF, Capital Markets, Wealth Management, Cyber, and related domains.",
    "Many sessions start from a Domain-submitted idea row. Preserve the submitted idea fields separately from validated workflow facts, including submittedExpectedImpact and submittedNotes when present. Treat submitted candidate AI assist/agent language and expected impact as hypotheses until the workflow evidence validates them.",
    "The initial intake workbook examples show rough opportunities across testing/QA, requirements/traceability, governance summaries, PI planning, document review/CRM upload, data quality exceptions, architecture risk assessment, analytics insights, UAT test scripts, research/benchmarking, and workshop acceleration. Use this as routing context for better questions, not as proof that the idea is build-ready.",
    "When the answer is only a thin topic label such as 'workshop use case', 'claims workflow', 'testing use case', or another short opener, preserve it as submittedIdea/submittedWorkflowTask and optionally infer useCaseArchetype/workflowCategory only when obvious. Do not fill workflowName, commercialContext, commercialValuePath, value fields, data boundary, governance path, systems, or process steps from a thin opener.",
    "Capture ideaValidationStatus as Validated, Needs clarification, Split into multiple workflows, Not enough evidence, or Not a good AI candidate when the text supports it. Capture buildReadiness as High, Medium, Low, or Blocked when supported.",
    "Choose nextQuestion according to this validation flow whenever possible: Idea, Validate, Workflow, Evidence, Value, AI Fit, Blueprint, Review.",
    "Assume most client environments can provide Microsoft 365 Copilot and ChatGPT Enterprise. Prefer solution fit notes around ChatGPT Enterprise, ChatGPT projects/GPTs/connectors/skills, Microsoft 365 Copilot, Copilot agents, Copilot Studio, and multi-agent workflows before custom API builds.",
    "The target deliverable is a product-style PDR handoff plus a skill-compatible step-by-step matrix: Workflow Step, Persona/Actors, Systems/Tools, Access/Source Mode, Input, In Process Data Handling, Output, Handoffs, Triggers, Time Taken, Frequency/Volume, Capacity/Team Composition Impact, Pain/Friction, Exceptions/Variations, Data Sensitivity, AI Pattern, Evidence Confidence, Interview Notes, and Open Questions.",
    "Use a broad-to-specific intake logic. After the opening topic is captured, first establish the workflow name. Frame the workflow boundary with short questions of at most two items each: ask the start point and end point together, then ask the main output on its own. Do not bundle name, start, end, and output into one question.",
    "DOCUMENTS-FIRST QUESTION: As soon as the workflow has been named, and BEFORE the narrative anchor question, set nextQuestion to exactly this open question, worded verbatim: 'Do you have any documents, screenshots, SOPs, or notes about this workflow you'd like to share? If so, use the Add Attachment button below — otherwise just say no and we'll get started.' Ask it once, immediately after the workflow name is captured. If the user says no, declines, starts describing the workflow, or attaches a file via the Add Attachment button, proceed to the narrative anchor (Q1) as normal and do not repeat this question. Never infer pain or step detail from an attached file; those still come from the conversation.",
    "ANCHOR QUESTION: After the documents-first question above has been asked and answered, and before any step-level drilldown, set nextQuestion to exactly one open narrative anchor question, worded verbatim: 'Walk me through this workflow from beginning to end — what triggers it, what happens at each stage, and what does it produce?' This is a single open-ended question and should be the second or third question in the flow, immediately after the documents-first question. Use the end-to-end answer to route every structured question that follows. (This narrative anchor is the only question allowed to name more than two things, because the goal is one free-form end-to-end story rather than a checklist.)",
    "SECOND ANCHOR — PAIN (Q2, MANDATORY): Immediately after the narrative anchor (Q1) answer, and still before Q3 or any step-level drilldown, set nextQuestion to exactly one open question about pain and friction ONLY, worded verbatim: 'What's the most annoying or slow part of this for you or your team?' Q2 is MANDATORY: it must fire after Q1 and before Q3, and you must NOT proceed to Q3 or any step-level drilling until Q2 has been asked and the user has responded — including responses like 'I don't know' or 'skip'. Q2 covers pain/friction ONLY: do not mention governance, rules, approvals, thresholds, or compliance here; those are captured at the step level later. Pain/friction signals can NEVER be extracted from a document upload or evidence artifact — they must come from the user's own words in conversation, so never infer pain from a document; ask the person. ENFORCEMENT — Q2 IS IMMEDIATE: Q2 is the IMMEDIATE next question after Q1. No workflow-level question (tools, systems, inputs, outputs, volume, or anything else) and no step-level question and not Q3 may appear between Q1 and Q2. If you ever find yourself about to ask about tools, systems, steps, or anything other than pain while Q2 has not yet been asked and answered, STOP and ask Q2 first.",
    "THIRD ANCHOR — STEP CONFIRMATION (Q3, MANDATORY, EXPLICIT): Only after Q2 has been asked and answered, and BEFORE any step-level drilling begins, set nextQuestion to a distinct, explicit step-confirmation question shown to the user, worded verbatim apart from the bracketed list: 'Based on what you've described, I'm seeing: [list the steps you have inferred from the Q1 answer, numbered, with casual names]. Does that look right — anything missing, combined, or named differently?' You must dynamically construct the actual step list from what the user said in the narrative anchor; never output the literal bracketed placeholder, and never add steps to the grid silently without asking this question first (silent additions cause duplicates such as 'File arrives' and 'File Arrival'). Wait for the user to confirm or correct before any drilling. If the user corrects, merges, renames, or reorders steps, adopt the corrected list going forward and discard the original inferred list. No step-level drilling begins until Q3 is resolved. If no steps have been inferred yet because no narrative anchor answer has been received, acknowledge that and set nextQuestion to the narrative anchor question (Q1) first before proceeding to this step confirmation.",
    "STEP LIST FREEZE AFTER Q3: Once Q3 is resolved, the user-confirmed step list becomes the ONLY canonical step list. You must REPLACE the entire inferred step list with exactly what the user confirmed — discard all previously inferred steps. Never add the confirmed steps on top of the inferred ones; that is what produces 9 steps when the user only described 4. After Q3 the step count is FROZEN at whatever the user confirmed, and no new steps may be created during step-level drilling. If during drilling the user mentions something that sounds like a new step, capture it as a CELL VALUE on the current step (for example a sub-task inside the in-process data handling or interview notes cell), not as a new step record. You may only suggest adding a step if the user explicitly says something like 'actually there's another step I forgot.'",
    "MAX TWO THINGS PER QUESTION: No nextQuestion may ask about more than two things at once. If you need several details, split them into separate questions of at most two related items each. For example, 'Is it mainly you handling this step, or are there other teams or systems involved?' (two things) and 'What triggers this step?' (one thing) are fine; asking about inputs, data types, tools, and outputs in one question is not. The only exception is the open narrative anchor question above.",
    "HARD RULE — MAX 2 CELL TYPES PER STEP QUESTION: Every step-level question must ask about at most 2 grid cell types (concepts) at once. Never combine more than 2 cell concepts in a single question, and never use 'and' to join more than 2 topics. Prioritise by grid gaps: ask about the most empty cells first. If you need more information, ask a follow-up question next turn.",
    "CONFUSION HANDLING: If the user responds with a short confused answer — for example 'what do you mean', 'I don't understand', 'can you explain', 'huh', '?', or any reply under 5 words that contains no workflow-relevant content — do NOT capture it as intake data or as any field value. Instead, recognise the confusion signal, set nextQuestion to a simpler rephrasing of the current question, and include a brief one-sentence example of what a good answer looks like.",
    "Before detailed step drilldown, build a top-level component overview by asking small separate questions rather than one list: first the big phases in rough order from start to finish, then the main inputs and data types, then the main tools/systems and their access/source mode, then the final outputs. Use that overview to route later questions. If the user gives broad phases without numbers, treat them as workflow context and ask for a rough numbered step-by-step process only when step anchors are still unclear.",
    "BANNED JARGON — NEVER SAY A-TO-Z: Never use the phrase 'A-to-Z', 'A to Z', or 'a-to-z' in any question, acknowledgement, or summary; it is confusing jargon. When you need the ordered process, ask in plain language, for example: 'Walk me through the steps in order — what happens first, and what's the final output?'",
    "WORKFLOW-LEVEL TOOL ANSWERS ARE CONTEXT ONLY: When the user answers a workflow-level tools question (for example 'I use SharePoint, Word, SAP, Hydra, Excel'), store it as overall workflow context only. Do NOT write that same value into every step's systemsTools cell — stamping one tool list across all steps is wrong. Tools belong at the step level: ask per step during drilling, using the workflow-level answer only as a hint, for example: 'You mentioned SharePoint and Hydra earlier — which of those do you actually use for this specific step?'",
    "After a rough skeleton is captured, do not ask permission to proceed or ask whether to move into step confirmation. Treat the skeleton as a working draft, note that the user can correct, add, remove, rename, merge, split, or reorder steps anytime, and set nextQuestion to the first incomplete step drill-down question. Start with Step 1 or the first incomplete step and enrich it with actor, tool, accessMode, action, input, dataHandling, output, handoff, trigger, time, decision, pain, risk, exceptions, dataSensitivity, evidenceConfidence, interviewNotes, and openQuestions.",
    "Treat spoken markers such as Step 1, Step one, first step, second step, third step, and numbered lists like 1), 2), or 1. as strong process-step anchors. Create one step record per anchor, preserve the order, and then use later answers to enrich each anchored step.",
    "When enriching a step, use casual, consultant-style language — never read column header names verbatim and never make it feel like a form. Ask at most two cell types per question, prioritising the emptiest cells, and adapt these phrasings naturally to the conversation: for persona/actors, default to the person you're talking with as the primary actor and confirm or expand rather than asking who it could be, 'Is it mainly you handling this step, or are there other teams or systems involved?'; for systems/tools, 'Any particular tools you use for this?'; for output, 'What comes out of it — a doc, a decision, an email?'; for trigger, 'What kicks this off — is it time-based, or does something land in your inbox?'; for handoff, 'Where does this go next, and who picks it up?'; for human checkpoint, 'Does anyone need to review or sign off here?'; for time taken, 'Roughly how long does this step eat up?'; for frequency/volume, 'How often does this run, and roughly what volume?'; for pain/friction, 'What's the most annoying part of this bit?'; for data sensitivity, 'Anything confidential flowing through here?'; for rules/decision logic, 'Any rules about how the decision gets made — thresholds, approvals, that kind of thing?'. Never ask about AI pattern directly — infer it from context.",
    "When the user answers a step drill-down question, do not repeat the same broad question back. Compare the answer against the fields already captured for the current step, then ask only for the next missing field or cluster. Stay on Step 1 until its core who/where, inputs/data, outputs/handoff, and time/judgment details are reasonably captured, unless the user explicitly names a different step.",
    "When the current question asks for a specific item and the user provides that item, summarize what was captured and advance to the next missing primary intake question. Do not set nextQuestion to the same question again. If the current question is answered before any step-by-step process exists, prefer the broad workflow/component overview and rough numbered step-by-step process before governance, data-boundary, commercial, or detailed value questions.",
    "ADAPTIVE CHECK-INS: Do not use a fixed check-in cadence. Decide when to pause and which of four check-in types to use based on what is happening in the conversation. TYPE 1 SUMMARY — use when 2 or more cells were just filled cleanly and the conversation is flowing well; tone brief, warm, confirmatory (e.g. 'So for Review file — that's you and the line manager in SharePoint, usually about a day. Have I got that right?'). TYPE 2 CONFIRMATION — use when a cell value came back vague, contradictory, or partially answered; tone curious, non-pressuring (e.g. 'Just checking — the approval threshold, is that per project or a fixed amount?'). TYPE 3 GAP PROBE — use when a step has low coverage and drilling has stalled or the user gives short answers; tone gentle redirect (e.g. 'I don't have much yet on what triggers Approve file — what usually kicks that one off?'). TYPE 4 TRANSITION — use when a step has reached sufficient coverage and it's time to move on; tone positive, forward-moving (e.g. 'Good — I think I've got what I need on that one. Let's move to File document.'). RULE: never use the same check-in type twice in a row; vary the pattern, because predictable check-ins lose their value. Check-ins should feel like a natural moment of shared understanding, not a formal pause, and they are not questions.",
    "SESSION COMPLETENESS: The interview has a natural exit condition, not an open-ended drilling loop. Track completeness throughout. A step is AI-READY when ALL of these are true: the aiPattern cell has a value (inferred or confirmed); at least 4 of these cells have values — trigger, personaActors, systemsTools, output, handoff; and step coverage is at least 50%. The SESSION is COMPLETE when AI-ready steps divided by total steps is at least 60%. When the session-complete threshold is reached, stop drilling and signal readiness conversationally, worded like: 'I think I've got enough across most of these steps to start mapping out where AI could seriously help. There are still a few gaps we can fill in later — want to take a look at what I've put together?' Never announce a percentage or mention the threshold explicitly; just signal readiness conversationally and let the user decide whether to continue or move to outputs.",
    "If the user gives a rough numbered list, create one step record per item even if the details are incomplete. Preserve the order and use concise names.",
    "If later text adds details for an existing step, return a step record with the same or similar step name and fill only the newly learned fields.",
    "Translate messy spoken consulting language into the structured intake schema. For example, 'we pull the tracker and compare changes' implies a process step, a tracker data category, likely Excel/SharePoint/email or unknown source tooling, a comparison action, possible version-control pain, and a next question about access mode, sensitivity, and timing.",
    "When you infer a field from context rather than direct confirmation, keep the language qualified in interviewNotes, openQuestions, productClarifications, or engineeringClarifications. Do not overstate inferred facts as confirmed.",
    "For every substantial answer, prioritize the nextQuestion around the most handoff-critical missing detail: workflow boundary, step-by-step process gap, actor/tool/access gap, data sensitivity/access mode, output/handoff, human approval, step friction, or MVP scope. Business value questions should be lightweight and supplementable.",
    "Use the handoff checklist as routing logic for nextQuestion: Product gaps include problem boundary, original ask, validated facts, users, MVP slice, and output definition; Engineering gaps include the step-by-step process, step matrix, systems/tools, access mode, data boundary, and output contract. Business gaps such as commercial context, value path, frequency/time baseline, hours or dollars, and capacity/team mix should be surfaced as supplement-later unless the user already knows them. Governance input gaps should capture only basic data boundary, environment, human review, evidence trace, and obvious risk flags before post-build review.",
    "Do not make the user feel like they are filling a form. Turn the highest-priority checklist gap into one natural conversational question, and keep it grounded in the step or workflow currently being discussed.",
    "Insurance/workshop synthesis and banking exception research examples show two recurring needs: source traceability for generated findings and data policy clarity for sensitive client artifacts. Capture these as engineering/governance questions when relevant.",
    "Workshop prep examples often lack ready-to-run output definition. If the workflowCategory is Pre-delivery / workshop prep, prioritize workshop output, participants, source materials, reusable collateral, and human judgment. Ask commercial context lightly only if it is clearly needed for downstream business review.",
    "Do not prematurely design the future-state solution before current-state intake is clear. After enough intake context exists, infer a concise solution hypothesis, MVP scope, success metrics, tool fit recommendation, user stories, and acceptance criteria when supported by the text.",
    "Capture directional value hypotheses across time saved, faster delivery, quality/rework reduction, risk reduction, and reusable assets. Capacity, staffing mix, fixed-fee margin, and project economics are important for business review but should not dominate the live discovery interview.",
    "Do not ask for or invent raw client data. Capture data categories, processing actions, systems/tools, permissions, access mode, and constraints. accessMode should explain whether the step uses direct system access, Microsoft 365 files, exports, screenshots, transcripts, manual client responses, or unknown access.",
    "Only include facts that are present or strongly implied. Leave unknown strings blank.",
    "Use concise business language suitable for PDR and engineering handoff.",
    "When the user gives a sequence of actions, create process step records. Also map inputs, outputs, handoffs, triggers, time, and human decisions to the relevant step whenever possible.",
    "When the user mentions files, reports, emails, trackers, systems, data types, or repositories, capture data/system records as appropriate.",
    "For each step, capture exceptions or variations and data sensitivity directly on the step record when mentioned. Uploaded screenshots or files are optional supporting evidence, never a requirement for the intake to work. Mark evidenceConfidence as High only when the user confirms; otherwise use Medium or Low.",
    "AI patterns are post-intake enrichment. Fill pattern only when it is obvious from the step; otherwise leave it blank until the intake is complete. Use retrieve, search, extract, transform/normalize, summarize, classify, compare, generate, review/QA, recommend, orchestrate/automate, human approval, or no AI pattern.",
    // Stage 1b grid-awareness. Only active when payload.gridContext is present.
    "GRID-AWARENESS: The request payload may include a gridContext object summarizing a structured workflow grid already populated from earlier discovery or an uploaded document. When gridContext is null or absent, run normal open-ended discovery as usual. When gridContext is present, treat it as a summary of what is ALREADY KNOWN and do not re-ask about it.",
    "When gridContext is present, each step lists populatedFields (already captured with sufficient confidence) and emptyOrWeakFields (missing or low-confidence). Do not ask about any field already listed in populatedFields. Focus nextQuestion on the emptyOrWeakFields, choosing the single biggest, most handoff-critical gap and asking ONE focused question at a time.",
    "When gridContext is present, always prioritise Pain/Friction: only a human can provide it and documents never can, so if any step is missing genuine Pain/Friction, prefer surfacing that gap. Do not infer Pain/Friction yourself; ask the person about it.",
    "When gridContext is present and all high-priority fields across all steps are already populated (no meaningful emptyOrWeakFields remain), shift to wrap-up mode: set nextQuestion to 'I think I have a good picture — let me confirm a few things before we wrap up' and then confirm rather than interrogate.",
    "Return only JSON matching the schema."
  ];
  if (gridSummary && gridSummary.trim()) lines.push(documentExtractionPivotBlock(gridSummary));
  return lines.join(" ");
}

function evidenceInstructions() {
  return [
    "You analyze one optional evidence artifact for a repetitive-work AI intake interview.",
    "The artifact may be a screenshot, tracker, spreadsheet, SOP, process note, PDF, or office document. It is an add-on, not required for the intake to work. Extract only workflow-relevant facts and proposed updates; do not treat evidence as confirmed until the user applies it.",
    "This intake is for finance-industry management consulting engagement workflows across Banking, Insurance, Strategy, FRRF, Capital Markets, Wealth Management, Cyber, and related domains. Workflows may happen before client work, during client delivery, or after delivery.",
    "North star: preserve the original submitted idea, classify the workflow category, validate the current-state workflow, and only then validate the candidate AI assist or agent. Keep submitted assumptions separate from validated facts. Capture commercial context/value path only when clearly visible; otherwise flag it as supplement-later.",
    "Look for submitted idea row fields: submitted idea, workflow/task, where it happens today, frequency, current effort, candidate AI assist/agent, human review needed, repeatability.",
    "Look for current-state workflow facts: workflow category, workflow name, domain, where the work happens, project phase, start/end boundary, steps, actors, tools, systems, access/source mode, data inputs, in-process handling, outputs, handoffs, triggers, time, human decisions, pain, risks, exceptions, data sensitivity, evidence confidence, product clarifications, and engineering clarifications. Commercial and value fields are useful but can be supplemented later.",
    "If this is workshop prep, look for workshop type, expected workshop output, participant profile, prep artifacts needed, reusable collateral source, facilitation technique, human judgment area, and whether the pattern is before client work or embedded in active delivery.",
    "For screenshots, infer visible tools, tables, process labels, and data categories, but mark confidence lower if the image is incomplete or ambiguous.",
    "For documents/spreadsheets, extract concise workflow facts. If a file appears to contain sensitive or client-confidential details, warn the user and summarize data categories rather than reproducing raw data.",
    "Do not invent missing steps. If evidence suggests a step but details are incomplete, put the gap in openQuestions or followUpQuestions.",
    "Return suggestedFieldUpdates only for fields where the artifact provides useful evidence. Return suggestedRecords for process steps, data, systems, decisions, or patterns only when the artifact supports them.",
    "AI pattern tagging is secondary. Use it only when obvious from the artifact; otherwise leave pattern fields blank.",
    "The confirmationPrompt should ask one crisp question the interviewer can ask next to confirm or correct the evidence findings. Every followUpQuestion and the confirmationPrompt must ask about at most two things at once; split anything larger into separate questions.",
    "Return only JSON matching the schema."
  ].join(" ");
}

function chatInstructions(gridSummary = "") {
  const lines = [
    "You are an embedded ChatGPT-style intake copilot inside a workflow discovery website.",
    "Help the user clarify current-state time-heavy engagement workflow details for AI automation discovery in a finance-industry consulting firm. The workflow may be client delivery, pre-delivery/workshop prep, pursuit/revenue enablement, internal delivery enablement, post-delivery synthesis, or other.",
    "If there is a submitted domain idea, treat it as a hypothesis. Help validate whether it matches the actual current-state workflow, needs clarification, should be split, or is not a good AI candidate.",
    "Assume Microsoft 365 Copilot and ChatGPT Enterprise are available. Keep recommendations anchored in those tools, including ChatGPT projects/GPTs/connectors/skills, Copilot, Copilot agents, Copilot Studio, and multi-agent workflows.",
    "Use the AI Infusion lifecycle as background structure: Ideas/Exploration, Problem Deep Dive and Intake, Business Validation, AI Fit Assessment & Solution Designing, Gate A, Solution Design, MVP Build, Governance, Value/KPI, Testing, Pilot, Enablement, Scale, and KPI Tracking. The user conversation should stay simple, but your answers should help prepare Product and Engineering handoff fields.",
    "Follow the same broad-to-specific logic as the voice interviewer: frame the workflow first, capture a top-level component overview second, capture or clarify each numbered process step from start to finish third, then enrich the current step with actor, tools, access/source mode, input, in-process data handling, output, handoff, trigger, time, decisions, pain, exceptions, data sensitivity, confidence, notes, and open questions.",
    "DOCUMENTS-FIRST QUESTION: As soon as the user has named the workflow, and before the narrative anchor, ask exactly this open question, worded verbatim: 'Do you have any documents, screenshots, SOPs, or notes about this workflow you'd like to share? If so, use the Add Attachment button below — otherwise just say no and we'll get started.' Ask it once. If the user says no, declines, starts describing the workflow, or attaches a file via the Add Attachment button, proceed to the narrative anchor as normal and do not repeat it; never infer pain or step detail from an attached file.",
    "After the documents-first question has been asked, and before drilling into step-level detail, ask exactly one open narrative anchor question, worded verbatim: 'Walk me through this workflow from beginning to end — what triggers it, what happens at each stage, and what does it produce?' Ask it as the second or third question, and use the end-to-end answer to route everything that follows.",
    "Q2 — PAIN (MANDATORY): Immediately after the narrative anchor (Q1) answer, and still before Q3 or any step-level detail, ask exactly one open question about pain and friction ONLY, worded verbatim: 'What's the most annoying or slow part of this for you or your team?' Q2 is mandatory and must fire after Q1 and before Q3; do not proceed to Q3 or step-level drilling until Q2 has been asked and the user has responded, including responses like 'I don't know' or 'skip'. Q2 covers pain/friction ONLY — do not mention governance, rules, approvals, thresholds, or compliance here; those are captured at the step level later. Pain/friction can never come from a document upload — it must come from the user's own words in conversation, so ask the person rather than inferring it from any file. ENFORCEMENT — Q2 IS IMMEDIATE: Q2 is the IMMEDIATE next question after Q1. No workflow-level question (tools, systems, inputs, outputs, volume, or anything else) and no step-level question and not Q3 may appear between Q1 and Q2. If you ever find yourself about to ask about tools, systems, steps, or anything other than pain while Q2 has not yet been asked and answered, STOP and ask Q2 first.",
    "Q3 — STEP CONFIRMATION (MANDATORY, EXPLICIT): Only after Q2 has been asked and answered, and before drilling into any step-level detail, ask a distinct, explicit step-confirmation question, worded verbatim apart from the bracketed list: 'Based on what you've described, I'm seeing: [list the steps you inferred from the Q1 answer, numbered, with casual names]. Does that look right — anything missing, combined, or named differently?' Build the actual step list dynamically from what the user said; never show the literal bracketed placeholder and never add steps silently without asking this question first. Wait for the user to confirm or correct before drilling. If the user corrects, merges, renames, or reorders steps, adopt the corrected list and discard the original inferred list. No step-level drilling begins until Q3 is resolved. If no steps have been inferred yet because the narrative anchor has not been answered, acknowledge that and ask the narrative anchor question first before this step confirmation. STEP LIST FREEZE AFTER Q3: Once Q3 is resolved, the user-confirmed step list becomes the ONLY canonical step list. REPLACE the entire inferred step list with exactly what the user confirmed and discard all previously inferred steps; never add the confirmed steps on top of the inferred ones, because that produces 9 steps when the user only described 4. After Q3 the step count is FROZEN at whatever the user confirmed, and no new steps may be created during step-level drilling. If during drilling the user mentions something that sounds like a new step, capture it as a cell value on the current step (for example a sub-task inside the in-process data handling or notes cell), not as a new step. Only suggest adding a step if the user explicitly says something like 'actually there's another step I forgot.'",
    "Never ask about more than two things in a single question. The component overview should still cover the big phases, the main inputs and data types, the tools/systems and access/source mode, and the final outputs, but gather these through separate small questions of at most two related items each rather than one bundled list. The open narrative anchor question is the only question allowed to name more than two things.",
    "BANNED JARGON — NEVER SAY A-TO-Z: Never use the phrase 'A-to-Z', 'A to Z', or 'a-to-z' in any question, acknowledgement, or summary; it is confusing jargon. When you need the ordered process, ask in plain language, for example: 'Walk me through the steps in order — what happens first, and what's the final output?'",
    "WORKFLOW-LEVEL TOOL ANSWERS ARE CONTEXT ONLY: When the user answers a workflow-level tools question (for example 'I use SharePoint, Word, SAP, Hydra, Excel'), store it as overall workflow context only. Do NOT write that same value into every step's systemsTools cell — stamping one tool list across all steps is wrong. Tools belong at the step level: ask per step during drilling, using the workflow-level answer only as a hint, for example: 'You mentioned SharePoint and Hydra earlier — which of those do you actually use for this specific step?'",
    "HARD RULE — MAX 2 CELL TYPES PER STEP QUESTION: Every step-level question must ask about at most 2 grid cell types (concepts) at once. Never combine more than 2 cell concepts in a single question, and never use 'and' to join more than 2 topics. Prioritise by grid gaps: ask about the most empty cells first. If you need more information, ask a follow-up question next turn.",
    "CONFUSION HANDLING: If the user responds with a short confused answer — for example 'what do you mean', 'I don't understand', 'can you explain', 'huh', '?', or any reply under 5 words that contains no workflow-relevant content — do NOT capture it as intake data. Instead, recognise the confusion signal, rephrase the current question in simpler terms, and give a brief one-sentence example of what a good answer looks like.",
    "When enriching a step, use casual, consultant-style language — never read column header names verbatim and never make it feel like a form. Ask at most two cell types per question, prioritising the emptiest cells, and adapt these phrasings naturally: persona/actors → default to the person you're talking with as the primary actor and confirm or expand rather than asking who it could be, 'Is it mainly you handling this step, or are there other teams or systems involved?'; systems/tools → 'Any particular tools you use for this?'; output → 'What comes out of it — a doc, a decision, an email?'; trigger → 'What kicks this off — is it time-based, or does something land in your inbox?'; handoff → 'Where does this go next, and who picks it up?'; human checkpoint → 'Does anyone need to review or sign off here?'; time taken → 'Roughly how long does this step eat up?'; frequency/volume → 'How often does this run, and roughly what volume?'; pain/friction → 'What's the most annoying part of this bit?'; data sensitivity → 'Anything confidential flowing through here?'; rules/decision logic → 'Any rules about how the decision gets made — thresholds, approvals, that kind of thing?'. Never ask about AI pattern directly — infer it from context.",
    "When the user gives a loose statement, explain briefly what it maps to in the intake before asking the next question. Example: 'I am treating that as a process step, one data source, and a human review point.'",
    "Use the validation sequence: Idea, Validate, Workflow, Evidence, Value, AI Fit, Blueprint, Review.",
    "When the category is Pre-delivery / workshop prep, ask naturally about workshop type, ready-to-run output, participant profile, prep artifacts, reusable collateral, facilitation technique, human judgment, and whether the pattern is before client work or embedded in active delivery.",
    "Stay focused on intake: client delivery context, domain, where the work happens, project phase, deliverable type, triggers, process steps, data handling, systems/tools, human decisions, timing, pain points, exceptions, data sensitivity, risks, directional value hypothesis, and missing information. Do not press the user for staffing mix, margin, fixed-fee impact, cost rate, or pilot ownership unless they volunteer it.",
    "When useful, mention what would still be needed for Gate A: clear workflow, AI/tool fit, confidence, output definition, and directional value. Mention detailed business metrics and governance as supplement-later or post-build review input rather than heavily weighted live-interview blockers.",
    "Ask one crisp follow-up question when more information is needed.",
    "ADAPTIVE CHECK-INS: Do not use a fixed check-in cadence. Decide when to pause and which of four check-in types to use based on what is happening in the conversation. TYPE 1 SUMMARY — when 2 or more cells were just filled cleanly and the conversation is flowing well; brief, warm, confirmatory (e.g. 'So for Review file — that's you and the line manager in SharePoint, usually about a day. Have I got that right?'). TYPE 2 CONFIRMATION — when a value came back vague, contradictory, or partially answered; curious, non-pressuring (e.g. 'Just checking — the approval threshold, is that per project or a fixed amount?'). TYPE 3 GAP PROBE — when a step has low coverage and drilling has stalled or answers are short; gentle redirect (e.g. 'I don't have much yet on what triggers Approve file — what usually kicks that one off?'). TYPE 4 TRANSITION — when a step has reached sufficient coverage and it's time to move on; positive, forward-moving (e.g. 'Good — I think I've got what I need on that one. Let's move to File document.'). RULE: never use the same check-in type twice in a row; vary the pattern. Check-ins should feel like a natural moment of shared understanding, not a formal pause, and they are not questions.",
    "SESSION COMPLETENESS: The interview has a natural exit condition, not an open-ended drilling loop. A step is AI-READY when all of these are true: the aiPattern cell has a value (inferred or confirmed); at least 4 of trigger, personaActors, systemsTools, output, handoff have values; and step coverage is at least 50%. The SESSION is COMPLETE when at least 60% of steps are AI-ready. When that threshold is reached, stop drilling and signal readiness conversationally, worded like: 'I think I've got enough across most of these steps to start mapping out where AI could seriously help. There are still a few gaps we can fill in later — want to take a look at what I've put together?' Never announce a percentage or mention the threshold explicitly; just signal readiness and let the user decide whether to continue or move to outputs.",
    "If the user asks what a button or field means, explain it in plain language.",
    "Do not ask for raw client data. Ask for categories, examples, sensitivity, and handling rules instead. Treat uploaded files and screenshots as optional add-ons, not prerequisites.",
    "Do not claim you updated the structured intake unless the user clicks the website's AI Analyze Answer action."
  ];
  if (gridSummary && gridSummary.trim()) lines.push(documentExtractionPivotBlock(gridSummary));
  return lines.join(" ");
}

function realtimeInstructions(gridSummary = "") {
  const lines = [
    "# Role and Objective",
    "You are a voice-first discovery intake interviewer for repetitive-work AI automation opportunities.",
    "Your job is to collect current-state time-heavy engagement workflow information that can later become a product-style PDR, engineering handoff, Excel intake table, and process map.",
    "The workflow may be client delivery execution, pre-delivery/workshop prep, pursuit/revenue enablement, internal delivery enablement, post-delivery synthesis, or other. Do not force workshop prep or pursuit ideas into client delivery.",
    "Assume the available client tooling is Microsoft 365 Copilot and ChatGPT Enterprise unless the user says otherwise.",
    "If the session starts from a domain-submitted idea, preserve it as the original hypothesis and validate it against the current-state workflow before accepting the proposed AI assist.",
    "",
    "# Conversation Style",
    "Be warm, concise, helpful, and curious. Use a pleasant female-presenting voice style. Ask one question at a time, and never ask about more than two things in a single question (the only exception is the open narrative anchor question described under Intake Priorities). Keep spoken responses to 1-2 short sentences unless the user asks for more.",
    "HARD RULE — MAX 2 CELL TYPES PER STEP QUESTION: Every step-level question must ask about at most 2 grid cell types (concepts) at once. Never combine more than 2 cell concepts in a single question, and never use 'and' to join more than 2 topics. Prioritise by grid gaps: ask about the most empty cells first. If you need more information, ask a follow-up question next turn.",
    "CONFUSION HANDLING: If the user responds with a short confused answer — for example 'what do you mean', 'I don't understand', 'can you explain', 'huh', '?', or any reply under 5 words that contains no workflow-relevant content — do NOT capture it as intake data. Instead, recognise the confusion signal, rephrase the current question in simpler terms, and give a brief one-sentence example of what a good answer looks like.",
    "Do not narrate internal analysis, extraction, scoring, or field mapping. If you need time, pause briefly; the UI will show Thinking or Analyzing.",
    "After the user finishes an answer, give only a short acknowledgement of what was captured and ask the next most useful follow-up. Do not ask whether to proceed, and do not ask 'Is that correct?' unless you are explicitly playing back a whole process map for review.",
    "Do not design the future-state solution too early. If the user shares solution ideas, acknowledge them as ideas to park until the current-state process is clear.",
    "",
    "# Intake Priorities",
    "Follow this order: Idea, Validate, Workflow, Evidence, Value, AI Fit, Blueprint, Review.",
    "In Idea and Validate, start with the work itself: what task or workflow the user wants to discuss, what happens, what output it creates, and what outcome it supports. For workshop prep, collect workshop type, ready-to-run output, participants, prep artifacts, reusable collateral, facilitation technique, and human judgment areas.",
    "Also listen for lifecycle metadata without making it feel like a form: practice/domain, where the work happens today, unit of analysis, automation potential, quality benefit, data boundary, and likely post-build governance path. Commercial context, KPI type, staffing mix, and project economics can be supplemented later.",
    "Use a broad-to-specific discovery style. After the starting topic, establish the workflow name. As soon as it is named, and before the narrative anchor, ask exactly this documents-first question, worded verbatim: 'Do you have any documents, screenshots, SOPs, or notes about this workflow you'd like to share? If so, use the Add Attachment button below — otherwise just say no and we'll get started.' Ask it once; if the user says no, declines, starts describing the workflow, or attaches a file via the Add Attachment button, proceed to the narrative anchor and do not repeat it, and never infer pain or step detail from an attached file. After that documents-first question, ask exactly one open narrative anchor question, worded verbatim: 'Walk me through this workflow from beginning to end — what triggers it, what happens at each stage, and what does it produce?' Ask it as the second or third question and let the answer route what follows; this open narrative question is the only one allowed to name more than two things. Immediately after the narrative anchor answer, ask Q2, exactly one mandatory open question about pain and friction ONLY, worded verbatim: 'What's the most annoying or slow part of this for you or your team?' Q2 is mandatory and must fire after Q1 and before Q3; do not proceed to Q3 or step-level drilling until Q2 has been asked and the user has responded, including 'I don't know' or 'skip'. Q2 covers pain/friction ONLY — do not mention governance, rules, approvals, thresholds, or compliance here; those are captured at the step level later. Pain/friction can never come from a document upload and must come from the user's own words, so ask the person rather than inferring it. ENFORCEMENT — Q2 IS IMMEDIATE: Q2 is the immediate next question after Q1; no workflow-level question (tools, systems, inputs, outputs, volume, or anything else), no step-level question, and not Q3 may appear between Q1 and Q2. If you ever find yourself about to ask about tools, systems, steps, or anything other than pain while Q2 has not yet been asked and answered, STOP and ask Q2 first. Only after Q2 has been answered, and before drilling into any step-level detail, ask Q3, a distinct, explicit step-confirmation question, worded verbatim apart from the bracketed list: 'Based on what you've described, I'm seeing: [list the steps you inferred from the Q1 answer, numbered, with casual names]. Does that look right — anything missing, combined, or named differently?' Build the actual step list dynamically from what the user said rather than speaking the literal bracketed placeholder, and never add steps silently without asking Q3 first. Wait for the user to confirm or correct before drilling; if they correct, merge, rename, or reorder steps, adopt the corrected list and discard the original inferred list. No step-level drilling begins until Q3 is resolved. If no steps have been inferred yet because the narrative anchor has not been answered, acknowledge that and ask the narrative anchor question first before this step confirmation. STEP LIST FREEZE AFTER Q3: once Q3 is resolved, the user-confirmed step list becomes the ONLY canonical step list — REPLACE the entire inferred list with exactly what the user confirmed and discard all previously inferred steps; never add the confirmed steps on top of the inferred ones, because that produces 9 steps when the user only described 4. After Q3 the step count is FROZEN at whatever the user confirmed and no new steps may be created during step-level drilling; if the user mentions something that sounds like a new step during drilling, capture it as a cell value on the current step (for example a sub-task in the in-process data handling or notes cell), not as a new step, and only suggest adding a step if the user explicitly says something like 'actually there's another step I forgot.' Then build the component overview through separate small questions of at most two items each — the big phases in rough order from start to finish, then the main inputs and data types, then the tools/systems and access/source mode, then the final outputs — rather than one bundled list. Ask for the overall workflow as a rough numbered step-by-step process if the steps are still unclear. BANNED JARGON — never say 'A-to-Z', 'A to Z', or 'a-to-z' in any question, acknowledgement, or summary; it is confusing jargon, so when you need the ordered process ask in plain language, for example: 'Walk me through the steps in order — what happens first, and what's the final output?' WORKFLOW-LEVEL TOOL ANSWERS ARE CONTEXT ONLY: when the user answers a workflow-level tools question (for example 'I use SharePoint, Word, SAP, Hydra, Excel'), store it as overall workflow context only and do NOT write that same value into every step's systems/tools cell; tools belong at the step level, so ask per step during drilling using the workflow-level answer only as a hint, for example: 'You mentioned SharePoint and Hydra earlier — which of those do you actually use for this specific step?' Treat phrases like Step 1, Step one, first step, second step, and numbered list markers as process-step anchors. Once a rough skeleton exists, do not ask permission to move on. Treat it as a working skeleton, tell the user they can correct the steps anytime, and automatically start walking Step 1 or the first incomplete step.",
    "When walking a step, use casual, consultant-style language — never read column header names verbatim and never make it feel like a form. Ask at most two cell types per question, prioritising the emptiest cells, and adapt these phrasings naturally to the conversation: for persona/actors, default to the person you're talking with as the primary actor and confirm or expand rather than asking who it could be, 'Is it mainly you handling this step, or are there other teams or systems involved?'; for systems/tools, 'Any particular tools you use for this?'; for output, 'What comes out of it — a doc, a decision, an email?'; for trigger, 'What kicks this off — is it time-based, or does something land in your inbox?'; for handoff, 'Where does this go next, and who picks it up?'; for human checkpoint, 'Does anyone need to review or sign off here?'; for time taken, 'Roughly how long does this step eat up?'; for frequency/volume, 'How often does this run, and roughly what volume?'; for pain/friction, 'What's the most annoying part of this bit?'; for data sensitivity, 'Anything confidential flowing through here?'; for rules/decision logic, 'Any rules about how the decision gets made — thresholds, approvals, that kind of thing?'. Never ask about AI pattern directly — infer it from context.",
    "When users answer naturally instead of filling a form, acknowledge the captured detail briefly and ask the next question. Keep category mapping and missing-detail logic in the UI rather than saying every internal step.",
    "Collect workflow name, practice/domain, where the work happens today, client project phase when known, deliverable type, output consumer, business outcome, trigger, start point, end point, process steps from start to finish, data categories, data handling actions, tools and systems, human decisions, timing, pain points, exceptions, risks, directional value hypothesis, and open questions.",
    "Do not lead with AI patterns. AI pattern mapping happens after the intake is complete.",
    "Avoid asking for raw client data. Ask for data categories, sensitivity, processing actions, and whether raw data can be avoided or anonymized.",
    "",
    "# Reasoning",
    "Use low-latency reasoning. Think before asking follow-up questions when the user gives a dense answer, but do not narrate private reasoning.",
    "Avoid filler preambles such as 'I am analyzing' or 'I am mapping this.' The app status indicator handles that silently.",
    "",
    "# Confirmation Boundaries",
    "ADAPTIVE CHECK-INS: Do not use a fixed check-in cadence. Decide when to pause and which of four check-in types to use based on what is happening in the conversation. TYPE 1 SUMMARY — when 2 or more cells were just filled cleanly and the conversation is flowing well; brief, warm, confirmatory (e.g. 'So for Review file — that's you and the line manager in SharePoint, usually about a day. Have I got that right?'). TYPE 2 CONFIRMATION — when a value came back vague, contradictory, or partially answered; curious, non-pressuring (e.g. 'Just checking — the approval threshold, is that per project or a fixed amount?'). TYPE 3 GAP PROBE — when a step has low coverage and drilling has stalled or answers are short; gentle redirect (e.g. 'I don't have much yet on what triggers Approve file — what usually kicks that one off?'). TYPE 4 TRANSITION — when a step has reached sufficient coverage and it's time to move on; positive, forward-moving (e.g. 'Good — I think I've got what I need on that one. Let's move to File document.'). RULE: never use the same check-in type twice in a row; vary the pattern, because predictable check-ins lose their value. Check-ins should feel like a natural moment of shared understanding, not a formal pause, and they are not questions. If screenshots or files are available, mention they can optionally improve confidence, but do not make them feel required.",
    "SESSION COMPLETENESS: The interview has a natural exit condition, not an open-ended drilling loop. A step is AI-READY when all of these are true: the aiPattern cell has a value (inferred or confirmed); at least 4 of trigger, personaActors, systemsTools, output, handoff have values; and step coverage is at least 50%. The SESSION is COMPLETE when at least 60% of steps are AI-ready. When that threshold is reached, stop drilling and signal readiness conversationally, worded like: 'I think I've got enough across most of these steps to start mapping out where AI could seriously help. There are still a few gaps we can fill in later — want to take a look at what I've put together?' Never announce a percentage or mention the threshold explicitly; just signal readiness and let the user decide whether to continue or move to outputs.",
    "Before claiming the intake is complete, ask whether any steps, data handoffs, approvals, or systems are missing.",
    "",
    "# Output Awareness",
    "The website has separate buttons for structured extraction and Excel export. Your voice role is to help the user produce clear answers that those tools can capture for Product and Engineering."
  ];
  if (gridSummary && gridSummary.trim()) lines.push(documentExtractionPivotBlock(gridSummary));
  return lines.join("\n");
}

function pruneState(state = {}) {
  return {
    activeSection: state.activeSection,
    fields: state.fields,
    steps: state.steps,
    data: state.data,
    systems: state.systems,
    decisions: state.decisions,
    ideas: state.ideas,
    evidenceArtifacts: (state.evidenceArtifacts || []).map((artifact) => ({
      fileName: artifact.fileName,
      sourceKind: artifact.sourceKind,
      status: artifact.status,
      summary: artifact.summary,
      confidence: artifact.confidence,
      applied: artifact.applied
    }))
  };
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(__dirname, safePath));

  if (!filePath.startsWith(__dirname)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        error.status = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function readText(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function readBuffer(req, maxBytes = 30_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const error = new Error("Request body too large");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function audioExtensionForContentType(contentType = "") {
  const normalized = String(contentType).toLowerCase();
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

function decodeHeaderValue(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function transcriptionPrompt({ currentQuestion = "", domainTerms = "" } = {}) {
  return [
    "Transcribe a workflow discovery interview for a finance-industry consulting AI intake app.",
    "Preserve concrete nouns, acronyms, tool names, and numbered steps. Use punctuation and sentence breaks.",
    "Common terms include Capco, PDR, MSA, FRRF, SharePoint, Teams, Outlook, PowerPoint, Word, Excel, Miro, Mural, Jira, Confluence, ChatGPT Enterprise, Microsoft 365 Copilot, Copilot Studio, SME, PMO, UAT, QA, and engagement lead.",
    domainTerms ? `Session terms: ${domainTerms}.` : "",
    currentQuestion ? `The user is answering this question: ${currentQuestion}` : ""
  ].filter(Boolean).join(" ");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

// === Phase 5a: Azure AD auth gate (scaffolding) =============================
// All routes are public until AUTH_ENABLED=true. Sessions are stateless: a
// signed (HMAC-SHA256) httpOnly cookie carrying { sub, email, name, exp }.

// Paths reachable without a session (the login page is self-contained, so only
// /login.html itself needs to pass — no app.js/CSS exceptions).
const AUTH_PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/me",
  "/login.html",
  "/favicon.ico",
  "/auth/login",
  "/auth/microsoft/callback",
  "/auth/logout",
  "/api/connectors/jira/callback"
]);
function isPublicPath(pathname) {
  return AUTH_PUBLIC_PATHS.has(pathname);
}

function sendRedirect(res, location, status = 302) {
  res.writeHead(status, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

function authHmac(value) {
  return crypto.createHmac("sha256", AUTH_SESSION_SECRET).update(value).digest("base64url");
}

// payload.signature; payload is base64url(JSON). Returns "" when unsigned/secret missing.
function signValue(obj) {
  if (!AUTH_SESSION_SECRET) return "";
  const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${payload}.${authHmac(payload)}`;
}

// Verify HMAC (constant-time) + exp; returns the parsed object or null.
function verifySignedValue(token) {
  if (!AUTH_SESSION_SECRET || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = authHmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let obj;
  try {
    obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (obj && typeof obj.exp === "number" && Date.now() > obj.exp) return null;
  return obj;
}

function setSessionCookie(res, claims) {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${signValue(claims)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${AUTH_SESSION_TTL_HOURS * 3600}`
  ];
  if (AUTH_COOKIE_SECURE) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  const attrs = [`${AUTH_COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (AUTH_COOKIE_SECURE) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function readSession(req) {
  if (!AUTH_SESSION_SECRET) return null;
  const token = parseCookies(req)[AUTH_COOKIE_NAME];
  return token ? verifySignedValue(token) : null;
}

// Phase 5c: the stable per-user scoping key (Azure oid). null when the gate is
// off or there's no valid session — in which case session handlers behave
// exactly as before (no filtering, no stamping).
function currentUserId(req) {
  return readSession(req)?.sub || null;
}

// === Phase 5e: append-only audit trail ======================================
// Hash inputs/outputs rather than storing raw content (privacy; ROSETTA L39).
function auditHash(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

// Fire-and-forget audit logger. No-op when there's no authenticated user
// (AUTH_ENABLED=false / no session), so un-gated dev and CI are unaffected.
// Never throws and never blocks the caller — failures are swallowed.
function appendAudit(req, action, { sessionId = "", detail = "", content } = {}) {
  const session = readSession(req);
  if (!session?.sub) return;
  const record = {
    ts: new Date().toISOString(),
    userId: session.sub,
    email: session.email || "",
    tid: session.tid || "",
    action,
    sessionId,
    detail,
    contentHash: content === undefined ? "" : auditHash(content)
  };
  const file = path.join(AUDIT_DIR, `audit-${record.ts.slice(0, 10)}.jsonl`);
  fs.mkdir(AUDIT_DIR, { recursive: true })
    .then(() => fs.appendFile(file, `${JSON.stringify(record)}\n`))
    .catch((error) => console.warn("Audit write failed:", error.message));
}

// GET /api/audit — same-user filtered; AUTH_ADMIN_SUBS members see everything.
async function handleGetAudit(req, res) {
  const userId = currentUserId(req);
  if (!userId) return sendJson(res, 401, { error: "auth_required" });
  const isAdmin = AUTH_ADMIN_SUBS.has(userId);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 5000);

  const entries = [];
  const files = (await fs.readdir(AUDIT_DIR).catch(() => []))
    .filter((name) => name.startsWith("audit-") && name.endsWith(".jsonl"));
  for (const name of files) {
    const text = await fs.readFile(path.join(AUDIT_DIR, name), "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (isAdmin || record.userId === userId) entries.push(record);
      } catch {
        // skip malformed lines
      }
    }
  }
  entries.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return sendJson(res, 200, { entries: entries.slice(0, limit), admin: isAdmin });
}
// === end Phase 5e audit trail ===============================================

// === Phase 6a: Jira connector (Atlassian Cloud OAuth2 3LO) ==================
// Minimal HTTPS client (Node built-ins only). Resolves { status, body }; body
// is parsed JSON when possible, otherwise the raw string.
async function httpsRequest(method, url, headers, body) {
  const u = new URL(url);
  const mod = await import(u.protocol === "https:" ? "node:https" : "node:http");
  return new Promise((resolve, reject) => {
    const opts = { hostname: u.hostname, path: u.pathname + u.search, method, headers };
    const req = mod.default.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function jiraTokenPath(userId) {
  return path.join(CONNECTIONS_DIR, `${userId || "anon"}-jira.json`);
}

async function readJiraToken(userId) {
  try { return JSON.parse(await fs.readFile(jiraTokenPath(userId), "utf8")); }
  catch { return null; }
}

async function writeJiraToken(userId, data) {
  await fs.mkdir(CONNECTIONS_DIR, { recursive: true });
  await fs.writeFile(jiraTokenPath(userId), JSON.stringify(data, null, 2));
}

async function handleJiraAuth(req, res) {
  if (!JIRA_CLIENT_ID) return sendJson(res, 503, { error: "Jira not configured on this server" });
  const state = crypto.randomBytes(16).toString("hex");
  jiraOAuthStates.set(state, { userId: currentUserId(req), exp: Date.now() + 600_000 });
  const url = "https://auth.atlassian.com/authorize"
    + "?audience=api.atlassian.com"
    + `&client_id=${JIRA_CLIENT_ID}`
    + "&scope=read%3Ajira-work%20write%3Ajira-work%20read%3Ajira-user%20offline_access"
    + `&redirect_uri=${encodeURIComponent(JIRA_REDIRECT_URI)}`
    + `&state=${state}`
    + "&response_type=code"
    + "&prompt=consent";
  res.writeHead(302, { Location: url });
  res.end();
}

async function handleJiraCallback(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  console.log('[jira-callback] hit — code:', !!code, 'state:', !!state, 'error:', error);
  console.log('[jira-callback] JIRA_CLIENT_ID present:', !!JIRA_CLIENT_ID, 'JIRA_CLIENT_SECRET present:', !!JIRA_CLIENT_SECRET);
  try {
    if (error) { res.writeHead(302, { Location: "/?jira=error#engineering-doc" }); res.end(); return; }
    const entry = jiraOAuthStates.get(state);
    if (!entry || entry.exp < Date.now()) return sendJson(res, 400, { error: "Invalid or expired state" });
    const userId = entry.userId;
    jiraOAuthStates.delete(state);

    const tokenResp = await httpsRequest("POST", "https://auth.atlassian.com/oauth/token",
      { "Content-Type": "application/json" },
      { grant_type: "authorization_code", client_id: JIRA_CLIENT_ID, client_secret: JIRA_CLIENT_SECRET, code, redirect_uri: JIRA_REDIRECT_URI });
    if (tokenResp.status !== 200) { res.writeHead(302, { Location: "/?jira=error#engineering-doc" }); res.end(); return; }
    const { access_token, refresh_token, expires_in } = tokenResp.body;

    const resourcesResp = await httpsRequest("GET", "https://api.atlassian.com/oauth/token/accessible-resources",
      { Authorization: `Bearer ${access_token}`, Accept: "application/json" });
    const resources = resourcesResp.body;
    if (!Array.isArray(resources) || !resources.length) { res.writeHead(302, { Location: "/?jira=error#engineering-doc" }); res.end(); return; }
    const cloudId = resources[0].id;
    const cloudName = resources[0].name;

    await writeJiraToken(userId, { access_token, refresh_token, expires_in, cloudId, cloudName, connectedAt: new Date().toISOString() });
    res.writeHead(302, { Location: "/?jira=connected#engineering-doc" });
    res.end();
  } catch (error) {
    console.error('[jira-callback] ERROR:', error?.message || error);
    res.writeHead(302, { Location: "/?jira=error#engineering-doc" });
    res.end();
  }
}

async function handleJiraStatus(req, res) {
  const token = await readJiraToken(currentUserId(req));
  if (!token) return sendJson(res, 200, { connected: false });
  return sendJson(res, 200, { connected: true, cloudName: token.cloudName, connectedAt: token.connectedAt });
}

async function handleJiraProjects(req, res) {
  const token = await readJiraToken(currentUserId(req));
  if (!token) return sendJson(res, 401, { error: "Not connected to Jira" });
  const resp = await httpsRequest("GET",
    `https://api.atlassian.com/ex/jira/${token.cloudId}/rest/api/3/project/search?maxResults=50`,
    { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" });
  const values = (resp.body && resp.body.values) || [];
  return sendJson(res, 200, { projects: values.map((p) => ({ id: p.id, key: p.key, name: p.name })) });
}

async function handleJiraPush(req, res) {
  const token = await readJiraToken(currentUserId(req));
  if (!token) return sendJson(res, 401, { error: "Not connected to Jira" });
  const body = await readJson(req);
  const { projectKey, step } = body;
  if (!projectKey) return sendJson(res, 400, { error: "projectKey required" });
  const safeStep = step || {};
  const priority = safeStep.tier === "quick-win" ? "High" : safeStep.tier === "compliance" ? "Highest" : "Medium";
  const labels = String(safeStep.systemsTools || "").split(",").map((s) => s.trim().replace(/\s+/g, "_")).filter(Boolean).slice(0, 10);
  const description = {
    version: 1,
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: safeStep.description || "" }] },
      { type: "paragraph", content: [{ type: "text", text: `AI Pattern: ${safeStep.aiPattern || "—"}`, marks: [{ type: "strong" }] }] }
    ]
  };
  const resp = await httpsRequest("POST",
    `https://api.atlassian.com/ex/jira/${token.cloudId}/rest/api/3/issue`,
    { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", Accept: "application/json" },
    {
      fields: {
        project: { key: projectKey },
        summary: String(safeStep.name || "Untitled step").slice(0, 255),
        description,
        issuetype: { name: "Story" },
        priority: { name: priority },
        labels
      }
    });
  if (resp.status === 401) return sendJson(res, 401, { error: "Jira token expired — reconnect" });
  if (resp.status !== 201) return sendJson(res, 502, { error: "Jira rejected the issue", detail: resp.body });
  const issueKey = resp.body.key;
  return sendJson(res, 200, { issueKey, issueUrl: `https://${token.cloudName}.atlassian.net/browse/${issueKey}` });
}

async function handleJiraDisconnect(req, res) {
  try { await fs.unlink(jiraTokenPath(currentUserId(req))); } catch { /* already gone */ }
  return sendJson(res, 200, { ok: true });
}
// === end Phase 6a Jira connector ============================================

function azureBaseUrl() {
  return `https://login.microsoftonline.com/${encodeURIComponent(AUTH_AZURE_TENANT_ID)}/oauth2/v2.0`;
}

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: AUTH_AZURE_CLIENT_ID,
    response_type: "code",
    redirect_uri: AUTH_REDIRECT_URI,
    response_mode: "query",
    scope: "openid profile email",
    state
  });
  return `${azureBaseUrl()}/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: AUTH_AZURE_CLIENT_ID,
    client_secret: AUTH_AZURE_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: AUTH_REDIRECT_URI,
    scope: "openid profile email"
  });
  const resp = await fetch(`${azureBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.id_token) {
    throw new Error(data.error_description || `Token exchange failed (${resp.status})`);
  }
  return data.id_token;
}

// 5b: verify the id_token's RS256 signature against Azure's published JWKS and
// validate issuer / audience / tenant / expiry. Zero deps — Node crypto builds
// the public key straight from the JWK. Keys are cached and refetched on a kid
// miss (Azure rotates signing keys).
let azureJwksCache = { keys: [], fetchedAt: 0 };
const AZURE_JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchAzureJwks(force = false) {
  const fresh = Date.now() - azureJwksCache.fetchedAt < AZURE_JWKS_TTL_MS;
  if (!force && fresh && azureJwksCache.keys.length) return azureJwksCache.keys;
  const resp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(AUTH_AZURE_TENANT_ID)}/discovery/v2.0/keys`);
  if (!resp.ok) throw new Error(`JWKS fetch failed (${resp.status})`);
  const data = await resp.json().catch(() => ({}));
  azureJwksCache = { keys: Array.isArray(data.keys) ? data.keys : [], fetchedAt: Date.now() };
  return azureJwksCache.keys;
}

async function getAzureSigningKey(kid) {
  let jwk = (await fetchAzureJwks(false)).find((k) => k.kid === kid);
  if (!jwk) jwk = (await fetchAzureJwks(true)).find((k) => k.kid === kid); // refetch on rotation
  if (!jwk) throw new Error("No matching JWKS key for token kid");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

async function verifyIdToken(idToken) {
  const parts = String(idToken).split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  if (header.alg !== "RS256") throw new Error(`Unexpected id_token alg: ${header.alg}`);
  const pubKey = await getAzureSigningKey(header.kid);
  const verified = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    pubKey,
    Buffer.from(sigB64, "base64url")
  );
  if (!verified) throw new Error("id_token signature verification failed");

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== `https://login.microsoftonline.com/${AUTH_AZURE_TENANT_ID}/v2.0`) throw new Error("id_token issuer mismatch");
  if (claims.aud !== AUTH_AZURE_CLIENT_ID) throw new Error("id_token audience mismatch");
  if (claims.tid && claims.tid !== AUTH_AZURE_TENANT_ID) throw new Error("id_token tenant mismatch");
  if (typeof claims.exp === "number" && now >= claims.exp) throw new Error("id_token expired");
  if (typeof claims.nbf === "number" && now < claims.nbf - 60) throw new Error("id_token not yet valid");
  return claims;
}

function authConfigReady() {
  return Boolean(AUTH_AZURE_TENANT_ID && AUTH_AZURE_CLIENT_ID && AUTH_AZURE_CLIENT_SECRET && AUTH_SESSION_SECRET);
}

async function handleAuthLogin(req, res) {
  if (!AUTH_ENABLED) return sendJson(res, 404, { error: "Auth disabled" });
  if (!authConfigReady()) return sendRedirect(res, "/login.html?error=config");
  const state = signValue({ n: crypto.randomBytes(12).toString("base64url"), exp: Date.now() + 10 * 60 * 1000 });
  return sendRedirect(res, buildAuthorizeUrl(state));
}

async function handleAuthCallback(req, res) {
  if (!AUTH_ENABLED) return sendJson(res, 404, { error: "Auth disabled" });
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !verifySignedValue(state)) return sendRedirect(res, "/login.html?error=1");
  try {
    // verifyIdToken checks the RS256 signature + issuer/audience/tenant/expiry.
    const claims = await verifyIdToken(await exchangeCodeForToken(code));
    setSessionCookie(res, {
      sub: claims.oid || claims.sub || "",
      email: claims.email || claims.preferred_username || "",
      name: claims.name || "",
      // Captured for future use (e.g. multi-tenancy); not used for isolation yet.
      tid: claims.tid || "",
      preferred_username: claims.preferred_username || "",
      exp: Date.now() + AUTH_SESSION_TTL_HOURS * 3600 * 1000
    });
    return sendRedirect(res, "/");
  } catch (error) {
    console.error("Auth callback failed:", error.message);
    return sendRedirect(res, "/login.html?error=1");
  }
}

async function handleAuthLogout(req, res) {
  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
}

async function handleMe(req, res) {
  const session = readSession(req);
  return sendJson(res, 200, {
    authEnabled: AUTH_ENABLED,
    user: session ? { name: session.name, email: session.email } : null
  });
}
// === end Phase 5a auth scaffolding =========================================

async function handleRecipeBookExport(req, res) {
  try {
    // Loaded lazily so a missing/broken `docx` install can never crash server
    // startup or take down unrelated endpoints (e.g. /api/extract). Only this
    // endpoint depends on it, and it fails gracefully below if it is absent.
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

    const body = await readJson(req);
    const { workflowName = "Workflow", steps = [] } = body;
    appendAudit(req, "export_generated", { detail: "recipe-book-docx", content: { workflowName, steps } });
    const safeName = String(workflowName).replace(/[^a-z0-9]/gi, "-").replace(/-{2,}/g, "-").replace(/^-|-$/, "");
    const children = [];

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 720, after: 360 },
        children: [new TextRun({ text: `${workflowName} — Recipe Book`, bold: true, size: 48, font: "Arial" })]
      }),
      new Paragraph({ children: [new TextRun("")] })
    );

    for (const step of steps) {
      const name = String(step.name || "Unnamed Step");
      const aiPattern = String(step.aiPattern || "—");
      const prompt = String(step.prompt || "");
      const personaActors = String(step.personaActors || "—");
      const systemsTools = String(step.systemsTools || "—");

      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 120 },
        children: [new TextRun({ text: name, font: "Arial", bold: true, size: 32 })]
      }));
      children.push(new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({ text: "AI Pattern:  ", bold: true, size: 24, font: "Arial" }),
          new TextRun({ text: aiPattern, size: 24, font: "Arial" })
        ]
      }));
      for (const line of prompt.split("\n")) {
        children.push(new Paragraph({
          spacing: { before: 60, after: 60 },
          children: [new TextRun({ text: line, size: 22, font: "Arial" })]
        }));
      }
      children.push(new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          new TextRun({ text: "Persona / Actors:  ", bold: true, size: 20, font: "Arial" }),
          new TextRun({ text: personaActors, size: 20, font: "Arial" })
        ]
      }));
      children.push(new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text: "Systems / Tools:  ", bold: true, size: 20, font: "Arial" }),
          new TextRun({ text: systemsTools, size: 20, font: "Arial" })
        ]
      }));
      children.push(new Paragraph({ children: [new TextRun("")] }));
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 24 } } },
        paragraphStyles: [{
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 32, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 480, after: 120 }, outlineLevel: 0 }
        }]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}-recipe-book.docx"`,
      "Content-Length": buffer.length
    });
    res.end(buffer);
  } catch (err) {
    console.error("[recipe-book-export] error:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

async function handleEngineeringDocExport(req, res) {
  try {
    // Loaded lazily so a missing/broken `docx` install can never crash server
    // startup or take down unrelated endpoints (e.g. /api/extract). Only this
    // endpoint depends on it, and it fails gracefully below if it is absent.
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

    const body = await readJson(req);
    const { workflowName = "Workflow", steps = [] } = body;
    appendAudit(req, "export_generated", { detail: "engineering-doc-docx", content: { workflowName, steps } });
    const safeName = String(workflowName).replace(/[^a-z0-9]/gi, "-").replace(/-{2,}/g, "-").replace(/^-|-$/, "");
    const children = [];

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 720, after: 360 },
        children: [new TextRun({ text: `${workflowName} — Engineering Doc`, bold: true, size: 48, font: "Arial" })]
      }),
      new Paragraph({ children: [new TextRun("")] })
    );

    // Engineering-relevant cell values, in the order they appear per step.
    const fields = [
      ["Systems / Tools", "systemsTools"],
      ["Data Processing", "dataProcessing"],
      ["Rules / Decision Logic", "rulesDecisionLogic"],
      ["Exception Branching", "exceptionBranching"],
      ["Regulatory / Compliance Context", "regulatoryContext"],
      ["Human Checkpoint", "humanCheckpoint"]
    ];

    for (const step of steps) {
      const name = String(step.name || "Unnamed Step");

      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 120 },
        children: [new TextRun({ text: name, font: "Arial", bold: true, size: 32 })]
      }));
      for (const [label, key] of fields) {
        const value = String(step[key] || "—");
        children.push(new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({ text: `${label}:  `, bold: true, size: 22, font: "Arial" }),
            new TextRun({ text: value, size: 22, font: "Arial" })
          ]
        }));
      }
      children.push(new Paragraph({ children: [new TextRun("")] }));
    }

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 24 } } },
        paragraphStyles: [{
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 32, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 480, after: 120 }, outlineLevel: 0 }
        }]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.writeHead(200, {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}-engineering-doc.docx"`,
      "Content-Length": buffer.length
    });
    res.end(buffer);
  } catch (err) {
    console.error("[engineering-doc-export] error:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

// Pattern Handoff tab. Two modes, both Anthropic-backed:
//  - "questions": surface 3-7 operational questions pinned to specific steps.
//  - "analyse":   assign a best-fit AI pattern + rationale to each step.
// No external dependencies are required (uses the global fetch plus the shared
// readJson/sendJson helpers), so there is nothing to lazy-load here.
async function handlePatternHandoff(req, res) {
  if (!ANTHROPIC_API_KEY) {
    return sendJson(res, 400, {
      error: "ANTHROPIC_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Invalid request body" });
  }

  appendAudit(req, "ai_analysis_run", { detail: "pattern-handoff", content: body });
  const mode = body.mode === "analyse" ? "analyse" : body.mode === "questions" ? "questions" : "";
  if (!mode) {
    return sendJson(res, 400, { error: 'mode must be "questions" or "analyse".' });
  }
  const workflowName = typeof body.workflowName === "string" && body.workflowName.trim() ? body.workflowName.trim() : "Workflow";
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (!steps.length) {
    return sendJson(res, 400, { error: "At least one workflow step is required." });
  }
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};

  // Cell reader tolerant of the live-grid shape ({cells:{key:{value}}}) and of
  // already-flattened step objects ({key: value}).
  const cell = (step, key) => {
    const raw = step?.cells?.[key]?.value ?? step?.[key] ?? "";
    return typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw.map((e) => e?.pattern || "").filter(Boolean).join(", ") : "";
  };
  const stepName = (step, index) => cell(step, "name") || step?.name || `Step ${index + 1}`;

  const personaSet = new Set(
    steps.map((step) => cell(step, "personaActors").toLowerCase()).filter(Boolean)
  );
  const singlePersona = personaSet.size <= 1;

  const stepLines = steps.map((step, index) => {
    const id = step?.id || `step-${index + 1}`;
    return [
      `Step ${index + 1} (stepId: ${id}; stepName: ${stepName(step, index)})`,
      `  Persona/Actors: ${cell(step, "personaActors") || "(none)"}`,
      `  Systems/Tools: ${cell(step, "systemsTools") || "(none)"}`,
      `  Data processing: ${cell(step, "dataProcessing") || "(none)"}`,
      `  Rules/Decision logic: ${cell(step, "rulesDecisionLogic") || "(none)"}`,
      `  Output: ${cell(step, "output") || "(none)"}`,
      `  Current AI pattern: ${cell(step, "aiPattern") || "(unset)"}`
    ].join("\n");
  }).join("\n\n");

  let system;
  let userContent;
  if (mode === "questions") {
    const skew = singlePersona
      ? "This is a SINGLE-persona workflow: skew questions toward Retrieve, Generate, and Summarise opportunities."
      : "This is a MULTI-persona workflow: skew questions toward Match, Route, and Classify opportunities.";
    system = [
      "You help a discovery analyst prepare a workflow for AI-pattern handoff.",
      "Generate between 3 and 7 targeted questions, each pinned to a specific step, that would clarify where AI could help.",
      "Write every question in plain operational language about the actual work — never use AI/ML taxonomy words (do not say 'classify', 'retrieve', 'route', 'pattern', 'model', etc.).",
      skew,
      'Return ONLY valid JSON, no prose, no code fences, in exactly this shape: {"questions":[{"id":"q1","stepId":"<stepId>","stepName":"<stepName>","text":"<question>"}]}'
    ].join(" ");
    userContent = `Workflow: ${workflowName}\nDistinct personas: ${personaSet.size}\n\nSteps:\n${stepLines}`;
  } else {
    const answerLines = Object.entries(answers)
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => `- ${k}: ${String(v).trim()}`)
      .join("\n") || "(no answers provided)";
    system = [
      "You assign the single best-fit AI pattern to each workflow step.",
      "Choose the pattern strictly from this list: Retrieve, Extract, Generate, Summarise, Search, Match, Route, Optimise, Classify.",
      "Give a one-line rationale in plain English (no jargon) and a confidence between 0 and 1.",
      'Return ONLY valid JSON, no prose, no code fences, in exactly this shape: {"patterns":[{"stepId":"<stepId>","stepName":"<stepName>","pattern":"<one of the allowed patterns>","rationale":"<one line>","confidence":0.0}]}'
    ].join(" ");
    userContent = `Workflow: ${workflowName}\n\nSteps:\n${stepLines}\n\nAnalyst answers:\n${answerLines}`;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: PATTERN_HANDOFF_MODEL,
        max_tokens: 1000,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || "Anthropic API request failed",
        detail: data
      });
    }
    const text = (data?.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const parsed = parseModelJson(text);
    if (!parsed) {
      return sendJson(res, 502, { error: "The model did not return valid JSON.", raw: text.slice(0, 500) });
    }
    if (mode === "questions") {
      const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      return sendJson(res, 200, { questions });
    }
    const patterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
    return sendJson(res, 200, { patterns });
  } catch (error) {
    console.error("[pattern-handoff] error:", error);
    return sendJson(res, 500, { error: error.message || "Pattern handoff request failed" });
  }
}

// Best-effort parse of model output: strip code fences, then fall back to the
// first balanced {...} object in the text.
function parseModelJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

// Build a PDF programmatically from the same { workflowName, steps } payload the
// DOCX handlers use — no browser/Chromium. pdfkit is pure JS and uses built-in
// Helvetica fonts (no font files). Loaded lazily on first request.
//   kind "recipe":      title + per step: name, AI Pattern, prompt body.
//   kind "engineering": title + per step: name + the six engineering fields.
async function handlePdfExport(req, res) {
  try {
    const body = await readJson(req);
    const kind = body.kind === "engineering" ? "engineering" : "recipe";
    appendAudit(req, "export_generated", { detail: `pdf-${kind}`, content: body });
    const workflowName = typeof body.workflowName === "string" && body.workflowName.trim() ? body.workflowName.trim() : "Workflow";
    const steps = Array.isArray(body.steps) ? body.steps : [];
    const safeName = String(workflowName).replace(/[^a-z0-9]/gi, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || "workflow";
    const docTitle = `${workflowName} — ${kind === "engineering" ? "Engineering Doc" : "Recipe Book"}`;

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: { Title: docTitle }
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    doc.font("Helvetica-Bold").fontSize(22).fillColor("#0d1b2e").text(docTitle, { align: "center" });
    doc.moveDown(1.2);

    const labelLine = (label, value) => {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(`${label}:  `, { continued: true })
        .font("Helvetica").fillColor("#1a2330").text(String(value || "—"));
    };

    if (kind === "recipe") {
      for (const step of steps) {
        doc.font("Helvetica-Bold").fontSize(15).fillColor("#0d1b2e").text(String(step.name || "Unnamed Step"));
        doc.moveDown(0.3);
        labelLine("AI Pattern", step.aiPattern);
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(11).fillColor("#1a2330").text(String(step.prompt || "No prompt generated yet."));
        doc.moveDown(1);
      }
    } else {
      const fields = [
        ["Systems / Tools", "systemsTools"],
        ["Data Processing", "dataProcessing"],
        ["Rules / Decision Logic", "rulesDecisionLogic"],
        ["Exception Branching", "exceptionBranching"],
        ["Regulatory / Compliance Context", "regulatoryContext"],
        ["Human Checkpoint", "humanCheckpoint"]
      ];
      for (const step of steps) {
        doc.font("Helvetica-Bold").fontSize(15).fillColor("#0d1b2e").text(String(step.name || "Unnamed Step"));
        doc.moveDown(0.3);
        for (const [label, key] of fields) {
          labelLine(label, step[key]);
          doc.moveDown(0.15);
        }
        doc.moveDown(0.8);
      }
    }

    doc.end();
    await finished;
    const buffer = Buffer.concat(chunks);
    const filename = `${safeName}-${kind === "engineering" ? "engineering-doc" : "recipe-book"}.pdf`;
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length
    });
    res.end(buffer);
  } catch (err) {
    console.error("[pdf-export] error:", err);
    return sendJson(res, 500, { error: err.message });
  }
}

// Live "AI Understanding" summary of the current workflow grid. No external
// dependencies (global fetch + readJson/sendJson), so nothing to lazy-load.
async function handleAiMirror(req, res) {
  if (!ANTHROPIC_API_KEY) {
    return sendJson(res, 400, {
      error: "ANTHROPIC_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Invalid request body" });
  }

  const grid = body.grid && typeof body.grid === "object" ? body.grid : {};
  const steps = Array.isArray(grid.steps) ? grid.steps : [];
  if (!steps.length) {
    return sendJson(res, 200, { summary: "Add some workflow steps first to generate a summary." });
  }

  const cell = (step, key) => {
    const raw = step?.cells?.[key]?.value;
    if (Array.isArray(raw)) return raw.map((entry) => entry?.pattern || "").filter(Boolean).join(", ");
    return typeof raw === "string" ? raw.trim() : "";
  };
  const workflowName = typeof grid.workflowName === "string" && grid.workflowName.trim() ? grid.workflowName.trim() : "Workflow";
  const stepLines = steps.map((step, index) => {
    const name = cell(step, "name") || `Step ${index + 1}`;
    return [
      `Step ${index + 1}: ${name}`,
      `  Persona/Actors: ${cell(step, "personaActors") || "(none)"}`,
      `  Systems/Tools: ${cell(step, "systemsTools") || "(none)"}`,
      `  AI pattern: ${cell(step, "aiPattern") || "(unset)"}`,
      `  Pain/friction: ${cell(step, "painFriction") || "(none)"}`,
      `  Data sensitivity: ${cell(step, "dataSensitivity") || "(none)"}`
    ].join("\n");
  }).join("\n\n");

  const system = [
    "You write a short plain-English 'AI Understanding' summary of a captured business workflow for a non-technical reader.",
    "Write 3 to 5 sentences in plain operational language — no AI/ML jargon.",
    "Cover: what the workflow is and who does it; which systems are involved; where AI looks most confident (steps with an assigned AI pattern); and what is least clear or still missing.",
    "Return only the paragraph text — no preamble, no headings, no bullet points, no markdown."
  ].join(" ");
  const userContent = `Workflow: ${workflowName}\nSteps: ${steps.length}\n\n${stepLines}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: AI_MIRROR_MODEL,
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || "Anthropic API request failed",
        detail: data
      });
    }
    const summary = (data?.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    return sendJson(res, 200, { summary: summary || "Could not generate a summary from the current workflow." });
  } catch (error) {
    console.error("[ai-mirror] error:", error);
    return sendJson(res, 500, { error: error.message || "AI mirror request failed" });
  }
}

// "Tell me anything" free-text extraction: turn a raw description into a
// structured workflow (name + steps with persona/systems/pain/output). No
// external deps (global fetch + readJson/sendJson), so nothing to lazy-load.
async function handleDumpExtract(req, res) {
  if (!ANTHROPIC_API_KEY) {
    return sendJson(res, 400, {
      error: "ANTHROPIC_API_KEY is not configured. Set it in your terminal and restart the server."
    });
  }

  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Invalid request body" });
  }

  appendAudit(req, "ai_analysis_run", { detail: "dump-extract", content: body });
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return sendJson(res, 400, { error: "text is required" });
  const grid = body.grid && typeof body.grid === "object" ? body.grid : {};
  const existingSteps = Array.isArray(grid.steps) ? grid.steps : [];

  const cellValue = (step, key) => {
    const raw = step?.cells?.[key]?.value;
    return typeof raw === "string" ? raw.trim() : "";
  };
  const existingSummary = existingSteps.length
    ? existingSteps.map((step, index) => `${index + 1}. ${cellValue(step, "name") || "(unnamed)"}`).join("\n")
    : "(none yet)";

  const system = [
    "You extract a structured workflow from a user's free-text description (which may be meeting notes, an email, or a rough explanation).",
    "Identify the workflow name and its ordered steps. For each step capture: name, the persona/actors who perform it, the systems/tools used, any pain or friction mentioned, and the output it produces.",
    "Only include details actually present in the text — leave a field as an empty string if it is not mentioned. Do not invent anything.",
    "Return ONLY valid JSON, no prose, no code fences, in exactly this shape:",
    '{"extracted":{"workflowName":"<name or empty>","steps":[{"name":"<step name>","personaActors":"<who>","systemsTools":"<systems>","painFriction":"<pain or empty>","output":"<output or empty>"}]}}'
  ].join(" ");
  const userContent = `Existing workflow name: ${grid.workflowName || "(none)"}\nExisting steps:\n${existingSummary}\n\nUser description:\n${text}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: DUMP_EXTRACT_MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userContent }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || "Anthropic API request failed",
        detail: data
      });
    }
    const rawText = (data?.content || [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    const parsed = parseModelJson(rawText);
    const extractedRaw = parsed?.extracted && typeof parsed.extracted === "object" ? parsed.extracted : null;
    if (!extractedRaw) {
      return sendJson(res, 502, { error: "The model did not return valid JSON.", raw: rawText.slice(0, 500) });
    }
    const str = (value) => (typeof value === "string" ? value : "");
    const steps = (Array.isArray(extractedRaw.steps) ? extractedRaw.steps : [])
      .map((step) => ({
        name: str(step?.name).trim(),
        personaActors: str(step?.personaActors),
        systemsTools: str(step?.systemsTools),
        painFriction: str(step?.painFriction),
        output: str(step?.output)
      }))
      .filter((step) => step.name);
    return sendJson(res, 200, { extracted: { workflowName: str(extractedRaw.workflowName), steps } });
  } catch (error) {
    console.error("[dump-extract] error:", error);
    return sendJson(res, 500, { error: error.message || "Dump extraction failed" });
  }
}

server.listen(PORT, () => {
  console.log(`Discovery Intake Studio running at http://localhost:${PORT}`);
  console.log(OPENAI_API_KEY ? `Primary live voice enabled with model ${REALTIME_MODEL}` : "Realtime voice disabled: OPENAI_API_KEY is not set");
  console.log(OPENAI_API_KEY ? `Structured extraction enabled with model ${EXTRACTION_MODEL} at ${EXTRACTION_REASONING_EFFORT} reasoning` : "AI extraction disabled: OPENAI_API_KEY is not set");
});
