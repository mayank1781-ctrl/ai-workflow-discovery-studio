// Executed tests for V3-6 business-case scenarios. Two layers, both from the
// real shipped source (see test/helpers/extract.mjs):
//   * SERVER: the additive scenarioRate / pinRole option on computeBusinessCase
//     pins a scenario's own rate ABOVE the Settings override and is byte-identical
//     when absent (so business-case.test.mjs stays valid).
//   * CLIENT: scenarios are append-only by name, explicit recompute preserves the
//     prior figure, the range is a pure read, and no store/render/range path ever
//     calls the engine (the single fetch site stays in computeBusinessCaseNow).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, readServerSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const appSource = readAppSource();
const serverSource = readServerSource();

// ---- SERVER: scenario rate pinning --------------------------------------------

function serverSandbox({ rateOverride = null } = {}) {
  return buildSandbox(serverSource, {
    consts: ["BC_CONFIG"],
    functions: [
      "computeBusinessCase",
      "bcDetectWorkflowMode",
      "bcParseInstancesPerWeek",
      "bcParseMinutes",
      "bcParseDurationWeeks",
      "bcStepCellValue",
      "blendedRateForRole"
    ],
    globals: { settingsRateOverride: () => rateOverride }
  });
}

function step(frequencyVolume, timeTaken) {
  return {
    cells: {
      frequencyVolume: { value: frequencyVolume, state: "confirmed", confidence: 0.9 },
      timeTaken: { value: timeTaken, state: "confirmed", confidence: 0.9 }
    }
  };
}

const ROLE_TEXT = "This is part of my job, I do it every week as a recurring routine.";
const STEPS = [step("10 times per week", "30 minutes")];

test("server: an explicit scenarioRate pins above the Settings override and is labeled 'scenario'", () => {
  const { computeBusinessCase } = serverSandbox({ rateOverride: 145 });
  const snap = computeBusinessCase(STEPS, ROLE_TEXT, "analyst", { scenarioRate: 250 });
  assert.equal(snap.rate, 250, "the explicit scenario rate wins over the override");
  assert.equal(snap.rateSource, "scenario");
  assert.equal(snap.results.blendedRate, 250, "results use the scenario rate");
  assert.equal(snap.results.annualValue, snap.results.annualHours * 250);
});

test("server: pinRole pins the picked level's table rate above the override", () => {
  const { computeBusinessCase } = serverSandbox({ rateOverride: 999 });
  const snap = computeBusinessCase(STEPS, ROLE_TEXT, "manager", { pinRole: true });
  assert.equal(snap.rate, 150, "manager table rate is pinned above the override");
  assert.equal(snap.rateSource, "scenario");
});

test("server: absent options is byte-identical to the pre-V3-6 override?-role behavior", () => {
  // Override still wins when no scenario option is given.
  const a = serverSandbox({ rateOverride: 145 }).computeBusinessCase(STEPS, ROLE_TEXT, "principal");
  assert.equal(a.rate, 145);
  assert.equal(a.rateSource, "override");
  // Role table when there is neither a scenario nor an override.
  const b = serverSandbox().computeBusinessCase(STEPS, ROLE_TEXT, "principal");
  assert.equal(b.rate, 200);
  assert.equal(b.rateSource, "role");
  // A non-positive scenarioRate is ignored (not a valid pin) → falls through.
  const c = serverSandbox().computeBusinessCase(STEPS, ROLE_TEXT, "analyst", { scenarioRate: 0 });
  assert.equal(c.rate, 75);
  assert.equal(c.rateSource, "role");
});

// ---- CLIENT: scenario store + range -------------------------------------------

test("scenarios append by name; an explicit recompute preserves the prior figure", () => {
  const state = { businessCaseScenarios: [] };
  const { applyBusinessCaseScenario } = buildSandbox(appSource, {
    functions: ["applyBusinessCaseScenario"],
    globals: { state }
  });
  const s1 = { workflowMode: "role", computedAt: "t1", blendedRate: 75, results: { annualValue: 1000 } };
  assert.equal(applyBusinessCaseScenario("Conservative", s1, { level: "analyst" }), true);
  assert.equal(state.businessCaseScenarios.length, 1);
  assert.equal(state.businessCaseScenarios[0].snapshot, s1);
  assert.equal(state.businessCaseScenarios[0].prior, null);

  const s2 = { workflowMode: "role", computedAt: "t2", blendedRate: 150, results: { annualValue: 2000 } };
  applyBusinessCaseScenario("Aggressive", s2, { level: "manager" });
  assert.equal(state.businessCaseScenarios.length, 2, "a distinct name appends");

  const s1b = { workflowMode: "role", computedAt: "t3", blendedRate: 75, results: { annualValue: 1100 } };
  applyBusinessCaseScenario("Conservative", s1b, { level: "analyst" });
  assert.equal(state.businessCaseScenarios.length, 2, "recompute of an existing name does not add a row");
  const conservative = state.businessCaseScenarios.find((s) => s.name === "Conservative");
  assert.equal(conservative.snapshot, s1b, "the new snapshot is stored");
  assert.equal(conservative.prior, s1, "the prior snapshot is preserved (Invariant 2 parity)");

  // Garbage never lands as a scenario.
  assert.equal(applyBusinessCaseScenario("X", null), false);
  assert.equal(applyBusinessCaseScenario("", s2), false);
  assert.equal(state.businessCaseScenarios.length, 2);
});

