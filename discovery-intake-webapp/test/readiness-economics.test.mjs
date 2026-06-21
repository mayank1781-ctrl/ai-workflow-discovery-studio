// E3 — Readiness: now / gated-policy / gated-economics / future-capability (engine-decided),
// each non-"now" state carrying a rails-clean reason + remedy. The app reads engine.readiness()
// through a thin wrapper; additive (no engine => the Change 1/2 readiness stands).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractConst } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const HEAVY = { avgTaskMin: 5, baseInTokens: 8000, baseOutTokens: 1500, agenticMultiplier: 30, retryFactor: 3 };

function sb() {
  return buildSandbox(source, {
    functions: ["studioEngine", "railCheck", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake", "engineWorkflowCapacity", "engineWorkflowCost", "engineUnitReadiness"],
    globals: {
      window: { StudioEngine: engine },
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [], recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

test("a clean, policy-permitted, net-positive unit reads now", () => {
  const rd = sb().engineUnitReadiness([{ step: "Compile", cls: "assembly", data: "internal", time: 100, theo: 50 }]);
  assert.equal(rd.state, "now");
});

test("a policy-capped (permitted < theoretical) net-positive unit reads gated-policy with a governance reason", () => {
  const rd = sb().engineUnitReadiness([{ step: "Model", cls: "assembly", data: "confidential", time: 100, theo: 80 }]);
  assert.equal(rd.state, "gated-policy");
  assert.match(rd.reason, /policy ceiling|governance/i, "names the policy ceiling / governance agenda");
});

test("a net-negative unit at its tier reads gated-economics with a reason + remedy", () => {
  const rd = sb().engineUnitReadiness([{ step: "Monitor", cls: "assembly", data: "MNPI", time: 100, theo: 50 }], { cost: HEAVY });
  assert.equal(rd.state, "gated-economics");
  assert.match(rd.reason, /route to a lower tier|compress|cheaper capability/i, "surfaces the remedy");
});

test("routing a net-negative unit to a cheaper tier flips gated-economics -> now", () => {
  const FLIP = [{ step: "Draft", cls: "assembly", data: "internal", time: 100, theo: 60 }];
  const s = sb();
  assert.equal(s.engineUnitReadiness(FLIP, { mode: "frontier", cost: HEAVY }).state, "gated-economics", "frontier-everywhere is net-negative");
  assert.equal(s.engineUnitReadiness(FLIP, { mode: "routed", cost: HEAVY }).state, "now", "routing to the cheaper tier clears the economics gate");
});

test("a future-capability unit is preserved", () => {
  const rd = sb().engineUnitReadiness([{ step: "x", cls: "assembly", data: "internal", time: 100, theo: 50 }], { futureCapability: true, futureReason: "needs live writeback" });
  assert.equal(rd.state, "future-capability");
  assert.match(rd.reason, /writeback|capability/i);
});

test("every non-now state carries a rails-clean reason (passes on recipe + dashboard)", () => {
  const s = sb();
  const states = [
    s.engineUnitReadiness([{ step: "a", cls: "assembly", data: "confidential", time: 100, theo: 80 }]),
    s.engineUnitReadiness([{ step: "b", cls: "assembly", data: "MNPI", time: 100, theo: 50 }], { cost: HEAVY }),
  ];
  for (const rd of states) {
    assert.ok(rd.reason && rd.reason.length > 0, "non-now state has a reason");
    assert.equal(engine.railCheck(rd.reason, "recipe").ok, true, `reason rail-clean on recipe: ${rd.reason}`);
    assert.equal(engine.railCheck(rd.reason, "dashboard").ok, true, "reason rail-clean on dashboard");
  }
});

test("the readiness enum is extended with the 4-state split (additive: now/gated/future still valid)", () => {
  const arr = JSON.parse(extractConst(source, "RECIPE_SPEC_READINESS").replace(/^const RECIPE_SPEC_READINESS\s*=\s*/, "").replace(/;\s*$/, "").replace(/'/g, '"'));
  for (const s of ["now", "gated-policy", "gated-economics", "future-capability"]) assert.ok(arr.includes(s), `enum includes ${s}`);
  for (const s of ["now", "gated", "future"]) assert.ok(arr.includes(s), `legacy ${s} still valid (additive)`);
});
