// V3-1 — executed tests for local usage telemetry.
//   * sanitizeTelemetryEvent is the privacy gatekeeper: free text can NEVER
//     survive, unknown event types are rejected, numerics are coerced/clamped,
//     and only the typed columns are ever emitted.
//   * end-to-end: boot the real server with a temp DATA_DIR, POST events over
//     the wire, and read back privacy-safe aggregates from the summary endpoint.
//
// The temp DATA_DIR means the real data/sessions.db is never touched, and AI
// keys are forced empty so no network call can happen (mirrors server-http.test).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, readServerSource, buildSandbox } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");

// ---- privacy gatekeeper (pure, no DB) --------------------------------------
function sanitizerSandbox() {
  return buildSandbox(readServerSource(), {
    consts: ["TELEMETRY_EVENT_TYPES", "TELEMETRY_LABEL_ALLOWLIST", "TELEMETRY_SESSION_KEY_RE"],
    functions: ["telemetryLabel", "telemetryInt", "telemetryNum", "sanitizeTelemetryEvent"]
  });
}

const TYPED_KEYS = [
  "event_type", "session_key", "label_a", "label_b",
  "count_a", "count_b", "value_num", "duration_ms", "source"
].sort();

test("sanitize: a valid event keeps only the typed columns", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  const e = sanitizeTelemetryEvent({
    event_type: "readiness_label_produced",
    session_key: "session-abc123",
    label_a: "Usable with caveats",
    value_num: 72,
    count_a: 5
  }, "client");
  assert.ok(e);
  assert.deepEqual(Object.keys(e).sort(), TYPED_KEYS);
  assert.equal(e.event_type, "readiness_label_produced");
  assert.equal(e.session_key, "session-abc123");
  assert.equal(e.label_a, "Usable with caveats");
  assert.equal(e.value_num, 72);
  assert.equal(e.count_a, 5);
  assert.equal(e.source, "client");
});

test("sanitize: an unknown event type is rejected entirely", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  assert.equal(sanitizeTelemetryEvent({ event_type: "exfiltrate_notes", label_a: "interview" }, "client"), null);
  assert.equal(sanitizeTelemetryEvent({}, "client"), null);
  assert.equal(sanitizeTelemetryEvent(null, "client"), null);
});

test("sanitize: free text NEVER survives in any field", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  const e = sanitizeTelemetryEvent({
    event_type: "intake_method_chosen",
    session_key: "the client's confidential workflow notes",   // not the id pattern
    label_a: "Reconcile ACME payroll variances before close",  // free text, not an enum
    label_b: "PII: 123-45-6789",
    // hostile extra fields that must be ignored entirely:
    description: "Customer asked us to summarise their merger memo",
    raw_text: "secret",
    note: "do not store"
  }, "client");
  assert.ok(e);
  assert.equal(e.session_key, null, "non-conforming session_key dropped");
  assert.equal(e.label_a, null, "free-text label dropped");
  assert.equal(e.label_b, null, "free-text label dropped");
  // No hostile field leaks through — only the typed columns exist.
  assert.deepEqual(Object.keys(e).sort(), TYPED_KEYS);
  const serialized = JSON.stringify(e);
  assert.ok(!/confidential|ACME|merger|secret|PII|payroll/i.test(serialized), "no free text anywhere in the record");
});

test("sanitize: numerics are coerced and out-of-range/garbage becomes null", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  const e = sanitizeTelemetryEvent({
    event_type: "workflow_extracted",
    count_a: "7",            // numeric string -> 7
    count_b: -3,             // negative -> null
    value_num: 0.82,         // kept
    duration_ms: 999999999999 // out of range -> null
  }, "client");
  assert.equal(e.count_a, 7);
  assert.equal(e.count_b, null);
  assert.equal(e.value_num, 0.82);
  assert.equal(e.duration_ms, null);

  const bad = sanitizeTelemetryEvent({ event_type: "workflow_extracted", value_num: "not a number" }, "client");
  assert.equal(bad.value_num, null);
});

test("sanitize: source is constrained to client|server", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  assert.equal(sanitizeTelemetryEvent({ event_type: "bundle_built" }, "server").source, "server");
  assert.equal(sanitizeTelemetryEvent({ event_type: "bundle_built" }, "anything-else").source, "client");
});

// ---- end-to-end over the wire ----------------------------------------------
async function bootServer(extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telemetry-test-"));
  // Unique port: migrations.test uses 5197/5207/5217, server-http uses 5198/5199.
  const port = Number(extraEnv.PORT || process.env.TEST_TELEMETRY_PORT || 5191);
  const proc = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATA_DIR: dataDir, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", AUTH_ENABLED: "false", PORT: String(port), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return { proc, base, dataDir };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  throw new Error("server did not become healthy in time");
}

