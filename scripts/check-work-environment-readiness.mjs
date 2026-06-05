import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const appDir = path.join(root, "discovery-intake-webapp");
const appUrl = process.env.APP_URL || "http://localhost:5177";
const strictWork = process.argv.includes("--work-strict");
const connectorApproved = process.argv.includes("--connector-approved");
const githubRequired = process.argv.includes("--github-required") || strictWork;
const requireHealth = process.argv.includes("--health");

const checks = [];
const requiredFiles = [
  "README.md",
  "INSTALL.md",
  "WORK_ENVIRONMENT_STANDUP_RUNBOOK.md",
  "ENTERPRISE_DEPLOYMENT_GUIDE.md",
  "GITHUB_ENTERPRISE_SETUP.md",
  "MICROSOFT_365_CONNECTOR_SETUP.md",
  "ENVIRONMENT_VARIABLES.md",
  "V1_RELEASE_CHECKLIST.md",
  "ENTERPRISE_TRANSFER_MANIFEST.md",
  "enterprise/enterprise-environment.template.json",
  "enterprise/github-repository-setup.json",
  "enterprise/microsoft-365-permissions.json",
  "enterprise/v1-readiness-gates.json",
  "enterprise/work-environment-readiness-checks.json",
  ".github/workflows/enterprise-transfer-check.yml",
  "discovery-intake-webapp/.env.example",
  "discovery-intake-webapp/index.html",
  "discovery-intake-webapp/app.js",
  "discovery-intake-webapp/server.mjs",
  "scripts/start-local.mjs",
  "scripts/check-enterprise-transfer-kit.mjs",
  "scripts/check-work-environment-readiness.mjs",
  "scripts/build-review-package.mjs",
  "scripts/check-review-package.mjs"
];

const secretKeys = [
  "OPENAI_API_KEY",
  "MICROSOFT_CLIENT_SECRET",
  "GITHUB_TOKEN",
  "GITHUB_PAT",
  "AZURE_CLIENT_SECRET"
];

function add(status, label, detail = "") {
  checks.push({ status, label, detail });
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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
        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();
        if (
          (value.startsWith("\"") && value.endsWith("\"")) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );
}

function mergedValue(envLocal, key) {
  return process.env[key] || envLocal[key] || "";
}

function nodeVersionMajor() {
  const match = process.versions.node.match(/^(\d+)/);
  return match ? Number(match[1]) : 0;
}

