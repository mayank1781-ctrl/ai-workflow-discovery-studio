import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const packageBaseName = `ai-workflow-discovery-studio-review-${packageJson.version || "0.1.0"}-${stamp}`;
const zipPath = path.join(distDir, `${packageBaseName}.zip`);
const manifestPath = path.join(distDir, `${packageBaseName}.manifest.json`);

const safeSampleFiles = [
  "banking-payments.json",
  "insurance-workshop-synthesis.json",
  "strategy-workshop-prep.json",
  "tech-test-generation.json",
  "frrf-breaking-records.json",
  "project-governance-summaries.json"
];

const alwaysExcludedPrefixes = [
  ".git/",
  "node_modules/",
  "dist/",
  "outputs/",
  "feedback_docx_extract/",
  ".cache/",
  ".tmp/",
  "coverage/",
  "playwright-report/",
  "test-results/",
  "discovery-intake-webapp/data/",
  "discovery-intake-webapp/test-outputs/"
];

const alwaysExcludedFiles = new Set([
  ".DS_Store",
  "build-ai-infusion-lifecycle-reference.mjs",
  "build-intake-workbook.mjs",
  "PROJECT_RESTART_HANDOFF.md",
  "FRESH_CHAT_RESTART_PROMPT.md",
  "discovery-intake-webapp/ENTERPRISE_PILOT_SETUP.md",
  "discovery-intake-webapp/PHASE2_SETUP.md",
  "discovery-intake-webapp/scripts/build-phase1-baseline-artifacts.mjs",
  "discovery-intake-webapp/scripts/run-phase1-live-tests.mjs"
]);

const reviewFileAllowlist = new Set([
  ".github/workflows/enterprise-transfer-check.yml",
  ".gitignore",
  "ARCHITECTURE.md",
  "CODE_REVIEW_CHECKLIST.md",
  "COWORKER_FEEDBACK_TEMPLATE.md",
  "COWORKER_REVIEW_BRIEF.md",
  "DISCOVERY_LOGIC.md",
  "EMAIL_TRANSFER_NOTE.md",
  "ENTERPRISE_DEPLOYMENT_GUIDE.md",
  "ENTERPRISE_TRANSFER_MANIFEST.md",
  "ENVIRONMENT_VARIABLES.md",
  "GITHUB_ENTERPRISE_SETUP.md",
  "INSTALL.md",
  "MICROSOFT_365_CONNECTOR_SETUP.md",
  "PILOT_ROADMAP.md",
  "README.md",
  "REVIEWER_GUIDE.md",
  "SAFE_SAMPLE_SCENARIOS.md",
  "SECURITY_AND_DATA_HANDLING.md",
  "V1_RELEASE_CHECKLIST.md",
  "WORK_ENVIRONMENT_STANDUP_RUNBOOK.md",
  "WORK_COMPUTER_TRANSFER_CHECKLIST.md",
  "enterprise/enterprise-environment.template.json",
  "enterprise/github-repository-setup.json",
  "enterprise/microsoft-365-permissions.json",
  "enterprise/v1-readiness-gates.json",
  "enterprise/work-environment-readiness-checks.json",
  "package.json",
  "start-mac.command",
  "start-windows.bat",
  "scripts/build-review-package.mjs",
  "scripts/check-discovery-layout.mjs",
  "scripts/check-docx-output.mjs",
  "scripts/check-enterprise-transfer-kit.mjs",
  "scripts/check-evidence-linkage.mjs",
  "scripts/check-enterprise-readiness-brief.mjs",
  "scripts/check-handoff-package-contract.mjs",
  "scripts/check-local-setup.mjs",
  "scripts/check-package-zip.mjs",
  "scripts/check-review-package.mjs",
  "scripts/check-review-package-install.mjs",
  "scripts/check-reviewer-decision.mjs",
  "scripts/check-solution-build-recipe.mjs",
  "scripts/check-template-alignment.mjs",
  "scripts/check-work-environment-readiness.mjs",
  "scripts/check-workbook-import.mjs",
  "scripts/run-stabilization-checks.mjs",
  "scripts/start-local.mjs",
  "discovery-intake-webapp/.env.example",
  "discovery-intake-webapp/.gitignore",
  "discovery-intake-webapp/README.md",
  "discovery-intake-webapp/app.js",
  "discovery-intake-webapp/cockpit.css",
  "discovery-intake-webapp/future.css",
  "discovery-intake-webapp/index.html",
  "discovery-intake-webapp/server.mjs",
  "discovery-intake-webapp/styles.css",
  "discovery-intake-webapp/scripts/regression-interview-flow.mjs"
]);

const reviewPrefixAllowlist = [
  "discovery-intake-webapp/vendor/"
];

