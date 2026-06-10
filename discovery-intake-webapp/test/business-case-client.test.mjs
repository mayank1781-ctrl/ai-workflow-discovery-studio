// Executed tests for PR 32's client side: the v1->v2 migration hook (legacy
// sessions show NO figure until explicitly computed), the Invariant 2 prior-
// snapshot preservation on recompute, and the explicit-recompute-only rule
// (render paths never call the engine; exactly one fetch site exists).
// Real shipped source extracted and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

test("migration hook: legacy (pre-v2) sessions get schemaVersion 2 and NO business-case figure", () => {
  const { migrateSessionState } = buildSandbox(source, { functions: ["migrateSessionState"], globals: {} });
  // A legacy session — no schemaVersion at all, real workflow content.
  const legacy = migrateSessionState({ workflowGrid: { steps: [{ cells: {} }] }, fields: {} });
  assert.equal(legacy.schemaVersion, 2);
  assert.equal(legacy.businessCaseSnapshot, null, "no auto-compute at migration — no figure");
  assert.equal(legacy.businessCaseSnapshotPrior, null);
  // Idempotent: a v2 session with a computed snapshot keeps it.
  const snapshot = { rate: 100, rateSource: "role", computedAt: "2026-06-10T00:00:00.000Z", results: {} };
  const v2 = migrateSessionState({ schemaVersion: 2, businessCaseSnapshot: snapshot });
  assert.equal(v2.schemaVersion, 2);
  assert.deepEqual(v2.businessCaseSnapshot, snapshot, "v2 snapshots survive migration untouched");
});

test("Invariant 2: recompute preserves the prior snapshot, never silently overwrites", () => {
  const state = { businessCaseSnapshot: null, businessCaseSnapshotPrior: null };
  const { applyBusinessCaseSnapshot } = buildSandbox(source, {
    functions: ["applyBusinessCaseSnapshot"],
    globals: { state }
  });
  const first = { rate: 75, rateSource: "role", computedAt: "2026-06-01T00:00:00.000Z", results: { annualValue: 1000 } };
  const second = { rate: 145, rateSource: "override", computedAt: "2026-06-10T00:00:00.000Z", results: { annualValue: 2000 } };
  assert.equal(applyBusinessCaseSnapshot(first), true);
  assert.equal(state.businessCaseSnapshot, first);
  assert.equal(state.businessCaseSnapshotPrior, null, "first compute has no prior");
  assert.equal(applyBusinessCaseSnapshot(second), true);
  assert.equal(state.businessCaseSnapshot, second);
  assert.deepEqual(state.businessCaseSnapshotPrior, first, "recompute preserves the prior snapshot");
  // Garbage never clobbers a real snapshot.
  assert.equal(applyBusinessCaseSnapshot(null), false);
  assert.equal(state.businessCaseSnapshot, second);
});

test("explicit-recompute-only: render/export paths never call the engine; one fetch site exists", () => {
  // The ONLY /api/business-case caller in the client is the explicit action.
  const calls = source.match(/\/api\/business-case/g) || [];
  assert.equal(calls.length, 1, "exactly one /api/business-case reference in app.js");
  const explicit = extractFunction(source, "computeBusinessCaseNow");
  assert.ok(explicit.includes("/api/business-case"), "the one fetch lives in computeBusinessCaseNow");
  // Render and export paths read the snapshot and never compute.
  for (const name of ["businessCaseBlockForCurrentWorkflow", "businessCaseBlockHtml", "sessionCardMetrics"]) {
    const body = extractFunction(source, name);
    assert.ok(!body.includes("/api/business-case"), `${name} must not call the engine`);
    assert.ok(!body.includes("computeBusinessCase("), `${name} must not compute locally`);
  }
  // The duplicated client formula is gone — server.mjs is the single source.
  assert.ok(!/^function computeBusinessCase\b/m.test(source), "client computeBusinessCase deleted");
});