function git(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function gitAvailable() {
  return spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
}

function gitTracks(relativePath) {
  if (!gitAvailable()) return false;
  const result = git(["ls-files", "--error-unmatch", relativePath]);
  return result.status === 0;
}

function insideGitRepo() {
  if (!gitAvailable()) return false;
  const result = git(["rev-parse", "--is-inside-work-tree"]);
  return result.status === 0 && result.stdout.trim() === "true";
}

function hasGitRemote() {
  if (!insideGitRepo()) return false;
  const result = git(["remote", "get-url", "origin"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}

function latestReviewZipPath() {
  const distDir = path.join(root, "dist");
  if (!fs.existsSync(distDir)) return "";
  return fs.readdirSync(distDir)
    .filter((name) => /^ai-workflow-discovery-studio-review-.*\.zip$/.test(name))
    .map((name) => path.join("dist", name))
    .sort((a, b) => fs.statSync(path.join(root, b)).mtimeMs - fs.statSync(path.join(root, a)).mtimeMs)[0] || "";
}

function isTruthy(value) {
  return /^(true|1|yes|on)$/i.test(String(value || ""));
}

function splitScopes(value) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasWriteScope(scopes) {
  return scopes.some((scope) => /readwrite|write/i.test(scope));
}

function printResults() {
  for (const item of checks) {
    const marker = item.status === "ok" ? "OK" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`${marker} ${item.label}${item.detail ? ` - ${item.detail}` : ""}`);
  }
}

async function checkHealth(envLocal) {
  try {
    const response = await fetch(`${appUrl}/api/enterprise/config-status`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      add("fail", "Enterprise config status endpoint", `Unexpected response from ${appUrl}`);
      return;
    }

    const enterprise = payload.enterprise || {};
    add("ok", "Enterprise config status endpoint", `${appUrl}/api/enterprise/config-status responded`);
    add("ok", "Health secret posture", enterprise.secretsExposed === false ? "Endpoint reports no secrets exposed" : "Review endpoint output");
    add(
      enterprise.enterpriseMode === (mergedValue(envLocal, "ENTERPRISE_MODE") || "off") ? "ok" : "warn",
      "Enterprise mode matches env",
      `${enterprise.enterpriseMode || "off"}`
    );
    add(
      enterprise.connectorMode === (mergedValue(envLocal, "CONNECTOR_MODE") || "mock") ? "ok" : "warn",
      "Connector mode matches env",
      `${enterprise.connectorMode || "mock"}`
    );
  } catch (error) {
    add("fail", "Enterprise config status endpoint", `Could not reach ${appUrl}. Start the app with node scripts/start-local.mjs.`);
  }
}

const nodeMajor = nodeVersionMajor();
add(nodeMajor >= 18 ? "ok" : "fail", "Node.js version", `${process.versions.node} detected; Node 18+ required`);

for (const file of requiredFiles) {
  add(exists(file) ? "ok" : "fail", `Required file: ${file}`);
}

const envLocalPath = path.join(appDir, ".env.local");
const envExamplePath = path.join(appDir, ".env.example");
const envLocalExists = fs.existsSync(envLocalPath);
const envExample = readEnvFile(envExamplePath);
const envLocal = readEnvFile(envLocalPath);

add(envLocalExists ? "ok" : strictWork ? "fail" : "warn", "Work-local .env.local", envLocalExists ? "Present and not printed" : "Create from .env.example after work approval");
add(gitTracks("discovery-intake-webapp/.env.local") ? "fail" : "ok", ".env.local not tracked by Git");

if (exists(".gitignore")) {
  const gitignore = readFile(".gitignore");
  const appGitignore = exists("discovery-intake-webapp/.gitignore") ? readFile("discovery-intake-webapp/.gitignore") : "";
  const envIgnored = gitignore.includes(".env.local") ||
    gitignore.includes(".env.*") ||
    gitignore.includes("**/.env.*") ||
    appGitignore.includes(".env.local") ||
    appGitignore.includes(".env.*");
  add(envIgnored ? "ok" : "warn", "Git ignore covers local env", envIgnored ? ".env.local ignored by env pattern" : "Add .env.local ignore rule");
}

for (const key of ["PORT", "APP_ENV", "APP_BASE_URL", "ENTERPRISE_MODE", "CONNECTOR_MODE", "OPENAI_API_KEY"]) {
  add(Object.hasOwn(envExample, key) ? "ok" : "fail", `.env.example key: ${key}`);
}

for (const key of secretKeys) {
  const configured = Boolean(mergedValue(envLocal, key));
  if (key === "OPENAI_API_KEY") {
    add(configured ? "ok" : "warn", `${key} configured`, configured ? "Set without printing value" : "Not set; live AI features stay disabled");
  } else {
    add("ok", `${key} secret posture`, configured ? "Set without printing value; verify approved storage" : "Not set");
  }
}

const appEnv = mergedValue(envLocal, "APP_ENV") || "local";
const enterpriseMode = mergedValue(envLocal, "ENTERPRISE_MODE") || "off";
const connectorMode = mergedValue(envLocal, "CONNECTOR_MODE") || "mock";
const githubRepository = mergedValue(envLocal, "GITHUB_REPOSITORY");
const graphScopes = splitScopes(mergedValue(envLocal, "MICROSOFT_GRAPH_SCOPES"));
const microsoftConfigured = Boolean(mergedValue(envLocal, "MICROSOFT_TENANT_ID") && mergedValue(envLocal, "MICROSOFT_CLIENT_ID"));
const microsoftRedirectConfigured = Boolean(mergedValue(envLocal, "MICROSOFT_REDIRECT_URI"));
const microsoftBoundaryConfigured = Boolean(
  mergedValue(envLocal, "MICROSOFT_SHAREPOINT_HOSTNAME") ||
  mergedValue(envLocal, "MICROSOFT_SHAREPOINT_SITE_PATH") ||
  mergedValue(envLocal, "MICROSOFT_GRAPH_SITE_ID") ||
  mergedValue(envLocal, "MICROSOFT_GRAPH_DRIVE_ID") ||
  mergedValue(envLocal, "MICROSOFT_GRAPH_FOLDER_PATH")
);

add("ok", "App environment label", appEnv);
add(
  strictWork ? (isTruthy(enterpriseMode) ? "ok" : "fail") : "ok",
  "Enterprise mode",
  strictWork ? `${enterpriseMode}; strict work mode expects on` : enterpriseMode
);
add(connectorMode ? "ok" : "fail", "Connector mode", connectorMode);

if (connectorMode !== "mock" && !microsoftConfigured) {
  add("fail", "Connector configuration", "Non-mock connector mode needs Microsoft tenant and client ID");
} else if (connectorMode === "mock") {
  add("ok", "Connector safety posture", "Mock mode; no live Microsoft 365 connector required");
} else {
  add("ok", "Connector configuration", "Microsoft tenant and client ID are configured");
}

if (connectorApproved) {
  add(microsoftConfigured ? "ok" : "fail", "Microsoft tenant/client for approved connector", microsoftConfigured ? "Configured" : "Missing tenant ID or client ID");
  add(microsoftRedirectConfigured ? "ok" : "fail", "Microsoft redirect URI", microsoftRedirectConfigured ? "Configured" : "Missing MICROSOFT_REDIRECT_URI");
  add(graphScopes.length ? "ok" : "fail", "Microsoft Graph scopes", graphScopes.length ? `${graphScopes.length} scope(s) configured` : "Missing MICROSOFT_GRAPH_SCOPES");
  add(microsoftBoundaryConfigured ? "ok" : "fail", "Microsoft source boundary", microsoftBoundaryConfigured ? "SharePoint/site/drive/folder boundary configured" : "Missing approved source boundary");
} else {
  add(microsoftConfigured ? "ok" : "warn", "Microsoft tenant/client", microsoftConfigured ? "Configured" : "Not configured; keep connector mode mock");
  add(graphScopes.length ? "ok" : "warn", "Microsoft Graph scopes", graphScopes.length ? `${graphScopes.length} scope(s) listed` : "No scopes listed");
}

add(
  hasWriteScope(graphScopes) && !connectorApproved ? "fail" : "ok",
  "Microsoft Graph write-scope gate",
  hasWriteScope(graphScopes) ? "Write-like scope detected; requires separate approval" : "No write-like scope detected"
);

add(gitAvailable() ? "ok" : "warn", "Git available", gitAvailable() ? "git command found" : "Git command not found");
add(insideGitRepo() ? "ok" : githubRequired ? "fail" : "warn", "Inside Git worktree", insideGitRepo() ? "Yes" : "Not initialized yet");
add(hasGitRemote() ? "ok" : githubRequired ? "fail" : "warn", "Git remote origin", hasGitRemote() ? "Configured" : "No origin remote configured");
add(githubRepository ? "ok" : githubRequired ? "fail" : "warn", "GITHUB_REPOSITORY metadata", githubRepository ? "Configured without printing value" : "Not set");

const latestZip = latestReviewZipPath();
add(latestZip ? "ok" : "warn", "Latest local review ZIP", latestZip || "No dist ZIP found; build one with node scripts/build-review-package.mjs");

if (requireHealth) await checkHealth(envLocal);

printResults();

if (checks.some((item) => item.status === "fail")) {
  process.exitCode = 1;
}