const crcTable = buildCrcTable();

await fs.mkdir(distDir, { recursive: true });

const files = await collectReviewFiles(root);
const entries = [];
for (const file of files) {
  const relativePath = toPosix(path.relative(root, file));
  const stat = await fs.stat(file);
  const bytes = await fs.readFile(file);
  entries.push({
    path: `${packageBaseName}/${relativePath}`,
    bytes,
    mode: stat.mode,
    mtime: stat.mtime
  });
}

for (const sampleFile of safeSampleFiles) {
  const relativePath = `discovery-intake-webapp/test-outputs/live-extraction/${sampleFile}`;
  const absolutePath = path.join(root, relativePath);
  if (!fsSync.existsSync(absolutePath)) continue;
  const raw = JSON.parse(await fs.readFile(absolutePath, "utf8"));
  const sanitized = sanitizeReviewJson(raw);
  entries.push({
    path: `${packageBaseName}/${relativePath}`,
    bytes: Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`, "utf8"),
    mode: 0o100644,
    mtime: new Date()
  });
}

const manifest = buildManifest(entries);
entries.push({
  path: `${packageBaseName}/REVIEW_PACKAGE_MANIFEST.md`,
  bytes: Buffer.from(manifest.markdown, "utf8"),
  mode: 0o100644,
  mtime: new Date()
});

const validation = validateEntries(entries);
if (validation.failures.length) {
  validation.failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}

await fs.writeFile(zipPath, createZip(entries));
await fs.writeFile(manifestPath, `${JSON.stringify({
  packageName: packageBaseName,
  zipPath: toPosix(path.relative(root, zipPath)),
  createdAt: new Date().toISOString(),
  includedFiles: entries.length,
  includedBytes: entries.reduce((sum, entry) => sum + entry.bytes.length, 0),
  excludedPrefixes: alwaysExcludedPrefixes,
  excludedFiles: [...alwaysExcludedFiles],
  safeSampleFiles,
  validation
}, null, 2)}\n`);

const zipStat = await fs.stat(zipPath);
console.log(`OK review package created: ${path.relative(root, zipPath)}`);
console.log(`OK manifest created: ${path.relative(root, manifestPath)}`);
console.log(`OK included ${entries.length} files, ZIP size ${(zipStat.size / 1024 / 1024).toFixed(2)} MiB`);

async function collectReviewFiles(directory) {
  const results = [];
  const children = await fs.readdir(directory, { withFileTypes: true });
  for (const child of children) {
    const absolutePath = path.join(directory, child.name);
    const relativePath = toPosix(path.relative(root, absolutePath));
    if (shouldExclude(relativePath, child)) continue;
    if (child.isDirectory()) {
      results.push(...await collectReviewFiles(absolutePath));
    } else if (child.isFile()) {
      if (!shouldIncludeReviewFile(relativePath)) continue;
      results.push(absolutePath);
    }
  }
  return results.sort((a, b) => toPosix(path.relative(root, a)).localeCompare(toPosix(path.relative(root, b))));
}

function shouldExclude(relativePath, dirent) {
  const normalized = toPosix(relativePath);
  const basename = path.posix.basename(normalized);
  if (!normalized) return false;
  if (alwaysExcludedFiles.has(normalized) || alwaysExcludedFiles.has(basename)) return true;
  if (alwaysExcludedPrefixes.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))) return true;
  if (basename.endsWith(".log") || basename.endsWith(".pid") || basename.endsWith(".zip")) return true;
  if (isEnvFile(normalized)) return true;
  if (dirent.isDirectory() && ["node_modules", ".git", "dist"].includes(basename)) return true;
  return false;
}

function shouldIncludeReviewFile(relativePath) {
  const normalized = toPosix(relativePath);
  return reviewFileAllowlist.has(normalized) || reviewPrefixAllowlist.some((prefix) => normalized.startsWith(prefix));
}

function isEnvFile(relativePath) {
  const basename = path.posix.basename(relativePath);
  if (basename === ".env.example") return false;
  return basename === ".env" || basename.startsWith(".env.");
}

function sanitizeReviewJson(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizeReviewJson(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeReviewJson(childValue, childKey)])
    );
  }
  if (typeof value !== "string") return value;
  let text = value;
  if (["source", "sourceFile"].includes(key) && isLocalPath(text)) {
    text = `review-sample/${path.basename(text)}`;
  }
  return sanitizeText(text);
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[redacted-openai-key]")
    .replace(/OPENAI_API_KEY[ \t]*=[ \t]*[^\s]+/g, "OPENAI_API_KEY=[redacted]")
    .replace(/\/Users\/[^/\s"'`),]+\/[^\s"'`),]+/g, "[local path removed]")
    .replace(/[A-Za-z]:\\Users\\[^\\\s"'`),]+\\[^\s"'`),]+/g, "[local path removed]");
}

function isLocalPath(value) {
  return /^\/Users\//.test(value) || /^[A-Za-z]:\\Users\\/.test(value);
}

function buildManifest(zipEntries) {
  const relativeFiles = zipEntries.map((entry) => entry.path.replace(`${packageBaseName}/`, ""));
  const markdown = [
    "# Review Package Manifest",
    "",
    `Package: ${packageBaseName}`,
    `Created: ${new Date().toISOString()}`,
    "",
    "## Purpose",
    "",
    "This ZIP is a sanitized internal review package for AI Workflow Discovery Studio. It is intended for code, logic, and local install review before broader colleague testing.",
    "",
    "## Excluded By Design",
    "",
    "- `.env.local` and other local secret files",
    "- `.git`",
    "- `node_modules`",
    "- `dist`",
    "- generated server sessions and packages under `discovery-intake-webapp/data`",
    "- local test screenshots, workbooks, and regression outputs under `discovery-intake-webapp/test-outputs` except sanitized demo extraction JSON",
    "- root `outputs` and extracted DOCX scratch folders",
    "- logs, PID files, and ZIP files",
    "",
    "## Enterprise Transfer Files",
    "",
    "- Enterprise deployment, GitHub, Microsoft 365 connector, environment, and v1 release docs",
    "- Machine-readable enterprise environment, Microsoft 365 permission, GitHub repository, and readiness gate contracts",
    "- GitHub Actions validation workflow for private work-repository setup",
    "",
    "## Included Files",
    "",
    ...relativeFiles.map((file) => `- ${file}`),
    ""
  ].join("\n");
  return { markdown };
}

function validateEntries(zipEntries) {
  const failures = [];
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
    "/discovery-intake-webapp/test-outputs/enterprise-readiness/",
    "/discovery-intake-webapp/test-outputs/handoff-package-contract/"
  ];
  for (const entry of zipEntries) {
    const entryPath = `/${entry.path}`;
    if (entry.path.includes(".env.local") || entry.path.endsWith("/.env")) {
      failures.push(`forbidden environment file included: ${entry.path}`);
    }
    for (const part of forbiddenPathParts) {
      if (entryPath.includes(part)) failures.push(`forbidden generated path included: ${entry.path}`);
    }
    const text = entry.bytes.toString("utf8");
    const localHomeNeedle = "/Users/" + "mayankpandey";
    if (text.includes(localHomeNeedle)) failures.push(`local absolute path leaked in ${entry.path}`);
    if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) failures.push(`possible API key leaked in ${entry.path}`);
    if (/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/.test(text)) failures.push(`possible GitHub token leaked in ${entry.path}`);
    if (/\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(text)) failures.push(`possible GitHub fine-grained token leaked in ${entry.path}`);
    if (/^[ \t]*OPENAI_API_KEY[ \t]*=[ \t]*(?!($|your-approved-key|\.\.\.|\[redacted\]))\S+/m.test(text)) {
      failures.push(`non-placeholder OPENAI_API_KEY value found in ${entry.path}`);
    }
    if (/^[ \t]*(MICROSOFT_CLIENT_SECRET|GITHUB_TOKEN|GITHUB_PAT|AZURE_CLIENT_SECRET)[ \t]*=[ \t]*(?!($|<|your-|approved-|enterprise-|\.{3}|\[redacted\]))\S+/m.test(text)) {
      failures.push(`non-placeholder enterprise secret value found in ${entry.path}`);
    }
  }
  return {
    status: failures.length ? "fail" : "pass",
    failures,
    checkedFiles: zipEntries.length
  };
}

function createZip(zipEntries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of zipEntries) {
    const nameBytes = Buffer.from(entry.path, "utf8");
    const sourceBytes = Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes);
    const compressedBytes = zlib.deflateRawSync(sourceBytes, { level: 9 });
    const useCompressed = compressedBytes.length < sourceBytes.length;
    const payload = useCompressed ? compressedBytes : sourceBytes;
    const crc = crc32(sourceBytes);
    const { dosTime, dosDate } = dosDateTime(entry.mtime || new Date());
    const method = useCompressed ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(sourceBytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBytes, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(sourceBytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((((entry.mode || 0o100644) & 0xffff) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(zipEntries.length, 8);
  end.writeUInt16LE(zipEntries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localDirectory.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localDirectory, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
  });
}

function dosDateTime(value) {
  const date = new Date(value);
  const year = Math.max(1980, date.getFullYear());
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function toPosix(value) {
  return String(value || "").split(path.sep).join("/");
}
