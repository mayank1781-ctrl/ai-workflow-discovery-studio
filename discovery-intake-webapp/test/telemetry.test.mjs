// V3-1 — executed tests for local usage telemetry, reconciled to the canonical
// event set in V3_BACKLOG_AND_PLAN.md. One test per acceptance criterion:
//   * each emit fires on the correct user action (source-level wiring);
//   * the payload scrubber strips disallowed content (no firm names / no raw
//     content — counts/types/durations/ids/labels only);
//   * the single disable flag suppresses every emit (zero rows written);
//   * aggregates compute correctly on fixtures.
// Plus the kept sanitizer + client-recorder safety tests.
//
// The temp DATA_DIR means the real data/sessions.db is never touched; AI keys
// are forced empty so no network call can happen (mirrors server-http.test).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppSource, readServerSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "..", "server.mjs");

const CANONICAL_EVENTS = [
  "intake_step_viewed", "intake_question_skipped", "time_to_first_artifact",
  "artifact_generated", "artifact_abandoned", "target_surface_used",
  "export_performed", "bundle_generated"
];

// ============================================================================
// Acceptance: each emit fires on the correct user action (source-level wiring).
// ============================================================================
test("wiring: every canonical emit is wired to the correct action handler", () => {
  const app = readAppSource();
  const server = readServerSource();
  const inApp = (fn, needle) => assert.ok(extractFunction(app, fn).includes(needle), `${fn} should emit/contain ${needle}`);
  const inServer = (fn, needle) => assert.ok(extractFunction(server, fn).includes(needle), `${fn} (server) should contain ${needle}`);

  // intake step viewed — renderCurrentQuestion -> dedup helper -> the event.
  inApp("renderCurrentQuestion", "telemetryMarkIntakeStepViewed");
  inApp("telemetryMarkIntakeStepViewed", "intake_step_viewed");
  // intake question skipped — the skip/next control.
  inApp("goToNextSection", "intake_question_skipped");
  // generation lifecycle — all in compileArtifactForStep.
  inApp("compileArtifactForStep", "time_to_first_artifact");
  inApp("compileArtifactForStep", "artifact_generated");
  inApp("compileArtifactForStep", "target_surface_used");
  inApp("compileArtifactForStep", "bundle_generated");
  // abandoned — the unload handler.
  inApp("telemetryEmitAbandonedIfNeeded", "artifact_abandoned");
  // export performed — client Word export + server export handlers.
  inApp("exportWorkflowWord", "export_performed");
  inServer("handleRecipeBookExport", "export_performed");
  inServer("handleEngineeringDocExport", "export_performed");
  inServer("handlePdfExport", "export_performed");
});

test("wiring: the abandoned emit is registered on unload and the disable flag gates recordTelemetry", () => {
  const app = readAppSource();
  assert.ok(app.includes('addEventListener("beforeunload", telemetryEmitAbandonedIfNeeded)'),
    "artifact_abandoned is emitted on page unload");
  assert.ok(extractFunction(readServerSource(), "recordTelemetry").includes("TELEMETRY_ENABLED"),
    "recordTelemetry is gated by the single disable flag");
});

test("wiring: dropped/built-from-intent events are gone from both layers", () => {
  const app = readAppSource();
  const server = readServerSource();
  for (const dead of ["intake_method_chosen", "workflow_extracted", "opportunity_computed",
    "business_case_computed", "readiness_label_produced", "snapshot_saved", '"regeneration"', "bundle_built", "artifact_recommended"]) {
    assert.ok(!app.includes(dead), `app.js still references dropped event ${dead}`);
  }
  // The server telemetry layer no longer references the dropped events either
  // ("export_generated" survives ONLY as the separate appendAudit action name).
  for (const dead of ["intake_method_chosen", "workflow_extracted", "opportunity_computed",
    "business_case_computed", "readiness_label_produced"]) {
    assert.ok(!server.includes(dead), `server.mjs still references dropped event ${dead}`);
  }
});

// ============================================================================
// Acceptance: the payload scrubber strips disallowed content.
// ============================================================================
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

test("scrubber: a valid canonical event keeps only the typed columns", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  const e = sanitizeTelemetryEvent({
    event_type: "artifact_generated", session_key: "session-abc123",
    label_a: "customGPT", count_a: 4, count_b: 2, value_num: 67
  }, "client");
  assert.ok(e);
  assert.deepEqual(Object.keys(e).sort(), TYPED_KEYS);
  assert.equal(e.event_type, "artifact_generated");
  assert.equal(e.label_a, "customGPT");
  assert.equal(e.value_num, 67);
});

