import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const explicitZipPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
const zipPath = explicitZipPath || latestReviewZipPath();

const requiredFiles = [
  ".github/workflows/enterprise-transfer-check.yml",
  "README.md",
  "INSTALL.md",
  "REVIEWER_GUIDE.md",
  "COWORKER_REVIEW_BRIEF.md",
  "COWORKER_FEEDBACK_TEMPLATE.md",
  "WORK_COMPUTER_TRANSFER_CHECKLIST.md",
  "SAFE_SAMPLE_SCENARIOS.md",
  "EMAIL_TRANSFER_NOTE.md",
  "CODE_REVIEW_CHECKLIST.md",
  "SECURITY_AND_DATA_HANDLING.md",
  "PILOT_ROADMAP.md",
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
  "start-mac.command",
  "start-windows.bat",
  "scripts/start-local.mjs",
  "scripts/check-enterprise-transfer-kit.mjs",
  "scripts/check-work-environment-readiness.mjs",
  "scripts/check-enterprise-readiness-brief.mjs",
  "scripts/check-handoff-package-contract.mjs",
  "scripts/check-local-setup.mjs",
  "scripts/check-review-package.mjs",
  "scripts/check-review-package-install.mjs",
  "scripts/check-reviewer-decision.mjs",
  "scripts/check-solution-build-recipe.mjs",
  "scripts/run-stabilization-checks.mjs",
  "discovery-intake-webapp/.env.example",
  "discovery-intake-webapp/index.html",
  "discovery-intake-webapp/app.js",
  "discovery-intake-webapp/server.mjs",
  "discovery-intake-webapp/future.css",
  "discovery-intake-webapp/styles.css",
  "discovery-intake-webapp/cockpit.css",
  "discovery-intake-webapp/vendor/xlsx.full.min.js",
  "discovery-intake-webapp/vendor/lucide.js"
];

const forbiddenPathParts = [
  "/.git/",
  "/node_modules/",
  "/dist/",
  "/outputs/",
  "/feedback_docx_extract/",
  "/discovery-intake-webapp/data/",
  "/discovery-intake-webapp/test-outputs/regression/",
  "/discovery-intake-webapp/test-outputs/screenshots/",
  "/discovery-intake-webapp/test-outputs/phase1-baseline/",
  "/discovery-intake-webapp/test-outputs/phase5-evaluation/",
  "/discovery-intake-webapp/test-outputs/layout/",
  "/discovery-intake-webapp/test-outputs/evidence-linkage/",
  "/discovery-intake-webapp/test-outputs/enterprise-readiness/",
  "/discovery-intake-webapp/test-outputs/handoff-package-contract/",
  "/discovery-intake-webapp/test-outputs/reviewer-decision/",
  "/discovery-intake-webapp/test-outputs/solution-build-recipe/",
  "/discovery-intake-webapp/test-outputs/template-alignment/",
  "/discovery-intake-webapp/test-outputs/workbook-import/",
  "/.cache/",
  "/.tmp/",
  "/coverage/",
  "/playwright-report/",
  "/test-results/"
];

if (!zipPath) {
  console.error("FAIL No review ZIP found. Run: node scripts/build-review-package.mjs");
  process.exit(1);
}

const zipBytes = await fs.readFile(zipPath);
const entries = parseZipEntries(zipBytes);
const entryNames = entries.map((entry) => entry.name);
const packageRoots = uniqueTopLevelFolders(entryNames);
const packageRoot = packageRoots[0] || "";
const relativeNames = entryNames.map((name) => stripPackageRoot(name, packageRoot));
const failures = [];
const warnings = [];

if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) failures.push("File does not start with a ZIP signature.");
if (packageRoots.length !== 1) failures.push(`Expected one top-level package folder; found ${packageRoots.join(", ") || "none"}.`);

for (const file of requiredFiles) {
  if (!relativeNames.includes(file)) failures.push(`Missing required review file: ${file}`);
}

for (const entry of entries) {
  const normalizedPath = `/${entry.name}`;
  if (entry.name.includes(".env.local") || entry.name.endsWith("/.env")) {
    failures.push(`Forbidden environment file included: ${entry.name}`);
  }
  for (const part of forbiddenPathParts) {
    if (normalizedPath.includes(part)) failures.push(`Forbidden generated path included: ${entry.name}`);
  }
  if (entry.bytes) validateEntryText(entry, failures);
}

