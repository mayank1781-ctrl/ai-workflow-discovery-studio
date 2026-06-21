// Executed HTTP tests: boot the real server.mjs as a child process and exercise
// the session API + auth gate over the wire. See test/README.md for the env
// contract — in short: a temp DATA_DIR (the real data/sessions.db is never
// touched), a port away from dev's 5173, and AI keys EXPLICITLY overridden to
// empty in the spawn env so neither the parent shell nor a .env file can let a
// test reach OpenAI/Anthropic (dotenv never overrides keys already present).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { extractFunction } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");

// Build a real .xlsx buffer (ZIP container) for the upload-isolation tests.
function xlsxBuffer() {
  const sheet = XLSX.utils.aoa_to_sheet([["Step", "Owner"], ["Reconcile", "Ops"], ["Approve", "Manager"]]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Tracker");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}
async function uploadFile(base, route, buffer, filename) {
  const fd = new FormData();
  fd.append("file", new Blob([buffer]), filename);
  const res = await fetch(`${base}${route}`, { method: "POST", body: fd });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
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

test("/api/business-case computes a snapshot with computedAt on explicit request", async () => {
  const res = await fetch(`${server.base}/api/business-case`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      steps: [{ cells: { frequencyVolume: { value: "10 times per week" }, timeTaken: { value: "30 minutes" } } }],
      conversationText: "part of my job, every week",
      userRole: "analyst"
    })
  });
  assert.equal(res.status, 200);
  const { snapshot } = await res.json();
  assert.equal(snapshot.rateSource, "role");
  assert.equal(snapshot.rate, 75);
  assert.equal(snapshot.formulaVersion, 1);
  assert.ok(snapshot.computedAt, "endpoint stamps computedAt");
  assert.ok(!Number.isNaN(Date.parse(snapshot.computedAt)), "computedAt is a valid timestamp");
  // No steps → 400, never a silent default figure.
  const bad = await fetch(`${server.base}/api/business-case`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps: [] })
  });
  assert.equal(bad.status, 400);
});

test("B1 — studio_engine.mjs is served with a JavaScript MIME type (the browser import works)", async () => {
  // Regression for the audit blocker: .mjs was served as application/octet-stream, so strict
  // browsers refused to import the engine — window.StudioEngine never set, rails failed soft.
  const res = await fetch(`${server.base}/studio_engine.mjs`);
  assert.equal(res.status, 200, "the engine module is served");
  const ct = res.headers.get("content-type") || "";
  assert.match(ct, /^text\/javascript\b/, `.mjs must be a JS module MIME, got "${ct}"`);
  assert.doesNotMatch(ct, /octet-stream/, ".mjs must not be served as octet-stream (browsers refuse the import)");
  // A classic .js asset still serves with a JS MIME (no regression).
  const js = await fetch(`${server.base}/app.js`);
  assert.match(js.headers.get("content-type") || "", /javascript/, "app.js still serves as JavaScript");
});

test("M10 — looksLikeSpreadsheet only accepts real ZIP/OLE2 magic (format restriction)", async () => {
  const src = await readFile(SERVER, "utf8");
  const looksLikeSpreadsheet = eval(`(${extractFunction(src, "looksLikeSpreadsheet")})`);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);          // PK\x03\x04 (.xlsx)
  const ole2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy .xls
  assert.equal(looksLikeSpreadsheet(zip), true, "a ZIP container is accepted");
  assert.equal(looksLikeSpreadsheet(ole2), true, "an OLE2 container is accepted");
  assert.equal(looksLikeSpreadsheet(Buffer.from("not a spreadsheet at all")), false, "arbitrary text is rejected");
  assert.equal(looksLikeSpreadsheet(Buffer.from([0x50, 0x4b])), false, "a too-short buffer is rejected");
  assert.equal(looksLikeSpreadsheet(Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0])), false, "a PDF magic is not a spreadsheet");
});

test("M10 — a VALID spreadsheet is parsed (in an isolated worker), end to end", async () => {
  const { status, body } = await uploadFile(server.base, "/api/extract-policy", xlsxBuffer(), "tracker.xlsx");
  assert.equal(status, 200);
  assert.equal(body.success, true, "a real workbook still parses");
  assert.match(body.text, /Reconcile/, "the cell content comes through");
  assert.match(body.text, /Sheet: Tracker/, "the sheet is labelled");
});

test("M10 — a MALFORMED spreadsheet is rejected safely, not parsed", async () => {
  // Declared .xlsx, but the bytes are not a ZIP/OLE2 container — the format check rejects it
  // before the parser ever sees it.
  const junk = Buffer.from("this is absolutely not a spreadsheet, just plain bytes ".repeat(50));
  const { status, body } = await uploadFile(server.base, "/api/extract-policy", junk, "evil.xlsx");
  assert.equal(status, 200);
  assert.equal(body.success, false, "the malformed workbook is rejected");
  assert.ok(/couldn'?t read|could not|reject/i.test(body.error || ""), "a safe error message, not a crash");
});

test("M10 — an OVERSIZED spreadsheet is rejected (size cap before parsing)", async () => {
  // A buffer that starts with a valid ZIP magic but exceeds the 8 MB spreadsheet cap.
  const big = Buffer.alloc(9_000_000, 0x41);
  big[0] = 0x50; big[1] = 0x4b; big[2] = 0x03; big[3] = 0x04;
  const { status, body } = await uploadFile(server.base, "/api/extract-policy", big, "huge.xlsx");
  assert.equal(status, 200);
  assert.equal(body.success, false, "the oversized workbook is rejected");
});

test("M9 — demo mode is visibly flagged and REFUSES runtime key-setting (no health flip)", async () => {
  // The default test server runs AUTH_ENABLED=false (demo / unauthenticated).
  const h0 = await (await fetch(`${server.base}/api/health`)).json();
  assert.equal(h0.demoMode, true, "demo mode is surfaced to the client");

  // An unauthenticated runtime key-set is REJECTED (the audit's planted-key probe). The old
  // behaviour returned 200 {ok:true} and mutated the runtime key; now it is 403.
  const res = await fetch(`${server.base}/api/settings/apikey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "sk-planted-fake-key-1234567890" })
  });
  assert.equal(res.status, 403, "unauthenticated key-set is rejected");
  const body = await res.json();
  assert.equal(body.error, "auth_required");

  // The rejected request did NOT change the configured state (no planted-key flip).
  const h1 = await (await fetch(`${server.base}/api/health`)).json();
  assert.equal(h1.aiConfigured, h0.aiConfigured, "the rejected key-set did not flip health");
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

    // PR 32: the business-case engine sits behind the same gate — not a
    // /health-style bypass.
    const gatedBc = await fetch(`${authServer.base}/api/business-case`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: [{ cells: {} }] })
    });
    assert.equal(gatedBc.status, 401, "/api/business-case requires auth when the gate is armed");

    // M9 — the runtime key-setter is also behind the gate when auth is armed (no cookie -> 401),
    // and AUTH_ENABLED=true is NOT demo mode.
    const gatedKey = await fetch(`${authServer.base}/api/settings/apikey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-planted-fake-key-1234567890" })
    });
    assert.equal(gatedKey.status, 401, "key-setting requires auth when the gate is armed");
    const armedHealth = await (await fetch(`${authServer.base}/api/health`)).json();
    assert.equal(armedHealth.demoMode, false, "auth-enabled is not demo mode");
  } finally {
    await stopServer(authServer);
  }
});
