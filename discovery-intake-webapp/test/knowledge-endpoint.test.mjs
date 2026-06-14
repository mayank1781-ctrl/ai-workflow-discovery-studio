// V3-7 — knowledge-library HTTP endpoints. Boots the real server.mjs as a child
// process against a throwaway DATA_DIR (the real data/sessions.db is never
// touched) with AI keys explicitly emptied, then exercises the additive
// /api/knowledge CRUD over the wire. Mirrors test/server-http.test.mjs.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");
// 5230: away from every other test's server port (telemetry 5191/5192,
// migrations 5197/5207/5217, server-http 5198/5199, policy 5223) so the full
// parallel suite never hits EADDRINUSE.
const PORT = Number(process.env.TEST_KNOWLEDGE_PORT || 5230);

async function bootServer() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "discovery-knowledge-test-"));
  const proc = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      AUTH_ENABLED: "false",
      PORT: String(PORT)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const base = `http://127.0.0.1:${PORT}`;
  // Generous budget (≈30s): returns the instant /health is ok, but tolerates the
  // slow cold-start of a second child server under full-suite parallel load.
  for (let i = 0; i < 300; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { proc, base, dataDir };
    } catch {
      // not up yet — fall through to the wait
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  proc.kill();
  throw new Error("server did not become healthy in time");
}

// A versioned entry exactly as the client builds it (append-only frozen versions).
function entry(id, name, versions) {
  return {
    id,
    name,
    kind: versions[versions.length - 1].kind,
    versions,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z"
  };
}
function version(n, body, kind = "framework") {
  return { version: n, name: "n", body, originalSource: "Risk Policy 4", kind, updatedAt: "2026-06-14T00:00:00.000Z" };
}

async function post(base, body) {
  return fetch(`${base}/api/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

let server;
before(async () => { server = await bootServer(); });
after(async () => { if (server) { server.proc.kill(); await rm(server.dataDir, { recursive: true, force: true }); } });

test("fresh DATA_DIR: the additive knowledge table starts empty (no effect on baseline)", async () => {
  const res = await fetch(`${server.base}/api/knowledge`);
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.deepEqual(payload.entries, [], "no entries until one is explicitly saved");
});

test("save then list round-trips the versioned entry with its version history intact", async () => {
  const e = entry("know-alpha", "Credit decision framework", [version(1, "Step 1"), version(2, "Step 1 and 2")]);
  const save = await post(server.base, { entry: e });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.ok, true);
  assert.equal(saved.entry.id, "know-alpha");

  const list = await (await fetch(`${server.base}/api/knowledge`)).json();
  const got = list.entries.find((x) => x.id === "know-alpha");
  assert.ok(got, "the saved entry is listed");
  assert.equal(got.versions.length, 2, "both versions persisted (server is dumb storage)");
  assert.equal(got.versions[0].body, "Step 1", "prior version intact");
  assert.equal(got.versions[1].body, "Step 1 and 2");
});

test("re-saving the same id replaces the row (INSERT OR REPLACE), keeping the latest entry", async () => {
  await post(server.base, { entry: entry("know-beta", "Standard", [version(1, "v1", "standard")]) });
  await post(server.base, { entry: entry("know-beta", "Standard", [version(1, "v1", "standard"), version(2, "v2", "standard")]) });
  const list = await (await fetch(`${server.base}/api/knowledge`)).json();
  const betas = list.entries.filter((x) => x.id === "know-beta");
  assert.equal(betas.length, 1, "one row per id");
  assert.equal(betas[0].versions.length, 2, "the latest entry (with both versions) is stored");
});

test("save rejects a missing id or missing name with 400", async () => {
  const noId = await post(server.base, { entry: { name: "No id", versions: [version(1, "x")] } });
  assert.equal(noId.status, 400);
  const noName = await post(server.base, { entry: { id: "know-noname", name: "   ", versions: [version(1, "x")] } });
  assert.equal(noName.status, 400);
  const noEntry = await post(server.base, {});
  assert.equal(noEntry.status, 400);
});

test("delete removes the entry from the library", async () => {
  await post(server.base, { entry: entry("know-del", "Removable", [version(1, "x")]) });
  let list = await (await fetch(`${server.base}/api/knowledge`)).json();
  assert.ok(list.entries.some((x) => x.id === "know-del"), "present before delete");

  const del = await fetch(`${server.base}/api/knowledge/know-del`, { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.equal((await del.json()).ok, true);

  list = await (await fetch(`${server.base}/api/knowledge`)).json();
  assert.ok(!list.entries.some((x) => x.id === "know-del"), "absent after delete");
});