test("scrubber: unknown / dropped event types are rejected entirely", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  for (const t of ["business_case_computed", "intake_method_chosen", "exfiltrate", ""]) {
    assert.equal(sanitizeTelemetryEvent({ event_type: t, label_a: "customGPT" }, "client"), null, `${t} rejected`);
  }
  assert.equal(sanitizeTelemetryEvent(null, "client"), null);
});

test("scrubber: free text NEVER survives (no firm names, no raw content)", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  const e = sanitizeTelemetryEvent({
    event_type: "target_surface_used",
    session_key: "Acme Corp confidential reconciliation notes", // not the id pattern
    label_a: "Reconcile ACME payroll variances",                // not an allowlisted surface
    label_b: "SSN 123-45-6789",
    description: "Customer merger memo", raw_text: "secret", note: "do not store"
  }, "client");
  assert.ok(e);
  assert.equal(e.session_key, null);
  assert.equal(e.label_a, null);
  assert.equal(e.label_b, null);
  assert.deepEqual(Object.keys(e).sort(), TYPED_KEYS);
  assert.ok(!/Acme|confidential|ACME|payroll|merger|secret|SSN/i.test(JSON.stringify(e)), "no free text in the record");
});

test("scrubber: numerics are coerced and out-of-range/garbage becomes null; source constrained", () => {
  const { sanitizeTelemetryEvent } = sanitizerSandbox();
  const e = sanitizeTelemetryEvent({
    event_type: "time_to_first_artifact", count_a: "7", count_b: -3, value_num: 0.82, duration_ms: 999999999999
  }, "server");
  assert.equal(e.count_a, 7);
  assert.equal(e.count_b, null);
  assert.equal(e.value_num, 0.82);
  assert.equal(e.duration_ms, null);
  assert.equal(e.source, "server");
  assert.equal(sanitizeTelemetryEvent({ event_type: "bundle_generated" }, "whatever").source, "client");
});

// ============================================================================
// Acceptance: client recorder forwards only typed fields (kept tests).
// ============================================================================
function clientSandbox(fetchStub, consts = [], functions = ["recordTelemetryClient"]) {
  const globals = { state: { sessionMeta: { id: "session-client-1" } }, console };
  if (fetchStub !== undefined) globals.fetch = fetchStub;
  return buildSandbox(readAppSource(), { consts, functions, globals });
}

test("client: recordTelemetryClient posts only the typed fields, never content", () => {
  const calls = [];
  const { recordTelemetryClient } = clientSandbox((url, opts) => { calls.push({ url, opts }); return { catch() {} }; });
  recordTelemetryClient("artifact_generated", { label_a: "customGPT", value_num: 67, secret: "client merger memo" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/telemetry");
  const body = JSON.parse(calls[0].opts.body);
  assert.deepEqual(Object.keys(body).sort(), [
    "count_a", "count_b", "duration_ms", "event_type", "label_a", "label_b", "session_key", "value_num"
  ]);
  assert.equal(body.event_type, "artifact_generated");
  assert.equal(body.session_key, "session-client-1");
  assert.ok(!/secret|merger/i.test(calls[0].opts.body), "hostile extra field is never forwarded");
});

test("client: recordTelemetryClient no-ops without fetch and swallows a throwing fetch", () => {
  const { recordTelemetryClient: noFetch } = clientSandbox(undefined);
  assert.doesNotThrow(() => noFetch("bundle_generated", { count_a: 6 }));
  const { recordTelemetryClient: throwingFetch } = clientSandbox(() => { throw new Error("network down"); });
  assert.doesNotThrow(() => throwingFetch("export_performed", { label_a: "recipe-book" }));
});

test("client: intake_step_viewed dedupes to once per distinct section", () => {
  const calls = [];
  const { telemetryMarkIntakeStepViewed } = clientSandbox(
    (url, opts) => { calls.push(JSON.parse(opts.body)); return { catch() {} }; },
    ["_telemetryViewedSteps"],
    ["recordTelemetryClient", "telemetryMarkIntakeStepViewed"]
  );
  telemetryMarkIntakeStepViewed("overview");
  telemetryMarkIntakeStepViewed("overview"); // duplicate — no emit
  telemetryMarkIntakeStepViewed("systems");
  telemetryMarkIntakeStepViewed("");          // falsy — no emit
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.event_type === "intake_step_viewed"));
  assert.deepEqual(calls.map((c) => c.count_a), [1, 2]);
});