const manifestPath = zipPath.replace(/\.zip$/i, ".manifest.json");
if (fsSync.existsSync(manifestPath)) {
  const manifestText = await fs.readFile(manifestPath, "utf8");
  const localHomeNeedle = "/Users/" + "mayankpandey";
  if (manifestText.includes(localHomeNeedle)) {
    failures.push("Sidecar manifest JSON includes a local absolute user path.");
  }
  const manifest = JSON.parse(manifestText);
  if (manifest.validation?.status !== "pass") {
    failures.push(`Sidecar manifest validation status is ${manifest.validation?.status || "missing"}.`);
  }
  if (Number(manifest.includedFiles) !== entries.length) {
    warnings.push(`Sidecar manifest expected ${manifest.includedFiles} files; ZIP has ${entries.length}.`);
  }
} else {
  warnings.push("Sidecar manifest JSON not found next to the ZIP; ZIP contents were still inspected directly.");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  warnings.forEach((warning) => console.warn(`WARN ${warning}`));
  process.exitCode = 1;
} else {
  console.log(`OK review package doctor checked ${entries.length} entries in ${path.relative(root, zipPath) || zipPath}`);
  console.log(`OK package root: ${packageRoot}`);
  console.log("OK required install, review, app, enterprise, and validation files are present");
  console.log("OK forbidden local data, dependency, generated-output, and secret paths are absent");
  console.log("OK no OpenAI API key, GitHub token, enterprise secret assignment, .env.local, or local user path patterns found in inspected entries");
  warnings.forEach((warning) => console.warn(`WARN ${warning}`));
}

function latestReviewZipPath() {
  if (!fsSync.existsSync(distDir)) return "";
  const candidates = fsSync.readdirSync(distDir)
    .filter((name) => /^ai-workflow-discovery-studio-review-.*\.zip$/.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fsSync.statSync(b).mtimeMs - fsSync.statSync(a).mtimeMs);
  return candidates[0] || "";
}

function parseZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error("Could not find ZIP end-of-central-directory record.");
  const count = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralOffset;

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid central directory entry at offset ${offset}.`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const bytes = readEntryBytes(buffer, { method, compressedSize, uncompressedSize, localHeaderOffset, name });
    entries.push({ name, method, compressedSize, uncompressedSize, bytes });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readEntryBytes(buffer, entry) {
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error(`Invalid local file header for ${entry.name}.`);
  }
  const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const payloadStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const payload = buffer.subarray(payloadStart, payloadStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(payload);
  if (entry.method === 8) return zlib.inflateRawSync(payload);
  return null;
}

function uniqueTopLevelFolders(names) {
  return [...new Set(names.map((name) => name.split("/")[0]).filter(Boolean))];
}

function stripPackageRoot(name, packageRoot) {
  return packageRoot && name.startsWith(`${packageRoot}/`) ? name.slice(packageRoot.length + 1) : name;
}

function validateEntryText(entry, failures) {
  const text = entry.bytes.toString("utf8");
  const localHomeNeedle = "/Users/" + "mayankpandey";
  if (text.includes(localHomeNeedle)) failures.push(`Local absolute path leaked in ${entry.name}`);
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) failures.push(`Possible API key leaked in ${entry.name}`);
  if (/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/.test(text)) failures.push(`Possible GitHub token leaked in ${entry.name}`);
  if (/\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(text)) failures.push(`Possible GitHub fine-grained token leaked in ${entry.name}`);
  if (/^[ \t]*OPENAI_API_KEY[ \t]*=[ \t]*(?!($|your-approved-key|your-approved-key-here|\.\.\.|\[redacted\]))\S+/m.test(text)) {
    failures.push(`Non-placeholder OPENAI_API_KEY value found in ${entry.name}`);
  }
  if (/^[ \t]*(MICROSOFT_CLIENT_SECRET|GITHUB_TOKEN|GITHUB_PAT|AZURE_CLIENT_SECRET)[ \t]*=[ \t]*(?!($|<|your-|approved-|enterprise-|\.{3}|\[redacted\]))\S+/m.test(text)) {
    failures.push(`Non-placeholder enterprise secret value found in ${entry.name}`);
  }
}
