// E4 — Lifecycle states (captured -> confirmed -> specified -> in-build -> in-telemetry). A
// .prov.* triple with one-directional, human-initiated transitions wired to the Change-3
// confirm gate and the complete 7-field spec (E2). Additive: absent lifecycle is inferred
// (confirmed? "confirmed" : "captured").

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();

// One cell per recipe-critical group + a spec-source cell, so the unit can confirm + specify.
const FULL = { name: "Reconcile & validate", systemsTools: "Excel", frequencyVolume: "Monthly", dataProcessing: "client confidential ledgers", dataSensitivity: "client confidential", painFriction: "manual rekeying", output: "reconciled figures" };
const inferredCells = (o = {}) => Object.fromEntries(Object.entries({ ...FULL, ...o }).map(([k, v]) => [k, [v, "ai-inferred", 0.5]]));

function lifeSandbox() {
  const state = { questionHistory: [], evidenceArtifacts: [], recipeCache: {}, stepTypes: {}, lifecycleTags: {}, aiPolicy: null, __steps: [] };
  const fns = buildSandbox(source, {
    consts: ["ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE", "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS", "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER", "POLICY_AREA_CUES", "RECIPE_SPEC_READINESS", "STEP_TYPE_OPTIONS", "RECIPE_CRITICAL_FIELDS", "RECIPE_CONFIDENCE_THRESHOLD", "LIFECYCLE_STATES"],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope", "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability", "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness", "policyClip", "extractPolicyClauses", "matchPolicyClause", "policyReviewLine", "buildAgentRecipeIr",
      "getField", "patchField", "deriveLegacyCellSource", "newGridCell", "newGridStep", "newAiPatternEntry", "makeId",
      "recipeSpecTriple", "defaultRecipeSpec", "buildStepRecipeSpec", "buildConnectionRecipeSpec", "buildRecipeSpec", "stepTypeOf", "isValidStepType",
      "normalizePolicyConstraints", "currentAiPolicy", "unitGovernanceShape", "applyPolicyConstraintsToSpec", "specConstraintsTriple", "specEscalationTriple", "specReadinessFromPolicy",
      "permittedAddressability", "resolveUnitDataTier", "theoreticalAddressability", "unitAddressabilityCeiling", "minAddressability", "addressabilityRank", "normalizeAddressabilityLevel", "sensitivityToTier",
      "recipeGateCheck", "cellConfirmedEnough", "isUnitConfirmed", "confirmUnit",
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake", "engineWorkflowSpec", "engineWorkflowCapacity", "engineWorkflowCost", "engineModelFitForUnit", "engineUnitModelFitTriple", "engineUnitReadiness", "engineSpecReadiness", "engineWorkflowNetValue",
      "ensureLifecycleTags", "unitLifecycle", "isUnitSpecified", "lifecycleCanAdvance", "lifecycleNextAdvanceable", "advanceLifecycle",
    ],
    globals: {
      state, console: { info() {}, warn() {}, error() {} }, currentGridStep: () => null,
      analysisGridSteps: () => state.__steps, recipeConnectionSeams: () => [], handoffId: (a, b) => `h:${a}>${b}`, connectionToolTokens: () => [],
      analysisWorkflowName: () => "", questionStatusForIntent: () => "active", persistState: () => {}, window: { StudioEngine: engine },
    },
  });
  const makeStep = (cells) => {
    const step = fns.newGridStep();
    for (const [k, spec] of Object.entries(cells)) { const [v, s = "user-stated", c = 0.95] = Array.isArray(spec) ? spec : [spec]; fns.patchField(step, null, k, v, s, c); }
    state.stepTypes[step.id] = { value: "data-op", source: "user-stated" };
    state.__steps = [step];
    return step;
  };
  return { ...fns, state, makeStep };
}

test("additive inference: an unconfirmed unit reads captured; a confirmed unit reads confirmed (no stored tag)", () => {
  const sb = lifeSandbox();
  const unconf = sb.makeStep(inferredCells());
  assert.equal(sb.unitLifecycle(unconf.id).value, "captured");
  assert.equal(sb.unitLifecycle(unconf.id).source, "ai-inferred", "inference wears inferred/grey provenance");
  const conf = sb.makeStep(FULL); // user-stated cells => confirmed
  assert.equal(sb.unitLifecycle(conf.id).value, "confirmed");
});

