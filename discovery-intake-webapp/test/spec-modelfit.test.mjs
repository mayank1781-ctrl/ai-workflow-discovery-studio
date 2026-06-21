// E2 — Spec canvas field 7: model-fit & cost-to-serve. The engine decides the permitted tier
// (class + data-tier residency: PII/MNPI -> restricted/in-VPC; confidential routes at its
// normal tier), the cost-to-serve band, and netValue. The app surfaces the engine's modelFit
// prov triple as the 7th canvas field on the Recipe surface; additive (no modelFit ->
// six-field canvas). The cost-to-serve / model-fit rail family is allowed on recipe+dashboard,
// denied on capture+workbench (engine railCheck).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox } from "./helpers/extract.mjs";
import * as engine from "../studio_engine.mjs";

const source = readAppSource();
const isTriple = (t) => t && typeof t === "object" && typeof t.value === "string" && (t.source === "user-stated" || t.source === "ai-inferred");

const ADAPTER_FNS = ["studioEngine", "railCheck", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake", "engineWorkflowSpec", "engineWorkflowCapacity", "engineWorkflowCost", "engineModelFitForUnit", "engineWorkflowNetValue", "engineUnitModelFitTriple", "recipeSpecTriple"];

function modelFitSandbox(withEngine = true) {
  return buildSandbox(source, {
    functions: ADAPTER_FNS,
    globals: {
      window: withEngine ? { StudioEngine: engine } : {},
      gridCellValue: () => "", stepTypeOf: () => null, inferRecipeDataSensitivity: () => "unknown",
      stepDisplayName: (s) => (s && s.step) || "Step", analysisGridSteps: () => [], recipeConnectionSeams: () => [], analysisWorkflowName: () => "",
    },
  });
}

test("residency coupling (engine): PII / MNPI force restricted; confidential routes at its normal class tier", () => {
  assert.equal(engine.modelTier("assembly", "PII", "routed"), "restricted");
  assert.equal(engine.modelTier("assembly", "MNPI", "routed"), "restricted");
  assert.equal(engine.modelTier("assembly", "confidential", "routed"), "small", "confidential is NOT forced to restricted");
  assert.equal(engine.modelTier("assembly", "internal", "routed"), "small");
  assert.equal(engine.modelTier("decision", "MNPI", "routed"), "human", "a decision stays human (no tier)");
});

test("the app's modelFit triple comes from the engine, carries the cost-to-serve band + residency, and wears provenance", () => {
  const sb = modelFitSandbox();
  const mf = sb.engineUnitModelFitTriple([{ step: "Monitor exposure", cls: "assembly", data: "MNPI", time: 100, theo: 40 }]);
  assert.ok(isTriple(mf), "modelFit is a valid app prov triple (default inferred/grey)");
  assert.match(mf.value, /cost-to-serve is a band/i, "cost-to-serve is a band");
  assert.match(mf.value, /restricted|in-VPC|approved/, "MNPI residency note present");
  // confidential gets an in-VPC note but is NOT a restricted pricing tier
  const conf = sb.engineUnitModelFitTriple([{ step: "Reconcile", cls: "assembly", data: "confidential", time: 10, theo: 70 }]);
  assert.match(conf.value, /in-VPC|approved/);
  assert.ok(!/restricted pricing tier/i.test(conf.value), "confidential is not a restricted pricing tier");
});

test("netValue helper = engine.netValue(gross, cost) for the fixture", () => {
  const sb = modelFitSandbox();
  const FPA = [
    { step: "a", cls: "assembly", data: "confidential", time: 18, theo: 85 }, { step: "b", cls: "assembly", data: "confidential", time: 16, theo: 70 },
    { step: "c", cls: "assembly", data: "confidential", time: 14, theo: 55 }, { step: "d", cls: "judgment", data: "confidential", time: 14, theo: 30 },
    { step: "e", cls: "assembly", data: "confidential", time: 16, theo: 60 }, { step: "f", cls: "assembly", data: "confidential", time: 12, theo: 50 },
    { step: "g", cls: "decision", data: "MNPI", time: 10, theo: 10 },
  ];
  const nv = sb.engineWorkflowNetValue({ steps: FPA });
  assert.ok(Math.abs(nv.value - (nv.grossValue - nv.annualCost)) < 0.001, "net = gross - cost");
  // M3 — decision permitted ceiling 0 (was 5%): the MNPI advisory decision no longer credits its
  // ~$71 sliver, so net 20688 -> 20617. Same tolerance.
  assert.ok(Math.abs(nv.value - 20617) < 35, `net ~20617, got ${nv.value}`);
});

test("the cost-to-serve / model-fit rail family: allowed on recipe + dashboard, denied on capture + workbench; reduction denied everywhere", () => {
  const sb = modelFitSandbox();
  for (const s of ["recipe", "dashboard"]) assert.equal(sb.railCheck("cost-to-serve is a band; net value positive", s).ok, true, `allowed on ${s}`);
  for (const s of ["capture", "workbench"]) assert.equal(sb.railCheck("cost-to-serve is a band", s).ok, false, `denied on ${s}`);
  assert.equal(sb.railCheck("net value", "workbench").ok, false, "net value off worker surfaces");
  assert.equal(sb.railCheck("frontier tier", "capture").ok, false, "model-tier names off capture");
  for (const s of ["capture", "workbench", "recipe", "dashboard"]) assert.equal(sb.railCheck("reduce headcount", s).ok, false, `reduction denied on ${s}`);
});

// ---- buildStepRecipeSpec gains field 7 (big sandbox: IR + adapter + engine) ----
function specSandbox(withEngine = true) {
  const state = { questionHistory: [], evidenceArtifacts: [], recipeCache: {}, stepTypes: {}, __steps: [] };
  const fns = buildSandbox(source, {
    consts: ["ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE", "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS", "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER", "POLICY_AREA_CUES", "RECIPE_SPEC_READINESS", "STEP_TYPE_OPTIONS"],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope", "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability", "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness", "policyClip", "extractPolicyClauses", "matchPolicyClause", "policyReviewLine", "buildAgentRecipeIr",
      "getField", "patchField", "deriveLegacyCellSource", "newGridCell", "newGridStep", "newAiPatternEntry", "makeId",
      "recipeSpecTriple", "defaultRecipeSpec", "buildStepRecipeSpec", "stepTypeOf", "isValidStepType",
      "studioEngine", "engineProvValue", "engineStepClass", "engineDataTier", "appStepToEngineStep", "appWorkflowToIntake", "engineModelFitForUnit", "engineUnitModelFitTriple",
    ],
    globals: {
      state, console: { info() {}, warn() {}, error() {} }, currentGridStep: () => null,
      analysisGridSteps: () => state.__steps, recipeConnectionSeams: () => [], handoffId: (a, b) => `h:${a}>${b}`, connectionToolTokens: () => [],
      analysisWorkflowName: () => "", window: withEngine ? { StudioEngine: engine } : {},
    },
  });
  const makeStep = (cells = {}, stepType) => {
    const step = fns.newGridStep();
    for (const [k, v] of Object.entries(cells)) fns.patchField(step, null, k, v, "user-stated", 0.95);
    if (stepType) state.stepTypes[step.id] = { value: stepType, source: "user-stated" };
    state.__steps = [step];
    return step;
  };
  return { ...fns, state, makeStep };
}