let server;
before(async () => { server = await bootServer(); });
after(async () => { server.proc.kill(); await rm(server.dataDir, { recursive: true, force: true }); });

const post = (body) => fetch(`${server.base}/api/telemetry`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

test("e2e: valid events are recorded and surface in privacy-safe aggregates", async () => {
  const events = [
    { event_type: "intake_method_chosen", session_key: "session-e2e-1", label_a: "interview" },
    { event_type: "intake_method_chosen", session_key: "session-e2e-2", label_a: "upload" },
    { event_type: "readiness_label_produced", session_key: "session-e2e-1", label_a: "Draft until confirmed", value_num: 41 },
    { event_type: "readiness_label_produced", session_key: "session-e2e-2", label_a: "Usable with caveats", value_num: 67 },
    { event_type: "artifact_recommended", session_key: "session-e2e-1", label_a: "customGPT", count_a: 4, count_b: 2 }
  ];
  for (const e of events) {
    const r = await post(e);
    assert.equal(r.status, 200, `${e.event_type} accepted`);
  }
  const summary = await (await fetch(`${server.base}/api/telemetry/summary`)).json();
  assert.ok(summary.total >= 5);
  assert.equal(summary.byType.intake_method_chosen, 2);
  assert.equal(summary.byType.readiness_label_produced, 2);
  assert.equal(summary.intakeMethodDistribution.interview, 1);
  assert.equal(summary.intakeMethodDistribution.upload, 1);
  assert.equal(summary.readinessDistribution["Draft until confirmed"], 1);
  assert.equal(summary.readinessDistribution["Usable with caveats"], 1);
  assert.equal(summary.recommendedSurfaceDistribution.customGPT, 1);
});

test("e2e: an unknown event type is rejected with 400 and not stored", async () => {
  const before = await (await fetch(`${server.base}/api/telemetry/summary`)).json();
  const r = await post({ event_type: "steal_workflow_text", label_a: "interview" });
  assert.equal(r.status, 400);
  const after = await (await fetch(`${server.base}/api/telemetry/summary`)).json();
  assert.equal(after.total, before.total, "rejected event did not change the row count");
});

test("e2e: free text in a label is dropped, never appears in the summary", async () => {
  await post({ event_type: "intake_method_chosen", session_key: "session-e2e-3", label_a: "Acme Corp confidential reconciliation" });
  const summary = await (await fetch(`${server.base}/api/telemetry/summary`)).json();
  const serialized = JSON.stringify(summary);
  assert.ok(!/Acme|confidential|reconciliation/i.test(serialized), "free-text label never reaches the aggregates");
  // The event still counted as an intake event; its label was simply nulled.
  assert.ok(summary.byType.intake_method_chosen >= 2);
});

// ---- client recorder (defensive + content-free) ----------------------------
function clientSandbox(fetchStub) {
  const globals = { state: { sessionMeta: { id: "session-client-1" } }, console };
  if (fetchStub !== undefined) globals.fetch = fetchStub;
  return buildSandbox(readAppSource(), { functions: ["recordTelemetryClient"], globals });
}

test("client: recordTelemetryClient posts only the typed fields, never content", () => {
  const calls = [];
  const fetchStub = (url, opts) => { calls.push({ url, opts }); return { catch() {} }; };
  const { recordTelemetryClient } = clientSandbox(fetchStub);

  // Pass a hostile extra field; it must never be forwarded.
  recordTelemetryClient("readiness_label_produced", { label_a: "Usable with caveats", value_num: 67, secret: "client merger memo" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/telemetry");
  const body = JSON.parse(calls[0].opts.body);
  assert.deepEqual(Object.keys(body).sort(), [
    "count_a", "count_b", "duration_ms", "event_type", "label_a", "label_b", "session_key", "value_num"
  ]);
  assert.equal(body.event_type, "readiness_label_produced");
  assert.equal(body.session_key, "session-client-1");
  assert.equal(body.label_a, "Usable with caveats");
  assert.equal(body.value_num, 67);
  assert.ok(!/secret|merger/i.test(calls[0].opts.body), "hostile extra field is never forwarded");
});

test("client: recordTelemetryClient no-ops when fetch is unavailable (never throws)", () => {
  const { recordTelemetryClient } = clientSandbox(undefined); // no fetch in scope
  assert.doesNotThrow(() => recordTelemetryClient("bundle_built", { count_a: 6 }));
});

test("client: recordTelemetryClient swallows a throwing fetch (telemetry never breaks the app)", () => {
  const { recordTelemetryClient } = clientSandbox(() => { throw new Error("network down"); });
  assert.doesNotThrow(() => recordTelemetryClient("snapshot_saved", { label_a: "compiled", count_a: 1 }));
});
