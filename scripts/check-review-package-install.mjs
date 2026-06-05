import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const args = parseArgs(process.argv.slice(2));
const zipPath = path.resolve(args.zipPath || latestReviewZipPath());
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const installBase = path.resolve(args.installDir || path.join(os.homedir(), "Downloads", `ai-workflow-discovery-studio-install-test-${stamp}`));
const copyLocalEnv = args.copyLocalEnv || process.env.COPY_LOCAL_ENV === "1";
const sourceEnvPath = path.resolve(process.env.REVIEW_INSTALL_ENV_PATH || path.join(root, "discovery-intake-webapp", ".env.local"));
let serverProcess = null;

if (!zipPath || !fsSync.existsSync(zipPath)) {
  console.error("FAIL No review ZIP found. Run: node scripts/build-review-package.mjs");
  process.exit(1);
}

try {
  await runNode(["scripts/check-review-package.mjs", zipPath], root);
  const packageDir = await extractReviewZip(zipPath, installBase);
  await maybeCopyLocalEnv(packageDir);
  const port = args.port || await findAvailablePort(5179);
  const appUrl = `http://localhost:${port}`;
  await runNode(["scripts/check-local-setup.mjs", "--no-health"], packageDir, { APP_URL: appUrl });
  await ensureInstallDevDependencies(packageDir);

  serverProcess = startInstallServer(packageDir, port);
  await waitForHealth(appUrl);
  await assertRootPage(appUrl);
  await runNode(["scripts/check-local-setup.mjs", "--health"], packageDir, { APP_URL: appUrl });
  await runNode(["scripts/check-enterprise-readiness-brief.mjs"], packageDir, { APP_URL: appUrl });
  await runNode(["scripts/check-handoff-package-contract.mjs"], packageDir, { APP_URL: appUrl });

  console.log(`OK clean install validation passed at ${packageDir}`);
  console.log(`OK clean install URL: ${appUrl}/`);
} finally {
  await stopServer();
}

function parseArgs(values = []) {
  const parsed = {
    copyLocalEnv: false,
    installDir: "",
    port: "",
    zipPath: ""
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--copy-local-env" || value === "--with-local-env") {
      parsed.copyLocalEnv = true;
    } else if (value === "--install-dir") {
      parsed.installDir = values[index + 1] || "";
      index += 1;
    } else if (value === "--port") {
      parsed.port = values[index + 1] || "";
      index += 1;
    } else if (!value.startsWith("--") && !parsed.zipPath) {
      parsed.zipPath = value;
    }
  }
  return parsed;
}

function latestReviewZipPath() {
  if (!fsSync.existsSync(distDir)) return "";
  const candidates = fsSync.readdirSync(distDir)
    .filter((name) => /^ai-workflow-discovery-studio-review-.*\.zip$/.test(name))
    .map((name) => path.join(distDir, name))
    .sort((a, b) => fsSync.statSync(b).mtimeMs - fsSync.statSync(a).mtimeMs);
  return candidates[0] || "";
}

async function extractReviewZip(sourceZipPath, targetBase) {
  const zipBytes = await fs.readFile(sourceZipPath);
  const entries = parseZipEntries(zipBytes);
  const packageRoots = uniqueTopLevelFolders(entries.map((entry) => entry.name));
  if (packageRoots.length !== 1) {
    throw new Error(`Expected one top-level package folder; found ${packageRoots.join(", ") || "none"}.`);
  }

  const packageRoot = packageRoots[0];
  const packageDir = path.join(targetBase, packageRoot);
  await fs.rm(packageDir, { recursive: true, force: true });

  for (const entry of entries) {
    const targetPath = safeJoin(targetBase, entry.name);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, entry.bytes);
    if (entry.mode) await fs.chmod(targetPath, entry.mode & 0o777).catch(() => {});
  }

  console.log(`OK review package extracted to ${packageDir}`);
  return packageDir;
}

async function maybeCopyLocalEnv(packageDir) {
  if (!copyLocalEnv) {
    console.log("WARN clean install did not copy .env.local; live AI health may be warning-only.");
    return;
  }
  if (!fsSync.existsSync(sourceEnvPath)) {
    console.log("WARN requested .env.local copy, but no local env file was found.");
    return;
  }
  const targetEnvPath = path.join(packageDir, "discovery-intake-webapp", ".env.local");
  await fs.copyFile(sourceEnvPath, targetEnvPath);
  await fs.chmod(targetEnvPath, 0o600).catch(() => {});
  console.log("OK copied local .env.local for install validation without printing it");
}

async function ensureInstallDevDependencies(packageDir) {
  const installNodeModules = path.join(packageDir, "node_modules");
  if (fsSync.existsSync(installNodeModules)) {
    console.log("OK clean install dependencies already available");
    return;
  }
  const sourceNodeModules = path.join(root, "node_modules");
  if (!fsSync.existsSync(sourceNodeModules)) {
    console.log("WARN Playwright dependency is not installed in the clean folder. Run npm install before browser smokes on a fresh machine.");
    return;
  }
  await fs.symlink(sourceNodeModules, installNodeModules, "dir");
  console.log("OK linked local dev dependencies for clean-install smoke; node_modules remains excluded from the review ZIP");
}

function safeJoin(base, relativePath) {
  const targetPath = path.resolve(base, relativePath);
  const normalizedBase = path.resolve(base);
  if (targetPath !== normalizedBase && !targetPath.startsWith(`${normalizedBase}${path.sep}`)) {
    throw new Error(`Unsafe ZIP entry path: ${relativePath}`);
  }
  return targetPath;
}

function startInstallServer(packageDir, port) {
  const appDir = path.join(packageDir, "discovery-intake-webapp");
  console.log(`Starting AI Workflow Discovery Studio on http://localhost:${port}/`);
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("exit", (code) => {
    if (serverProcess === child && code && code !== 0) {
      console.error(`FAIL install server exited with code ${code}`);
    }
  });
  return child;
}

async function stopServer() {
  if (!serverProcess) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(termTimer);
      clearTimeout(killTimer);
      resolve();
    };
    const termTimer = setTimeout(() => {
      if (!settled) serverProcess.kill("SIGTERM");
    }, 1000);
    const killTimer = setTimeout(() => {
      if (!settled) {
        serverProcess.kill("SIGKILL");
        finish();
      }
    }, 3000);
    serverProcess.once("exit", finish);
    serverProcess.kill("SIGINT");
  });
  serverProcess = null;
}

async function waitForHealth(appUrl) {
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${appUrl}/api/health`);
      const payload = await response.json();
      if (response.ok && payload.ok) {
        console.log(`OK clean install health responded at ${appUrl}`);
        return payload;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Clean install server did not become healthy: ${lastError?.message || "no health response"}`);
}

async function assertRootPage(appUrl) {
  const response = await fetch(appUrl);
  if (!response.ok) throw new Error(`Root page returned HTTP ${response.status}`);
  const text = await response.text();
  if (!text.includes("Discovery Intake Studio")) throw new Error("Root page did not look like the AI Workflow Discovery Studio app.");
  console.log(`OK clean install root page returned HTTP ${response.status}`);
}

async function findAvailablePort(startPort) {
  for (let port = Number(startPort); port < Number(startPort) + 40; port += 1) {
    if (await portIsAvailable(port)) return String(port);
  }
  throw new Error(`No available local port found starting at ${startPort}.`);
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function runNode(commandArgs, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${commandArgs.join(" ")} failed with code ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`);
}

function uniqueTopLevelFolders(names) {
  return [...new Set(names.map((name) => name.split("/")[0]).filter(Boolean))];
}
