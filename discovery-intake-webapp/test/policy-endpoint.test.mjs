// V3-3 — executed HTTP tests for the policy upload endpoint. Boots the real
// server.mjs as a child process with a temp DATA_DIR and AI keys EXPLICITLY
// emptied (same contract as server-http.test.mjs), proving the path needs NO
// live model: /api/extract-policy reuses readMultipartFile + extractDocumentText
// and returns RAW TEXT only — deterministic clause segmentation is client-side.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");
const PORT = Number(process.env.POLICY_TEST_PORT || 5223);

// Neutral policy text — no firm names.
const NEUTRAL_POLICY = `AI Use Policy

1. Data Handling. All client data processed by AI tools must be stored only in approved systems.
2. Human Review. A qualified person must review and approve AI output before it is relied upon.`;

async function bootServer() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "discovery-policy-test-"));
  const proc = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      // Override (not just omit) the AI keys so neither the shell nor a .env file
      // can let this path reach a model — the endpoint must be fully offline.
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      AUTH_ENABLED: "false",
      PORT: String(PORT)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const base = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { proc, base, dataDir };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  proc.kill();
  throw new Error("server did not become healthy in time");
}

async function stopServer(handle) {
  handle.proc.kill();
  await rm(handle.dataDir, { recursive: true, force: true });
}

let server;

before(async () => {
  server = await bootServer();
});

after(async () => {
  if (server) await stopServer(server);
});

test("POST /api/extract-policy returns the policy text for a neutral .txt upload", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([NEUTRAL_POLICY], { type: "text/plain" }), "ai-policy.txt");
  const res = await fetch(`${server.base}/api/extract-policy`, { method: "POST", body: fd });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.fileName, "ai-policy.txt");
  assert.equal(typeof payload.text, "string");
  assert.ok(payload.text.includes("Data Handling"), "the policy text is returned verbatim");
  assert.ok(payload.text.includes("Human Review"));
});

test("POST /api/extract-policy soft-fails (no throw) on a non-multipart body", async () => {
  const res = await fetch(`${server.base}/api/extract-policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ not: "multipart" })
  });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, false);
  assert.ok(typeof payload.error === "string" && payload.error.length > 0);
});

test("POST /api/extract-policy rejects an image upload", async () => {
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "logo.png");
  const res = await fetch(`${server.base}/api/extract-policy`, { method: "POST", body: fd });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, false);
  assert.ok(/image/i.test(payload.error), "the error explains a policy must be a text document, not an image");
});