test("the confirm gate advances captured -> confirmed", () => {
  const sb = lifeSandbox();
  const step = sb.makeStep(inferredCells());
  assert.equal(sb.unitLifecycle(step.id).value, "captured");
  sb.confirmUnit(step.id); // Change-3 confirm gate (human-initiated)
  assert.equal(sb.unitLifecycle(step.id).value, "confirmed", "confirming the capture advances the lifecycle");
});

test("a complete 7-field spec advances confirmed -> specified (human-initiated); the stored tag is stated", () => {
  const sb = lifeSandbox();
  const step = sb.makeStep(FULL); // confirmed + full capture => the engine completes the 7-field spec
  assert.equal(sb.isUnitSpecified(step.id), true, "confirmed + 7-field spec => specified gate met");
  assert.equal(sb.advanceLifecycle(step.id, "specified"), true, "advances to specified");
  const lc = sb.unitLifecycle(step.id);
  assert.equal(lc.value, "specified");
  assert.equal(lc.source, "user-stated", "a human-set lifecycle is stated (teal), provenance preserved");
});

test("transitions are one-directional: cannot skip a stage, cannot move backward", () => {
  const sb = lifeSandbox();
  const step = sb.makeStep(inferredCells()); // captured
  assert.equal(sb.advanceLifecycle(step.id, "specified"), false, "cannot skip captured -> specified");
  assert.equal(sb.advanceLifecycle(step.id, "in-build"), false, "cannot jump to in-build");
  sb.confirmUnit(step.id); // -> confirmed (inferred)
  // advance forward through the chain, then prove no backward move
  const full = sb.makeStep(FULL);
  assert.equal(sb.advanceLifecycle(full.id, "specified"), true);
  assert.equal(sb.advanceLifecycle(full.id, "confirmed"), false, "cannot move backward to confirmed");
  assert.equal(sb.advanceLifecycle(full.id, "captured"), false, "cannot move backward to captured");
});

test("in-build and in-telemetry are extension points: advance on the explicit human flag once specified", () => {
  const sb = lifeSandbox();
  const step = sb.makeStep(FULL);
  assert.equal(sb.advanceLifecycle(step.id, "specified"), true);
  assert.equal(sb.lifecycleNextAdvanceable(step.id), "in-build", "in-build is the next reachable stage");
  assert.equal(sb.advanceLifecycle(step.id, "in-build"), true, "extension point: Workbench build flag");
  assert.equal(sb.advanceLifecycle(step.id, "in-telemetry"), true, "extension point: telemetry connected");
  assert.equal(sb.unitLifecycle(step.id).value, "in-telemetry");
  assert.equal(sb.lifecycleNextAdvanceable(step.id), null, "no stage beyond in-telemetry");
});

test("buildRecipeSpec attaches the lifecycle triple (engine-loaded path)", () => {
  const sb = lifeSandbox();
  const step = sb.makeStep(FULL);
  const spec = sb.buildRecipeSpec(step.id);
  assert.ok(spec.lifecycle && ["captured", "confirmed", "specified", "in-build", "in-telemetry"].includes(spec.lifecycle.value), "spec carries a lifecycle triple");
});

// render: the lifecycle chip appears with provenance; absent => summary byte-identical
function renderSandbox() {
  return buildSandbox(source, { consts: ["RECIPE_SPEC_READINESS"], functions: ["recipeSpecCanvasHtml", "recipeProvChipHtml", "recipeSpecTriple"], globals: { escapeHtml: (s) => String(s == null ? "" : s) } });
}
test("render: the lifecycle chip + provenance show when present, and an advance affordance when the next gate is met", () => {
  const { recipeSpecCanvasHtml } = renderSandbox();
  const base = { goal: { value: "g", source: "ai-inferred", confidence: null }, context: { value: "c", source: "ai-inferred", confidence: null }, constraints: { value: "x", source: "ai-inferred", confidence: null }, acceptanceCriteria: { value: "a", source: "ai-inferred", confidence: null }, decomposition: [], escalation: { value: "e", source: "ai-inferred", confidence: null }, evalCases: [], readiness: "now" };
  assert.ok(!/Lifecycle ·/.test(recipeSpecCanvasHtml(base, "s1")), "no lifecycle chip when absent (byte-identical)");
  const withLc = { ...base, lifecycle: { value: "confirmed", source: "user-stated", confidence: 1 } };
  const html = recipeSpecCanvasHtml(withLc, "s1", true, "specified");
  assert.match(html, /Lifecycle · confirmed/);
  assert.match(html, /class="prov user"/, "lifecycle wears its provenance (stated/teal)");
  assert.match(html, /data-lifecycle-advance="s1"/, "advance affordance present when the next gate is met");
  assert.match(html, /Advance to specified/);
});
