// Change 3 — The Workbench confirm/reconcile gate. Executed, deterministic tests (NO live
// LLM) proving: unconfirmed capture cannot produce a HARDENED spec; an explicit confirm
// hardens grey->teal and only then unlocks the hardened path; nothing hardens on its own;
// the gate is never a dead end; and the multi-person reconcile extension point preserves
// provenance and surfaces conflicts. Reuses the EXISTING hardening (recipeGateCheck +
// patchField) — no parallel provenance system.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|\bROI\b|hours? saved|time saved|\bopportunity\b/i;
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
const BANNED_PHRASE = /work with your development team/i;
const HUMAN_PINK = /#FF4FD8|#ff4fc8|#ffc4ea/i;

function isTriple(t) {
  return Boolean(t) && typeof t === "object" && typeof t.value === "string"
    && (t.source === "user-stated" || t.source === "ai-inferred")
    && (t.confidence === null || typeof t.confidence === "number");
}
function assertWellFormed(spec) {
  for (const k of ["goal", "context", "constraints", "acceptanceCriteria", "escalation"]) assert.ok(isTriple(spec[k]), `${k} triple`);
  assert.ok(Array.isArray(spec.decomposition) && spec.decomposition.every(isTriple), "decomposition");
  assert.ok(Array.isArray(spec.evalCases), "evalCases");
  assert.ok(["now", "gated", "future"].includes(spec.readiness), "readiness");
}

// One cell per recipe-critical field group (systemsTools / volume / dataFlow / sensitivity /
// painAndRules) + a spec-source cell (output) — the minimum to confirm a step.
const CONFIRMED = { systemsTools: "Excel", frequencyVolume: "Daily", dataProcessing: "Account data", dataSensitivity: "internal", painFriction: "manual rekeying", output: "A drafted summary" };
const inferred = (over = {}) => Object.fromEntries(Object.entries({ ...CONFIRMED, ...over }).map(([k, v]) => [k, [v, "ai-inferred", 0.5]]));

// ---- big gate sandbox: recipeGateCheck machinery + the gate + the IR (for hardenedRecipeSpec) ----
function gateSandbox() {
  const state = { questionHistory: [], evidenceArtifacts: [], recipeCache: {}, stepTypes: {}, aiPolicy: null, __steps: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER", "POLICY_AREA_CUES", "RECIPE_SPEC_READINESS",
      "ADDRESSABILITY_LEVELS", "PRODUCT_DELIVERABLE_ADDRESSABILITY", "POLICY_DATA_TIERS",
      "DATA_TIER_ADDRESSABILITY_CEILING", "STEP_TYPE_ADDRESSABILITY_CEILING", "STEP_TYPE_OPTIONS",
      "RECIPE_CRITICAL_FIELDS", "RECIPE_CONFIDENCE_THRESHOLD"
    ],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope",
      "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability",
      "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness",
      "policyClip", "extractPolicyClauses", "matchPolicyClause", "policyReviewLine",
      "buildAgentRecipeIr", "getField", "patchField", "deriveLegacyCellSource",
      "newGridCell", "newGridStep", "newAiPatternEntry", "makeId",
      "recipeSpecTriple", "defaultRecipeSpec", "buildStepRecipeSpec",
      "buildConnectionRecipeSpec", "buildRecipeSpec", "recipeUnitSource",
      "normalizeAddressabilityLevel", "addressabilityRank", "minAddressability",
      "theoreticalAddressability", "unitAddressabilityCeiling", "sensitivityToTier",
      "resolveUnitDataTier", "permittedAddressability", "normalizePolicyConstraints",
      "currentAiPolicy", "unitGovernanceShape", "specConstraintsTriple", "specEscalationTriple",
      "specReadinessFromPolicy", "applyPolicyConstraintsToSpec", "stepTypeOf", "isValidStepType",
      // Change 3 under test:
      "recipeGateCheck", "cellConfirmedEnough", "isUnitConfirmed", "confirmedView",
      "hardenedRecipeSpec", "confirmUnit", "reconcileCaptures"
    ],
    globals: {
      state,
      console: { info: () => {}, warn: () => {}, error: () => {} },
      currentGridStep: () => null,
      analysisGridSteps: () => state.__steps,
      recipeConnectionSeams: () => [],
      handoffId: (a, b) => `h:${a}>${b}`,
      connectionToolTokens: () => [],
      questionStatusForIntent: () => "active", // never retired in the fixture
      persistState: () => {}
    }
  });
  const makeStep = (cells = {}, push = true) => {
    const step = fns.newGridStep();
    for (const [key, spec] of Object.entries(cells)) {
      const [value, src = "user-stated", conf = 0.95] = Array.isArray(spec) ? spec : [spec];
      fns.patchField(step, null, key, value, src, conf);
    }
    if (push) state.__steps = [step];
    return step;
  };
  return { ...fns, state, makeStep };
}

function renderSandbox() {
  return buildSandbox(source, {
    consts: ["RECIPE_SPEC_READINESS"],
    functions: ["recipeSpecCanvasHtml", "recipeProvChipHtml", "recipeSpecTriple"],
    globals: { escapeHtml: (s) => String(s == null ? "" : s) }
  });
}