test("client: shouldFlagAbandoned is true only when generated and not exported", () => {
  const { shouldFlagAbandoned } = buildSandbox(readAppSource(), { functions: ["shouldFlagAbandoned"] });
  assert.equal(shouldFlagAbandoned(true, false), true);
  assert.equal(shouldFlagAbandoned(true, true), false);
  assert.equal(shouldFlagAbandoned(false, false), false);
});

// ============================================================================
// Acceptance: disable flag + aggregates, end-to-end over the wire.
// ============================================================================
async function bootServer(extraEnv = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "telemetry-test-"));
  const port = Number(extraEnv.PORT);
  const proc = spawn(process.execPath, [SERVER], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, DATA_DIR: dataDir, OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", AUTH_ENABLED: "false", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i += 1) {
    try { const res = await fetch(`${base}/health`); if (res.ok) return { proc, base, dataDir }; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  proc.kill();
  throw new Error("server did not become healthy in time");
}
const stop = async (h) => { h.proc.kill(); await rm(h.dataDir, { recursive: true, force: true }); };
const postTo = (base, body) => fetch(`${base}/api/telemetry`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
const summaryOf = async (base) => (await fetch(`${base}/api/telemetry/summary`)).json();

// Enabled server (default) shared across the aggregate tests.
let server;
before(async () => { server = await bootServer({ PORT: "5191" }); });
after(async () => { await stop(server); });

test("e2e aggregates: canonical events are recorded and summarized correctly on fixtures", async () => {
  const fixtures = [
    { event_type: "intake_step_viewed", session_key: "s1", count_a: 1 },
    { event_type: "intake_question_skipped", session_key: "s1", count_a: 0 },
    { event_type: "time_to_first_artifact", session_key: "s1", duration_ms: 12000 },
    { event_type: "artifact_generated", session_key: "s1", label_a: "customGPT", count_a: 4, count_b: 1, value_num: 70 },
    { event_type: "target_surface_used", session_key: "s1", label_a: "customGPT" },
    { event_type: "artifact_generated", session_key: "s2", label_a: "chatgptPrompt", value_num: 40 },
    { event_type: "target_surface_used", session_key: "s2", label_a: "chatgptPrompt" },
    { event_type: "bundle_generated", session_key: "s2", count_a: 6 },
    { event_type: "export_performed", session_key: "s2", label_a: "engineering-doc", count_a: 3 },
    { event_type: "artifact_abandoned", session_key: "s3", count_a: 2 }
  ];
  for (const f of fixtures) assert.equal((await postTo(server.base, f)).status, 200, `${f.event_type} accepted`);

  const s = await summaryOf(server.base);
  assert.ok(s.total >= 10);
  assert.equal(s.byType.artifact_generated, 2);
  assert.equal(s.byType.target_surface_used, 2);
  assert.equal(s.targetSurfaceDistribution.customGPT, 1);
  assert.equal(s.targetSurfaceDistribution.chatgptPrompt, 1);
  assert.equal(s.exportKindDistribution["engineering-doc"], 1);
  assert.equal(s.artifactsGenerated, 2);
  assert.equal(s.bundlesGenerated, 1);
  assert.equal(s.exportsPerformed, 1);
  assert.equal(s.artifactsAbandoned, 1);
  assert.equal(s.meanTimeToFirstArtifactMs, 12000);
  assert.equal(s.meanReadinessScore, 55); // (70 + 40) / 2
});

test("e2e disable flag: with TELEMETRY_ENABLED=false, zero events are written", async () => {
  const off = await bootServer({ PORT: "5192", TELEMETRY_ENABLED: "false" });
  try {
    const r = await postTo(off.base, { event_type: "artifact_generated", session_key: "s1", label_a: "customGPT" });
    // The endpoint accepts the request shape but writes nothing.
    assert.ok(r.status === 200 || r.status === 400);
    const s = await summaryOf(off.base);
    assert.equal(s.total, 0, "no rows written when telemetry is disabled");
    assert.deepEqual(s.byType, {});
  } finally {
    await stop(off);
  }
});
