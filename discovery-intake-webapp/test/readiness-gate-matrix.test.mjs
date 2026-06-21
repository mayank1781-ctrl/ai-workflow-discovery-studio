// P6 / M6 — independent readiness gate matrix (policy · data · control · economics · adoption ·
// evidence) + one-line summary, with the old 4-state verdict preserved (additive).
//
// Audit major: the single 4-state verdict checks "economics before policy", so weak economics can
// MASK a policy block. The fix evaluates each gate independently; a red policy gate shows even when
// economics also fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as engine from "../studio_engine.mjs";

test("M6 — the audit case: policy-blocked + weak-economics shows BOTH gates red (no masking)", () => {
  // theo >> permitted (policy ceiling caps it) AND net-negative.
  const r = engine.readiness({ theoPct: 0.8, permittedPct: 0.4, grossValue: 100, annualCost: 5000 });
  assert.equal(r.gates.policy.status, "blocked", "policy gate is red");
  assert.equal(r.gates.economics.status, "blocked", "economics gate is red too — neither masks the other");
  assert.match(r.gates.policy.reason, /policy ceiling|governance/i);
  // the old single verdict still exists and is unchanged (it collapses to gated-economics).
  assert.equal(r.state, "gated-economics", "old 4-state field preserved (additive)");
  assert.equal(typeof r.reason, "string");
});

test("M6 — the six gates are always present, named, and independently statused", () => {
  const r = engine.readiness({ grossValue: 1, annualCost: 0 });
  for (const k of ["policy", "data", "control", "economics", "adoption", "evidence"]) {
    assert.ok(r.gates[k], `${k} gate present`);
    assert.ok(["ok", "caution", "blocked", "n-a"].includes(r.gates[k].status), `${k} has a valid status`);
    assert.ok(typeof r.gates[k].reason === "string" && r.gates[k].reason.length > 0, `${k} has a reason`);
  }
  assert.ok(typeof r.gateSummary === "string" && r.gateSummary.length > 0, "a one-line summary is present");
});

test("M6 — each gate reacts to ITS OWN signal, independently", () => {
  const base = { theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200 };
  assert.equal(engine.readiness({ ...base, dataTier: "PII" }).gates.data.status, "caution", "PII -> data caution");
  assert.equal(engine.readiness({ ...base, dataTier: "MNPI" }).gates.data.status, "caution", "MNPI -> data caution");
  assert.equal(engine.readiness({ ...base, dataTier: "secret" }).gates.data.status, "blocked", "unknown tier -> data blocked");
  assert.equal(engine.readiness({ ...base, controlViolations: [{ rule: "four-eyes-distinct" }] }).gates.control.status, "blocked", "control violation -> control blocked");
  assert.equal(engine.readiness({ ...base, controlOk: true }).gates.control.status, "ok", "clean control -> control ok");
  assert.equal(engine.readiness({ ...base, evidenceInferred: true }).gates.evidence.status, "blocked", "all-inferred -> evidence blocked");
  assert.equal(engine.readiness({ ...base, freedHrs: 10, realizationGapHrs: 5 }).gates.adoption.status, "caution", "big realization gap -> adoption caution");
});

test("M6 — a fully clean unit reports all gates clear with an 'all clear' summary", () => {
  const r = engine.readiness({ theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200, dataTier: "internal", controlOk: true, evidenceInferred: false, freedHrs: 10, realizationGapHrs: 1 });
  assert.equal(r.gates.policy.status, "ok");
  assert.equal(r.gates.economics.status, "ok");
  assert.match(r.gateSummary, /clear/i);
  assert.equal(r.state, "now", "old verdict says now");
});

test("M6 — readinessGates is exposed standalone and matches the matrix on readiness()", () => {
  const unit = { theoPct: 0.8, permittedPct: 0.3, grossValue: 1000, annualCost: 100, dataTier: "PII" };
  const m = engine.readinessGates(unit);
  const r = engine.readiness(unit);
  assert.deepEqual(m.gates, r.gates, "standalone matrix equals the one attached to readiness()");
  assert.ok(Array.isArray(m.blocked) && m.blocked.includes("policy"), "blocked list names policy");
});

test("M6 — the spec carries the gate matrix on its readiness object", () => {
  const spec = engine.buildSpec(engine.FPA_INTAKE);
  assert.ok(spec._readiness && spec._readiness.gates, "spec._readiness.gates present");
  assert.ok(spec._readiness.gates.data && spec._readiness.gates.control, "data + control gates populated from the record");
  assert.equal(typeof spec._readiness.gateSummary, "string");
});