function reconcileSandbox() {
  return buildSandbox(source, { consts: ["GRID_SOURCE_RANK"], functions: ["reconcileCaptures"], globals: {} });
}

// =============================================================================

test("isUnitConfirmed reuses recipeGateCheck: user-stated recipe-critical capture is confirmed; ai-inferred is not", () => {
  const sb = gateSandbox();
  const confirmedStep = sb.makeStep(CONFIRMED);
  assert.equal(sb.isUnitConfirmed(confirmedStep.id), true, "all recipe-critical groups user-stated => confirmed");
  const inferredStep = sb.makeStep(inferred());
  assert.equal(sb.isUnitConfirmed(inferredStep.id), false, "ai-inferred capture is not confirmed");
  assert.equal(sb.isUnitConfirmed("nope"), false);
});

test("THE GATE: an unconfirmed unit cannot produce a hardened spec (null); a confirmed unit can", () => {
  const sb = gateSandbox();
  const inferredStep = sb.makeStep(inferred());
  assert.equal(sb.hardenedRecipeSpec(inferredStep.id), null, "no path from unconfirmed capture to a hardened spec");
  // the Workbench still shows the inferred spec — never a dead end
  assertWellFormed(sb.buildRecipeSpec(inferredStep.id));

  const confirmedStep = sb.makeStep(CONFIRMED);
  const hardened = sb.hardenedRecipeSpec(confirmedStep.id);
  assert.ok(hardened && typeof hardened === "object", "a confirmed unit yields a hardened spec");
  assertWellFormed(hardened);
});

test("confirming hardens grey->teal and ONLY then unlocks the hardened path", () => {
  const sb = gateSandbox();
  const step = sb.makeStep(inferred()); // present but ai-inferred
  // before: unconfirmed, no hardened spec, context reads grey (ai-inferred)
  assert.equal(sb.isUnitConfirmed(step.id), false);
  assert.equal(sb.hardenedRecipeSpec(step.id), null);
  assert.equal(sb.buildRecipeSpec(step.id).context.source, "ai-inferred", "context rests on the inferred systemsTools cell");

  const hardened = sb.confirmUnit(step.id); // explicit, human-initiated
  assert.equal(hardened, true, "confirmUnit hardened the present inferred cells");

  // after: confirmed, hardened spec unlocked, context now reads teal (user-stated)
  assert.equal(sb.isUnitConfirmed(step.id), true);
  assert.ok(sb.hardenedRecipeSpec(step.id), "the hardened path is now unlocked");
  assert.equal(sb.buildRecipeSpec(step.id).context.source, "user-stated", "grey -> teal: the cell is now user-stated");
});

test("nothing hardens on its own: repeated reads never auto-promote inferred capture", () => {
  const sb = gateSandbox();
  const step = sb.makeStep(inferred());
  for (let i = 0; i < 3; i += 1) {
    sb.buildRecipeSpec(step.id);
    sb.hardenedRecipeSpec(step.id);
    sb.isUnitConfirmed(step.id);
  }
  assert.equal(sb.isUnitConfirmed(step.id), false, "still unconfirmed — no hardening happened on its own");
  assert.equal(sb.getField(step, null, "systemsTools").source, "ai-inferred", "the cell stayed inferred");
  assert.equal(sb.hardenedRecipeSpec(step.id), null);
});

test("never a dead end: a unit missing a recipe-critical area can't be force-confirmed (gate holds) but still shows a draft spec", () => {
  const sb = gateSandbox();
  // only systemsTools captured; volume / dataFlow / sensitivity / painAndRules empty
  const step = sb.makeStep({ systemsTools: ["Excel", "ai-inferred", 0.5], output: ["A summary", "ai-inferred", 0.5] });
  sb.confirmUnit(step.id); // promotes what's present, but the empty areas remain gaps
  assert.equal(sb.isUnitConfirmed(step.id), false, "the gate holds — you cannot confirm what isn't captured");
  assert.equal(sb.hardenedRecipeSpec(step.id), null, "still no hardened artifact");
  assertWellFormed(sb.buildRecipeSpec(step.id)); // ...but a draft spec still renders — not a wall
});

test("confirmedView splits confirmed vs unconfirmed; a Dashboard would derive ONLY from confirmed", () => {
  const sb = gateSandbox();
  const a = sb.makeStep(CONFIRMED, false);
  const b = sb.makeStep(inferred(), false);
  sb.state.__steps = [a, b];
  const view = sb.confirmedView();
  assert.deepEqual(view.confirmed, [a.id], "only the confirmed unit feeds downstream");
  assert.deepEqual(view.unconfirmed, [b.id], "the unconfirmed unit is surfaced for follow-up (never-a-dead-end)");
  assert.equal(view.total, 2);
});