test("buildStepRecipeSpec gains a well-formed 7th field when the engine is loaded; six-field when it isn't (additive)", () => {
  const withE = specSandbox(true);
  const step = withE.makeStep({ name: "Reconcile & validate", systemsTools: "Excel", dataProcessing: "client confidential ledgers", dataSensitivity: "client confidential", output: "reconciled figures" }, "data-op");
  const spec = withE.buildStepRecipeSpec(step.id);
  assert.ok(isTriple(spec.modelFit), "field 7 present & well-formed when the engine is loaded");
  assert.match(spec.modelFit.value, /cost-to-serve is a band/i);
  // the six fields are intact
  for (const k of ["goal", "context", "constraints", "acceptanceCriteria", "escalation"]) assert.ok(isTriple(spec[k]), `${k} intact`);

  const noE = specSandbox(false);
  const step2 = noE.makeStep({ name: "Reconcile", systemsTools: "Excel" }, "data-op");
  assert.equal(noE.buildStepRecipeSpec(step2.id).modelFit, undefined, "no engine => six-field canvas (modelFit undefined)");
});

// ---- canvas renders field 7 only when present ----
function renderSandbox() {
  return buildSandbox(source, {
    consts: ["RECIPE_SPEC_READINESS"],
    functions: ["recipeSpecCanvasHtml", "recipeProvChipHtml", "recipeSpecTriple"],
    globals: { escapeHtml: (s) => String(s == null ? "" : s) },
  });
}
test("the canvas renders the 7th field when modelFit is present, and stays six-field when absent", () => {
  const { recipeSpecCanvasHtml } = renderSandbox();
  const base = { goal: { value: "g", source: "ai-inferred", confidence: null }, context: { value: "c", source: "ai-inferred", confidence: null }, constraints: { value: "x", source: "ai-inferred", confidence: null }, acceptanceCriteria: { value: "a", source: "ai-inferred", confidence: null }, decomposition: [], escalation: { value: "e", source: "ai-inferred", confidence: null }, evalCases: [], readiness: "future" };
  assert.ok(!/Model-fit & cost-to-serve/.test(recipeSpecCanvasHtml(base, "s1")), "six-field canvas: no model-fit row");
  const withMf = { ...base, modelFit: { value: "Routed — assembly -> small. Cost-to-serve is a band.", source: "ai-inferred", confidence: null } };
  const html = recipeSpecCanvasHtml(withMf, "s1");
  assert.match(html, /Model-fit & cost-to-serve/, "7th field renders when present");
  assert.match(html, /class="prov ai"/, "modelFit wears its provenance (inferred/grey)");
});
