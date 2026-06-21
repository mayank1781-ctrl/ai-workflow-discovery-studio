// A1 (M4) — the solution-shape axis. Regression pins:
//   (1) the SAME step priced `prompt` vs `agentic` yields materially different cost-to-serve;
//   (2) the absent-shape path is byte-identical to the pre-A1 baseline (the global multiplier);
//   (3) shape drives a different eval-effort / required-evidence;
//   (4) shape flows through schema -> recipe -> spec -> readiness;
//   (5) a missing shape evidence requirement moves a unit to the evidence gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../studio_engine.mjs";

const RECONCILE = (shape) => ({
  steps: [{ step: "Reconcile two feeds", cls: "assembly", data: "internal", time: 100, theo: 80,
    ...(shape ? { solutionShape: shape } : {}) }],
});
const annual = (shape) => E.costToServe(E.normalizeIntake(RECONCILE(shape)).steps, "Conservative", "routed").annual;

test("A1 — same step: prompt vs agentic differ materially in cost-to-serve", () => {
  const cPrompt = annual("prompt");
  const cAgentic = annual("agentic");
  assert.ok(cAgentic > cPrompt * 5, `agentic (${cAgentic}) should be many× a prompt (${cPrompt})`);
  // the swing is real money, not a rounding artifact
  assert.ok(cAgentic - cPrompt > 0, "agentic strictly costs more to serve");
});

test("A1 — absent shape reproduces the baseline (global multiplier), byte-identical to agentic", () => {
  // the v3 model applied one global agentic multiplier; absent shape must keep it exactly
  assert.ok(Math.abs(annual(null) - annual("agentic")) < 1e-6, "absent == agentic numerically");
  // and prompt / deterministic-tool skip the loop multiplier identically
  assert.ok(Math.abs(annual("prompt") - annual("deterministic-tool")) < 1e-6, "prompt == deterministic-tool (no loop)");
});

test("A1 — the FP&A baseline numbers are unchanged when no step carries a shape", () => {
  const steps = E.normalizeIntake(E.FPA_INTAKE).steps;
  const cap = E.roleCapacity(steps, "Conservative");
  const routed = E.costToServe(steps, "Conservative", "routed");
  // pinned to the v3 model figures the engine self-test asserts
  assert.ok(Math.abs(cap.theoPct * 100 - 55) < 0.5, `theoretical ${cap.theoPct * 100}`);
  assert.ok(Math.abs(routed.annual - 161) < 8, `routed cost ${routed.annual}`);
  // and the spec/recipe carry NO shape fields for an unshaped workflow
  assert.equal(E.buildDraftSpec(E.FPA_INTAKE)._shapeProfile, undefined);
  assert.equal(E.buildDraftRecipe(E.FPA_INTAKE).shapeProfile, undefined);
});

test("A1 — shape drives a different evidence / eval requirement", () => {
  const prompt = E.shapeRequirements("prompt");
  const agentic = E.shapeRequirements("agentic");
  assert.equal(prompt.requiredEvidence.length, 0, "a prompt needs no extra proof scaffolding");
  assert.ok(agentic.requiredEvidence.length >= 3, "an agentic flow needs harness + observability + rollback");
  assert.ok(agentic.needsHarness && agentic.needsObservability && agentic.needsRollback);
  assert.notEqual(prompt.evalEffort, agentic.evalEffort);
});

test("A1 — shape flows into the recipe (ranked unit + workflow profile)", () => {
  const shaped = { ...E.FPA_INTAKE, steps: E.FPA_INTAKE.steps.map((s, i) => i === 0 ? { ...s, solutionShape: "agentic" } : s) };
  const rec = E.buildDraftRecipe(shaped);
  assert.ok(rec.shapeProfile && rec.shapeProfile.hasAgentic, "recipe carries an agentic shape profile");
  assert.ok(rec.rankedUnits.some(u => u.solutionShape === "agentic"), "the ranked unit carries its shape");
  const spec = E.buildDraftSpec(shaped);
  assert.ok(spec._shapeProfile && spec._shapeProfile.shaped > 0, "spec carries the shape profile");
  assert.ok(spec.solutionShapes && /agentic/.test(spec.solutionShapes.value), "spec surfaces the shapes");
});

test("A1 — a missing shape evidence requirement moves the unit to the evidence gate", () => {
  const gates = E.readinessGates({
    theoPct: 0.5, permittedPct: 0.5, grossValue: 50000, annualCost: 200,
    solutionShape: "agentic", shapeEvidenceMissing: ["eval harness (golden set + thresholds)"],
  });
  assert.equal(gates.gates.evidence.status, "blocked");
  assert.ok(gates.blocked.includes("evidence"));
  // independent of economics: economics is fine here, evidence still blocks (M6 independence holds)
  assert.equal(gates.gates.economics.status, "ok");
});

test("A1 — schema integrity: unknown shape surfaced, valid shape accepted, absent fine", () => {
  const bad = E.validateIntake({ ...E.FPA_INTAKE, steps: [{ step: "x", cls: "assembly", data: "internal", solutionShape: "magic" }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => /solution shape/i.test(e)));
  const good = E.validateIntake({ ...E.FPA_INTAKE, steps: E.FPA_INTAKE.steps.map((s, i) => i === 0 ? { ...s, solutionShape: "rag" } : s) });
  assert.equal(good.ok, true);
  assert.equal(E.validateIntake(E.FPA_INTAKE).ok, true); // absent — unchanged
});

test("A1 — SOLUTION_SHAPES is the controlled vocabulary of five", () => {
  assert.deepEqual(E.SOLUTION_SHAPES, ["prompt", "rag", "deterministic-tool", "agentic", "human-in-loop"]);
});