test("a CONNECTION is confirmed only when both adjacent steps are confirmed", () => {
  const sb = gateSandbox();
  const a = sb.makeStep(CONFIRMED, false);
  const b = sb.makeStep(inferred(), false);
  sb.state.__steps = [a, b];
  assert.equal(sb.isUnitConfirmed(`h:${a.id}>${b.id}`), false, "an unconfirmed endpoint blocks the handoff");
  // confirm b, then the handoff is confirmed
  sb.confirmUnit(b.id);
  assert.equal(sb.isUnitConfirmed(`h:${a.id}>${b.id}`), true, "both endpoints confirmed => the handoff is confirmed");
});

test("RENDER: the gate banner shows confirmed=hardened (teal) / draft+Confirm affordance; undefined => no banner (byte-identical)", () => {
  const { recipeSpecCanvasHtml } = renderSandbox();
  const spec = {
    goal: { value: "g", source: "user-stated", confidence: 0.9 }, context: { value: "c", source: "ai-inferred", confidence: null },
    constraints: { value: "", source: "ai-inferred", confidence: null }, acceptanceCriteria: { value: "a", source: "ai-inferred", confidence: null },
    decomposition: [], escalation: { value: "e", source: "ai-inferred", confidence: null }, evalCases: [], readiness: "future"
  };
  const confirmed = recipeSpecCanvasHtml(spec, "s1", true);
  assert.match(confirmed, /data-spec-gate="confirmed"/);
  assert.match(confirmed, /hardened/i, "the confirmed banner says hardened");

  const draft = recipeSpecCanvasHtml(spec, "s1", false);
  assert.match(draft, /data-spec-gate="draft"/);
  assert.match(draft, /data-confirm-unit="s1"/, "the draft banner offers a Confirm affordance");
  assert.match(draft, /Draft until confirmed/);
  assert.ok(!/blocked/i.test(draft), "never a wall");

  const none = recipeSpecCanvasHtml(spec, "s1");
  assert.ok(!/data-spec-gate/.test(none), "gateState undefined => no banner (Change 1/2 byte-identical)");

  for (const h of [confirmed, draft]) {
    assert.ok(!FORBIDDEN.test(h), "no banned economics token");
    assert.ok(!/gradient/i.test(h), "no gradient on the data surface");
    assert.ok(!HUMAN_PINK.test(h), "Human Pink reserved");
  }
});

test("reconcile (extension point): preserves each contributor's provenance and SURFACES conflicts (never silently resolves)", () => {
  const { reconcileCaptures } = reconcileSandbox();
  const A = { contributor: "Ana", fields: { systemsTools: { value: "Excel", source: "user-stated", confidence: 1 }, dataSensitivity: { value: "internal", source: "ai-inferred", confidence: 0.5 } } };
  const B = { contributor: "Ben", fields: { systemsTools: { value: "Excel", source: "ai-inferred", confidence: 0.6 }, dataSensitivity: { value: "PII", source: "user-stated", confidence: 1 } } };
  const out = reconcileCaptures([A, B]);

  // agreement: merged, both contributors preserved, highest-provenance source kept
  assert.equal(out.merged.systemsTools.conflicted, false);
  assert.deepEqual(out.merged.systemsTools.contributors.slice().sort(), ["Ana", "Ben"]);
  assert.equal(out.merged.systemsTools.source, "user-stated", "provenance preserved (highest rank wins the display value)");

  // conflict: surfaced, NOT silently resolved
  assert.equal(out.merged.dataSensitivity.conflicted, true, "the conflicting field is flagged, not quietly merged");
  assert.equal(out.conflicts.length, 1);
  assert.equal(out.conflicts[0].field, "dataSensitivity");
  assert.equal(out.conflicts[0].values.length, 2, "both contributors' values are surfaced");
  assert.ok(out.conflicts[0].values.some((v) => v.value === "internal" && v.contributor === "Ana"));
  assert.ok(out.conflicts[0].values.some((v) => v.value === "PII" && v.contributor === "Ben"));
  assert.equal(out.contributorCount, 2);
});

test("ISOLATION (source): the gate REUSES the existing hardening (recipeGateCheck + patchField), never the scorer; rails clean", () => {
  assert.ok(/recipeGateCheck/.test(extractFunction(source, "isUnitConfirmed")), "reuses recipeGateCheck — not a parallel provenance system");
  assert.ok(/patchField/.test(extractFunction(source, "confirmUnit")), "confirmUnit reuses the existing grid write path (one-directional hardening)");
  const blob = ["isUnitConfirmed", "confirmedView", "hardenedRecipeSpec", "confirmUnit", "reconcileCaptures"]
    .map((fn) => extractFunction(source, fn)).join("\n");
  assert.ok(!/getStepOpportunityMeta/.test(blob), "scorer isolation: the gate never calls getStepOpportunityMeta");
  assert.ok(!FORBIDDEN.test(blob), "no banned economics token");
  assert.ok(!FIRM_NAMES.test(blob) && !BANNED_PHRASE.test(blob) && !/\beliminate\b/i.test(blob), "no firm name / banned phrase / 'eliminate'");
  assert.ok(!HUMAN_PINK.test(blob), "no Human Pink minted");
  assert.ok(extractFunction(source, "getStepOpportunityMeta").length > 0, "the legacy scorer remains present and untouched");
});
