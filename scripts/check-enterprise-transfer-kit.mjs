import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const docs = {
  "ENTERPRISE_DEPLOYMENT_GUIDE.md": [
    "Phase 0: Personal Machine Preflight",
    "Phase 2: Create The Work GitHub Repository",
    "Phase 4: Configure Microsoft Entra App Registration",
    "Phase 7: Pilot With Safe Data"
  ],
  "GITHUB_ENTERPRISE_SETUP.md": [
    "Repository Shape",
    "GitHub Actions",
    "Repository Secrets",
    "Pull Request Review Checklist"
  ],
  "MICROSOFT_365_CONNECTOR_SETUP.md": [
    "Recommended v1.0 MVP Posture",
    "Microsoft Entra App Registration",
    "Permission Request Ladder",
    "Approval Gates"
  ],
  "ENVIRONMENT_VARIABLES.md": [
    "App Runtime",
    "OpenAI / ChatGPT Features",
    "Microsoft 365 Connector Values",
    "Local Safety Rules"
  ],
  "V1_RELEASE_CHECKLIST.md": [
    "Package And Transfer",
    "GitHub",
    "Microsoft 365",
    "Stop Criteria"
  ],
  "WORK_ENVIRONMENT_STANDUP_RUNBOOK.md": [
    "Run The Baseline Work Readiness Check",
    "Create Or Connect The Private Work GitHub Repository",
    "Keep Microsoft 365 In Mock Mode Until Approved",
    "After Microsoft 365 Approval"
  ],
  "ENTERPRISE_TRANSFER_MANIFEST.md": [
    "Core Runtime",
    "Machine-Readable Enterprise Contracts",
    "Explicit Exclusions"
  ]
};

const jsonContracts = {
  "enterprise/enterprise-environment.template.json": [
    "schemaVersion",
    "app",
    "ai",
    "microsoft365",
    "github",
    "dataPolicy",
    "controls"
  ],
  "enterprise/microsoft-365-permissions.json": [
    "schemaVersion",
    "defaultConnectorMode",
    "recommendedMvpAccess",
    "permissionLadder",
    "blockedForMvp",
    "evidenceRequired"
  ],
  "enterprise/github-repository-setup.json": [
    "schemaVersion",
    "repository",
    "access",
    "branchControls",
    "actions",
    "secrets",
    "ignoredPaths"
  ],
  "enterprise/v1-readiness-gates.json": [
    "schemaVersion",
    "gates"
  ],
  "enterprise/work-environment-readiness-checks.json": [
    "schemaVersion",
    "checker",
    "modes",
    "requiredEvidence",
    "blockedConditions"
  ]
};

const packagedFiles = [
  ...Object.keys(docs),
  ...Object.keys(jsonContracts),
  ".github/workflows/enterprise-transfer-check.yml",
  "scripts/check-enterprise-transfer-kit.mjs",
  "scripts/check-work-environment-readiness.mjs"
];

const textFilesToScan = [
  ...packagedFiles,
  "discovery-intake-webapp/.env.example",
  "scripts/build-review-package.mjs",
  "scripts/check-review-package.mjs",
  "scripts/check-local-setup.mjs",
  "scripts/run-stabilization-checks.mjs",
  "package.json"
];

const failures = [];
const warnings = [];