test("the scenario range is a pure min–max read over stored snapshots", () => {
  const { businessCaseScenarioRange, businessCaseScenarioValue } = buildSandbox(appSource, {
    functions: ["businessCaseScenarioRange", "businessCaseScenarioValue"]
  });
  const scenarios = [
    { snapshot: { workflowMode: "role", results: { annualValue: 1000 } } },
    { snapshot: { workflowMode: "role", results: { annualValue: 3000 } } },
    { snapshot: { workflowMode: "role", results: { annualValue: 2000 } } }
  ];
  const r = businessCaseScenarioRange(scenarios);
  assert.equal(r.count, 3);
  assert.equal(r.min, 1000);
  assert.equal(r.max, 3000);
  assert.equal(r.mode, "role");
  assert.equal(businessCaseScenarioValue({ workflowMode: "project", results: { projectValue: 5000 } }), 5000);
  assert.deepEqual(businessCaseScenarioRange([]), { count: 0, min: null, max: null, mode: "" });
});

test("a saved scenario is byte-stable across re-render (range never mutates or recomputes it)", () => {
  const { businessCaseScenarioRange } = buildSandbox(appSource, {
    functions: ["businessCaseScenarioRange", "businessCaseScenarioValue"]
  });
  // Deep-frozen input: any attempt to mutate/recompute it would throw.
  const frozen = Object.freeze([
    Object.freeze({ snapshot: Object.freeze({ workflowMode: "role", results: Object.freeze({ annualValue: 1234 }) }) })
  ]);
  const r = businessCaseScenarioRange(frozen);
  assert.equal(r.max, 1234);
  assert.equal(r.min, 1234);
});

test("explicit-only: scenario store/render/range never call the engine; compute routes through the one site", () => {
  for (const name of [
    "applyBusinessCaseScenario",
    "removeBusinessCaseScenario",
    "businessCaseScenarioRange",
    "businessCaseScenarioValue",
    "businessCaseScenariosBlockForCurrentWorkflow"
  ]) {
    const body = extractFunction(appSource, name);
    assert.ok(!body.includes("/api/business-case"), `${name} must not call the engine`);
    assert.ok(!body.includes("requestJson"), `${name} must not fetch directly`);
  }
  // The scenario form exposes an explicit compute control...
  const block = extractFunction(appSource, "businessCaseScenariosBlockForCurrentWorkflow");
  assert.ok(block.includes("data-bc-scenario-compute"), "scenario form has an explicit compute control");
  // ...and the scenario lands via the single explicit compute action.
  const compute = extractFunction(appSource, "computeBusinessCaseNow");
  assert.ok(compute.includes("applyBusinessCaseScenario"), "scenarios land through computeBusinessCaseNow");
});

test("removing a scenario is explicit and leaves the others intact", () => {
  const calls = { persist: 0, render: 0, toast: [] };
  const state = { businessCaseScenarios: [{ name: "A", snapshot: {} }, { name: "B", snapshot: {} }] };
  const { removeBusinessCaseScenario } = buildSandbox(appSource, {
    functions: ["removeBusinessCaseScenario"],
    globals: {
      state,
      recordEngagementAudit: () => {},
      auditChainHash: () => "h",
      persistState: () => { calls.persist += 1; },
      render: () => { calls.render += 1; },
      toast: (m) => calls.toast.push(m)
    }
  });
  assert.equal(removeBusinessCaseScenario("A"), true);
  assert.deepEqual(state.businessCaseScenarios.map((s) => s.name), ["B"]);
  assert.equal(calls.persist, 1);
  // A no-op removal of a missing name does not persist or fabricate a change.
  assert.equal(removeBusinessCaseScenario("ZZZ"), false);
  assert.equal(calls.persist, 1, "no-op removal does not persist");
});
