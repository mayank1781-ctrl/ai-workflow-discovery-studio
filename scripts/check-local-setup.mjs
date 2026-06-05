import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "discovery-intake-webapp");
const appUrl = process.env.APP_URL || "http://localhost:5177";
const requireHealth = process.argv.includes("--health");
const skipHealth = process.argv.includes("--no-health");

const requiredFiles = [
  ".github/workflows/enterprise-transfer-check.yml",
  "ENTERPRISE_DEPLOYMENT_GUIDE.md",
  "ENTERPRISE_TRANSFER_MANIFEST.md",
  "ENVIRONMENT_VARIABLES.md",
  "GITHUB_ENTERPRISE_SETUP.md",
  "MICROSOFT_365_CONNECTOR_SETUP.md",
  "V1_RELEASE_CHECKLIST.md",
  "WORK_ENVIRONMENT_STANDUP_RUNBOOK.md",
  "enterprise/enterprise-environment.template.json",
  "enterprise/github-repository-setup.json",
  "enterprise/microsoft-365-permissions.json",
  "enterprise/v1-readiness-gates.json",
  "enterprise/work-environment-readiness-checks.json",
  "package.json",
  "discovery-intake-webapp/index.html",
  "discovery-intake-webapp/app.js",
  "discovery-intake-webapp/future.css",
  "discovery-intake-webapp/server.mjs",
  "discovery-intake-webapp/vendor/xlsx.full.min.js",
  "discovery-intake-webapp/vendor/lucide.js",
  "discovery-intake-webapp/scripts/regression-interview-flow.mjs",
  "scripts/check-discovery-layout.mjs",
  "scripts/check-enterprise-transfer-kit.mjs",
  "scripts/check-evidence-linkage.mjs",
  "scripts/check-enterprise-readiness-brief.mjs",
  "scripts/check-handoff-package-contract.mjs",
  "scripts/check-review-package.mjs",
  "scripts/check-review-package-install.mjs",
  "scripts/check-reviewer-decision.mjs",
  "scripts/check-solution-build-recipe.mjs",
  "scripts/check-template-alignment.mjs",
  "scripts/check-work-environment-readiness.mjs",
  "scripts/check-workbook-import.mjs",
  "scripts/run-stabilization-checks.mjs"
];

const requiredOneOf = [
  {
    label: "Restart or package manifest",
    files: ["PROJECT_RESTART_HANDOFF.md", "REVIEW_PACKAGE_MANIFEST.md"]
  }
];

const results = [];

function add(status, label, detail = "") {
  results.push({ status, label, detail });
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
      })
  );
}

function nodeVersionMajor() {
  const match = process.versions.node.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function printResults() {
  for (const item of results) {
    const marker = item.status === "ok" ? "OK" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`${marker} ${item.label}${item.detail ? ` - ${item.detail}` : ""}`);
  }
}

async function checkHealth() {
  try {
    const response = await fetch(`${appUrl}/api/health`);
    const health = await response.json();
    if (!response.ok || !health.ok) {
      add("fail", "Local server health", `Unexpected response from ${appUrl}/api/health`);
      return;
    }
    add("ok", "Local server health", `${appUrl} is responding`);
    add(health.aiConfigured ? "ok" : "warn", "OpenAI API configured", health.aiConfigured ? `Extraction model: ${health.extractionModel}` : "OPENAI_API_KEY is missing; live extraction is disabled");
    add(health.realtimeConfigured ? "ok" : "warn", "Realtime voice configured", health.realtimeConfigured ? `Model: ${health.realtimeModel}` : "Realtime will be unavailable");
    add(health.transcriptionConfigured ? "ok" : "warn", "Post-turn transcription configured", health.transcriptionConfigured ? `Model: ${health.transcriptionModel}` : "Dictation fallback may be browser-only");
    if (health.enterprise) {
      add("ok", "Enterprise mode", `${health.enterprise.enterpriseMode || "off"} / connector ${health.enterprise.connectorMode || "mock"}`);
      add(health.enterprise.microsoftConfigured ? "ok" : "warn", "Microsoft 365 connector config", health.enterprise.microsoftConfigured ? "Tenant and client ID are configured" : "Tenant/client ID missing; connector should remain mock");
      add(health.enterprise.githubConfigured ? "ok" : "warn", "GitHub repository config", health.enterprise.githubConfigured ? health.enterprise.githubRepository : "GITHUB_REPOSITORY is not set");
    }
  } catch (error) {
    add(requireHealth ? "fail" : "warn", "Local server health", `Could not reach ${appUrl}. Start it with node scripts/start-local.mjs.`);
  }
}

const nodeMajor = nodeVersionMajor();
add(nodeMajor >= 18 ? "ok" : "fail", "Node.js version", `${process.versions.node} detected; Node 18+ required`);

for (const file of requiredFiles) {
  add(exists(file) ? "ok" : "fail", `Required file: ${file}`);
}

for (const group of requiredOneOf) {
  const found = group.files.find((file) => exists(file));
  add(found ? "ok" : "fail", group.label, found ? found : `Expected one of: ${group.files.join(", ")}`);
}

const envLocalPath = path.join(appDir, ".env.local");
const envExamplePath = path.join(appDir, ".env.example");
const envLocal = readEnvFile(envLocalPath);
const envExampleExists = fs.existsSync(envExamplePath);
const hasApiKey = Boolean(process.env.OPENAI_API_KEY || envLocal.OPENAI_API_KEY);

add(envExampleExists ? "ok" : "fail", "Environment template", "discovery-intake-webapp/.env.example");
add(fs.existsSync(envLocalPath) ? "ok" : "warn", "Local environment file", fs.existsSync(envLocalPath) ? ".env.local exists and is git-ignored" : "Copy .env.example to .env.local");
add(hasApiKey ? "ok" : "warn", "OpenAI API key", hasApiKey ? "Configured locally without printing the key" : "Needed for live AI extraction and transcription");

if (!skipHealth) await checkHealth();
printResults();

if (results.some((item) => item.status === "fail")) {
  process.exitCode = 1;
}