function addFailure(message) {
  failures.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

for (const [file, requiredPhrases] of Object.entries(docs)) {
  if (!exists(file)) {
    addFailure(`Missing enterprise doc: ${file}`);
    continue;
  }
  const text = readText(file);
  for (const phrase of requiredPhrases) {
    if (!text.includes(phrase)) addFailure(`${file} is missing required section or phrase: ${phrase}`);
  }
}

for (const [file, requiredKeys] of Object.entries(jsonContracts)) {
  if (!exists(file)) {
    addFailure(`Missing enterprise contract: ${file}`);
    continue;
  }
  try {
    const parsed = JSON.parse(readText(file));
    for (const key of requiredKeys) {
      if (!Object.hasOwn(parsed, key)) addFailure(`${file} is missing required top-level key: ${key}`);
    }
  } catch (error) {
    addFailure(`${file} is not valid JSON: ${error.message}`);
  }
}

for (const file of packagedFiles) {
  if (!exists(file)) addFailure(`Missing required enterprise package file: ${file}`);
}

const packageBuilder = exists("scripts/build-review-package.mjs") ? readText("scripts/build-review-package.mjs") : "";
const packageDoctor = exists("scripts/check-review-package.mjs") ? readText("scripts/check-review-package.mjs") : "";
const localSetup = exists("scripts/check-local-setup.mjs") ? readText("scripts/check-local-setup.mjs") : "";
const stabilization = exists("scripts/run-stabilization-checks.mjs") ? readText("scripts/run-stabilization-checks.mjs") : "";
const packageJson = exists("package.json") ? readText("package.json") : "";

for (const file of packagedFiles) {
  if (!packageBuilder.includes(file)) addFailure(`Review package builder does not include ${file}`);
  if (!packageDoctor.includes(file)) addFailure(`Review package doctor does not require ${file}`);
}

if (!localSetup.includes("scripts/check-enterprise-transfer-kit.mjs")) {
  addFailure("Local setup check does not require scripts/check-enterprise-transfer-kit.mjs");
}

if (!localSetup.includes("scripts/check-work-environment-readiness.mjs")) {
  addFailure("Local setup check does not require scripts/check-work-environment-readiness.mjs");
}

if (!stabilization.includes("check-enterprise-transfer-kit.mjs")) {
  addFailure("Stabilization checks do not run the enterprise transfer-kit check");
}

if (!stabilization.includes("check-work-environment-readiness.mjs")) {
  addFailure("Stabilization checks do not run the work environment readiness check");
}

if (!packageJson.includes("enterprise:check")) {
  warnings.push("package.json does not expose an enterprise:check shortcut");
}

if (!packageJson.includes("work:check")) {
  warnings.push("package.json does not expose a work:check shortcut");
}

for (const file of textFilesToScan) {
  if (!exists(file)) continue;
  const text = readText(file);
  const secretFailures = findSecretLeaks(text, file);
  failures.push(...secretFailures);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  warnings.forEach((warning) => console.warn(`WARN ${warning}`));
  process.exitCode = 1;
} else {
  console.log("OK enterprise transfer kit docs are present");
  console.log("OK enterprise JSON contracts are valid");
  console.log("OK enterprise files are wired into review package builder and doctor");
  console.log("OK local setup and stabilization checks include enterprise and work-readiness checks");
  console.log("OK no OpenAI, GitHub, Microsoft secret-looking values, .env.local contents, or local user paths found in enterprise transfer files");
  warnings.forEach((warning) => console.warn(`WARN ${warning}`));
}

function findSecretLeaks(text, file) {
  const issues = [];
  const localHomeNeedle = "/Users/" + "mayankpandey";
  const patterns = [
    { label: "OpenAI API key", regex: /sk-[A-Za-z0-9_-]{20,}/g },
    { label: "GitHub token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
    { label: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
    { label: "local absolute path", regex: new RegExp(escapeRegExp(localHomeNeedle), "g") }
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(text)) issues.push(`${pattern.label} pattern found in ${file}`);
  }

  const assignmentPattern = /^[ \t]*(OPENAI_API_KEY|MICROSOFT_CLIENT_SECRET|GITHUB_TOKEN|GITHUB_PAT|AZURE_CLIENT_SECRET)[ \t]*=[ \t]*(?!($|<|your-|approved-|enterprise-|\.{3}|\[redacted\]))\S+/gm;
  if (assignmentPattern.test(text)) {
    issues.push(`Non-placeholder secret assignment found in ${file}`);
  }

  return issues;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
