// Executed HTTP tests: boot the real server.mjs as a child process and exercise
// the session API + auth gate over the wire. See test/README.md for the env
// contract — in short: a temp DATA_DIR (the real data/sessions.db is never
// touched), a port away from dev's 5173, and AI keys EXPLICITLY overridden to
// empty in the spawn env so neither the parent shell nor a .env file can let a
// test reach OpenAI/Anthropic (dotenv never overrides keys already present).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");
const PORT = Number(process.env.TEST_PORT || 5199);
const AUTH_PORT = PORT - 1;

async function bootServer(extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "discovery-test-"));
  const proc = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      // Explicitly override (not just omit) the AI keys: values already present
      // in the env win over .env, so this guarantees no network calls.
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      AUTH_ENABLED: "false",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const port = Number(extraEnv.PORT || PORT);
  const base = `http://127.0.0.1:${port}`;
  // Poll /health until the server is accepting connections (max ~10s).
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

function sessionState(id, workflowName, stepNames) {
  return {
    sessionMeta: { id, name: workflowName, workflowName, updatedAt: new Date().toISOString() },
    fields: { workflowName },
    workflowGrid: {
      schemaVersion: 1,
      workflowName,
      stepListLocked: false,
      steps: stepNames.map((name, index) => ({
        id: `gridstep-${id}-${index}`,
        nextStepId: "",
        cells: { name: { value: name, state: "confirmed", confidence: 0.9 } }
      }))
    }
  };
}

let server;

before(async () => {
  server = await bootServer({ PORT: String(PORT) });
});

after(async () => {
  if (server) await stopServer(server);
});

test("session load returns the requested session id, fully populated", async () => {
  const state = sessionState("sess-a", "Alpha Reconciliation", ["Collect exceptions", "Match records"]);
  const save = await fetch(`${server.base}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state })
  });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.ok, true);
  assert.equal(saved.summary.id, "sess-a");

  const load = await fetch(`${server.base}/api/sessions/sess-a`);
  assert.equal(load.status, 200);
  const payload = await load.json();
  assert.equal(payload.summary.id, "sess-a");
  assert.equal(payload.workflowName, "Alpha Reconciliation");
  assert.equal(payload.state.workflowGrid.workflowName, "Alpha Reconciliation");
  assert.equal(payload.state.workflowGrid.steps.length, 2);
  assert.equal(payload.state.workflowGrid.steps[0].cells.name.value, "Collect exceptions");
  assert.equal(payload.outcomeStatus, "not_started");
});

test("loading session A then B returns B's data only (PR 29 regression)", async () => {
  const stateA = sessionState("sess-iso-a", "Workshop Use Case Deep Dive", ["Plan workshop"]);
  const stateB = sessionState("sess-iso-b", "Sales Email Reporting", ["Collect sales emails", "Enter data", "Send report"]);
  for (const state of [stateA, stateB]) {
    const res = await fetch(`${server.base}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
    assert.equal(res.status, 200);
  }

  // Load A first, then B — B's payload must contain only B's data.
  const loadA = await (await fetch(`${server.base}/api/sessions/sess-iso-a`)).json();
  assert.equal(loadA.state.workflowGrid.workflowName, "Workshop Use Case Deep Dive");

  const loadB = await (await fetch(`${server.base}/api/sessions/sess-iso-b`)).json();
  assert.equal(loadB.summary.id, "sess-iso-b");
  assert.equal(loadB.state.workflowGrid.workflowName, "Sales Email Reporting");
  assert.equal(loadB.state.workflowGrid.steps.length, 3);
  const names = loadB.state.workflowGrid.steps.map((step) => step.cells.name.value);
  assert.deepEqual(names, ["Collect sales emails", "Enter data", "Send report"]);
  assert.ok(!JSON.stringify(loadB).includes("Workshop Use Case Deep Dive"), "B's payload must not leak A's data");
});

test("/health returns ok and bypasses the auth gate", async () => {
  const authServer = await bootServer({
    PORT: String(AUTH_PORT),
    AUTH_ENABLED: "true",
    AUTH_AZURE_TENANT_ID: "test-tenant",
    AUTH_AZURE_CLIENT_ID: "test-client",
    AUTH_AZURE_CLIENT_SECRET: "test-secret",
    AUTH_SESSION_SECRET: "test-session-secret-0123456789abcdef"
  });
  try {
    const health = await fetch(`${authServer.base}/health`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);

    // Prove the gate was actually armed: a session API call without a cookie
    // must be rejected — /health passing is a bypass, not a disabled gate.
    const gated = await fetch(`${authServer.base}/api/sessions`);
    assert.equal(gated.status, 401);
    const gatedBody = await gated.json();
    assert.equal(gatedBody.error, "auth_required");
  } finally {
    await stopServer(authServer);
  }
});
