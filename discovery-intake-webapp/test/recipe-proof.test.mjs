// B3 (Phase 2) — Recipe: shape + proof + costed model-fit. Every recipe carries its solution shape,
// eval plan, owner, evidence log, fallback, and maintenance cost, plus the deck's "how you prove it"
// (golden set + thresholds) and "the governance remedy" (the named policy change that unlocks a gated
// recipe), and shows model-fit as a costed lever (routed vs frontier delta). Engine-computed; app delegates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const FPA = engine.FPA_INTAKE; // Conservative => gated-policy (theo 55% > permitted ~46%)

test("B3 — a gated-policy recipe names its governance remedy", () => {
  const proof = engine.buildRecipeProof(FPA);
  assert.equal(proof.governanceRemedy.gated, true);
  assert.ok(typeof proof.governanceRemedy.remedy === "string" && proof.governanceRemedy.remedy.length > 0);
  assert.ok(proof.governanceRemedy.unlockPts > 0);
  assert.match(proof.governanceRemedy.remedy, /Permit AI|posture change|governance/);
});

test("B3 — the model-fit lever shows a non-zero routed-vs-frontier delta", () => {
  const lever = engine.buildRecipeProof(FPA).modelFitLever;
  assert.ok(lever.delta > 0, `delta should be > 0, got ${lever.delta}`);
  assert.ok(lever.frontier > lever.routed, "frontier-everywhere costs more than routed");
});

test("B3 — every recipe carries shape / eval / owner / evidence / fallback / maintenance", () => {
  const p = engine.buildRecipeProof(FPA);
  assert.ok(p.solutionShapes && typeof p.solutionShapes === "object");
  assert.ok(Array.isArray(p.evalPlan) && p.evalPlan.length > 0);
  assert.ok(p.owner && p.fallback);
  assert.ok(p.evidenceLog && p.evidenceLog.kind === "append-only");
  assert.ok(p.maintenanceCost && p.maintenanceCost.annualPoint >= 0 && p.maintenanceCost.band);
  assert.match(p.howYouProveIt.goldenSet, /golden set/);
  assert.match(p.howYouProveIt.fallback, /routes back/);
});

test("B3 — solution shape drives the eval plan (agentic needs a harness; a prompt does not)", () => {
  const shape = (sh) => ({ ...FPA, steps: FPA.steps.map((s) => s.cls === "assembly" ? { ...s, solutionShape: sh } : s) });
  assert.ok(engine.buildRecipeProof(shape("agentic")).evalPlan.some((e) => /harness/.test(e)));
  assert.ok(!engine.buildRecipeProof(shape("prompt")).evalPlan.some((e) => /harness/.test(e)));
});

test("B3 — a non-gated recipe names no false remedy", () => {
  const clean = engine.buildRecipeProof({ steps: [{ step: "x", cls: "assembly", data: "internal", time: 10, theo: 50 }], confirm: { acceptance: "matches the rule" } }, { profile: "Progressive" });
  assert.equal(clean.governanceRemedy.gated, false);
  assert.equal(clean.governanceRemedy.remedy, null);
});

// ---- app: the adapter + render delegate to the engine ----
function sandbox() {
  return buildSandbox(source, {
    functions: ["studioEngine", "engineRecipeProof", "recipeProofHtml", "escapeHtml"],
    globals: { window: { StudioEngine: engine }, appWorkflowToIntake: () => FPA },
  });
}

test("B3 — the app adapter delegates to the engine; the render shows the lever + remedy", () => {
  const sb = sandbox();
  const p = sb.engineRecipeProof({ record: FPA });
  assert.ok(p.modelFitLever.delta > 0 && p.governanceRemedy.gated === true);
  const html = sb.recipeProofHtml({ record: FPA });
  assert.match(html, /Model-fit lever/);
  assert.match(html, /governance remedy/i);
  assert.match(html, /Eval plan/);
  assert.match(html, /Recipe proof/);
});
