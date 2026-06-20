// Change 2 — Policy ingestion -> constraints, escalation, readiness. Executed,
// deterministic tests (NO live LLM) over the addressability model (permitted = min(
// theoretical, ceiling(stepType, dataTier))), the policy-constraints normalizer, the two
// populated spec fields, and now/gated/future readiness with its surfaced reason. Additive:
// with no policy loaded a unit is byte-identical to Change 1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

const FORBIDDEN = /headcount|\bFTE\b|full-time equivalent|automat|\bROI\b|hours? saved|time saved|\bopportunity\b/i;
const FIRM_NAMES = /\b(Accenture|Capco|Nagarro|Huntington|Deloitte|McKinsey)\b/i;
const BANNED_PHRASE = /work with your development team/i;
const HUMAN_PINK = /#FF4FD8|#ff4fc8|#ffc4ea/i;

const RANK = { assist: 0, "bounded-agent": 1, "supervised-orchestration": 2, "governed-autonomy": 3 };

function isTriple(t) {
  return Boolean(t) && typeof t === "object"
    && typeof t.value === "string"
    && (t.source === "user-stated" || t.source === "ai-inferred")
    && (t.confidence === null || typeof t.confidence === "number");
}
function assertWellFormed(spec, label = "spec") {
  for (const k of ["goal", "context", "constraints", "acceptanceCriteria", "escalation"]) assert.ok(isTriple(spec[k]), `${label}.${k} triple`);
  assert.ok(Array.isArray(spec.decomposition) && spec.decomposition.every(isTriple), `${label}.decomposition`);
  assert.ok(Array.isArray(spec.evalCases), `${label}.evalCases`);
  assert.ok(["now", "gated", "future"].includes(spec.readiness), `${label}.readiness`);
}

// ---- pure policy/addressability sandbox (no IR, no state) ----
function policySandbox() {
  return buildSandbox(source, {
    consts: [
      "ADDRESSABILITY_LEVELS", "PRODUCT_DELIVERABLE_ADDRESSABILITY", "POLICY_DATA_TIERS",
      "DATA_TIER_ADDRESSABILITY_CEILING", "STEP_TYPE_ADDRESSABILITY_CEILING", "POLICY_AREA_CUES"
    ],
    functions: [
      "normalizeAddressabilityLevel", "addressabilityRank", "minAddressability",
      "theoreticalAddressability", "unitAddressabilityCeiling", "sensitivityToTier",
      "resolveUnitDataTier", "permittedAddressability", "normalizePolicyConstraints",
      "specConstraintsTriple", "specEscalationTriple", "specReadinessFromPolicy",
      "applyPolicyConstraintsToSpec", "recipeSpecTriple", "matchPolicyClause", "policyClip"
    ],
    globals: {}
  });
}

// ---- big sandbox: buildRecipeSpec(stepId, policy) end-to-end (IR + profile + typology) ----
function bigSandbox() {
  const state = { questionHistory: [], evidenceArtifacts: [], recipeCache: {}, stepTypes: {}, aiPolicy: null, __steps: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER", "POLICY_AREA_CUES", "RECIPE_SPEC_READINESS",
      "ADDRESSABILITY_LEVELS", "PRODUCT_DELIVERABLE_ADDRESSABILITY", "POLICY_DATA_TIERS",
      "DATA_TIER_ADDRESSABILITY_CEILING", "STEP_TYPE_ADDRESSABILITY_CEILING", "STEP_TYPE_OPTIONS"
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
      "specReadinessFromPolicy", "applyPolicyConstraintsToSpec", "stepTypeOf", "isValidStepType"
    ],
    globals: {
      state,
      console: { info: () => {}, warn: () => {}, error: () => {} },
      currentGridStep: () => null,
      analysisGridSteps: () => state.__steps,
      recipeConnectionSeams: () => [],
      handoffId: (a, b) => `h:${a}>${b}`,
      connectionToolTokens: () => []
    }
  });
  const makeStep = (cells = {}, stepType) => {
    const step = fns.newGridStep();
    for (const [key, spec] of Object.entries(cells)) {
      const [value, src = "user-stated", conf = 0.95] = Array.isArray(spec) ? spec : [spec];
      fns.patchField(step, null, key, value, src, conf);
    }
    if (stepType) state.stepTypes[step.id] = { value: stepType, source: "user-stated" };
    state.__steps = [step];
    return step;
  };
  return { ...fns, state, makeStep };
}

const NEUTRAL_CELLS = {
  name: "Summarize the weekly portfolio changes",
  description: "Produce a written summary of portfolio changes for the relationship manager.",
  systemsTools: "Excel, Outlook",
  output: "Portfolio change summary document",
  trigger: "The weekly close completes",
  dataProcessing: "Account holdings and recent transactions"
};

const govStep = (over = {}) => ({ kind: "step", stepType: "data-op", capturedTier: "unknown", humanHeld: false, name: "X", ...over });

// =============================================================================

test("permittedAddressability = min(theoretical, ceiling); a policy LOWERS it below the theoretical potential", () => {
  const sb = policySandbox();
  const gov = govStep(); // data-op => theoretical governed-autonomy (the top)
  const lenient = sb.permittedAddressability(gov, { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "internal" } });
  assert.equal(lenient.theoretical, "governed-autonomy");
  assert.ok(RANK[lenient.level] <= RANK[lenient.theoretical], "permitted never exceeds theoretical");
  assert.ok(RANK[lenient.level] < RANK["governed-autonomy"], "the internal-tier policy lowers it below the potential");

  const strict = sb.permittedAddressability(gov, { autonomyCeiling: "assist", dataTiers: { "*": "internal" } });
  assert.ok(RANK[strict.level] < RANK[lenient.level], "a stricter autonomy ceiling lowers permitted further");
});

test("stricter data tiers LOWER the ceiling: PII / MNPI produce a lower ceiling than internal (never raise it)", () => {
  const sb = policySandbox();
  const pc = { autonomyCeiling: "governed-autonomy" };
  const internal = sb.unitAddressabilityCeiling("data-op", "internal", pc);
  const pii = sb.unitAddressabilityCeiling("data-op", "PII", pc);
  const mnpi = sb.unitAddressabilityCeiling("data-op", "MNPI", pc);
  assert.ok(RANK[pii] < RANK[internal], "PII ceiling is lower than internal");
  assert.ok(RANK[mnpi] < RANK[internal], "MNPI ceiling is lower than internal");
  // and it flows through to permitted addressability for the same unit
  const piiPermit = sb.permittedAddressability(govStep(), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "PII" } });
  const intPermit = sb.permittedAddressability(govStep(), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "internal" } });
  assert.ok(RANK[piiPermit.level] < RANK[intPermit.level], "PII permitted < internal permitted for the same step");
});

test("an unknown data tier is treated conservatively and surfaced — never assumed the most permissive", () => {
  const sb = policySandbox();
  const resolved = sb.resolveUnitDataTier(govStep({ capturedTier: "unknown" }), { dataTiers: {} });
  assert.equal(resolved.known, false, "an unclassified tier is flagged, not silently resolved");
  assert.equal(resolved.tier, "unknown");
  const permit = sb.permittedAddressability(govStep({ capturedTier: "unknown" }), { autonomyCeiling: "governed-autonomy" });
  assert.equal(permit.dataTierKnown, false);
  assert.ok(RANK[permit.level] < RANK["governed-autonomy"], "unknown is conservative, not the most permissive tier");
});

test("a human-held unit stays at assist regardless of a permissive policy (assist, not replace)", () => {
  const sb = policySandbox();
  const permit = sb.permittedAddressability(govStep({ humanHeld: true, stepType: "data-op" }), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "public" } });
  assert.equal(permit.theoretical, "assist", "a held unit's potential is assist");
  assert.equal(permit.level, "assist");
});

test("normalizePolicyConstraints: structured input passes through (clamped); a clause policy derives a set via the existing classifier; junk -> null", () => {
  const sb = policySandbox();
  const structured = sb.normalizePolicyConstraints({
    autonomyCeiling: "not-a-level", dataTiers: { "*": "internal" }, toolAllowlist: ["Excel"], hitlMandates: ["approvals"], prohibitedUses: ["external send"], loggingRequirements: ["audit"]
  });
  assert.equal(structured.autonomyCeiling, "assist", "an invalid autonomy level clamps to the most conservative");
  assert.deepEqual(structured.toolAllowlist, ["Excel"]);
  assert.deepEqual(structured.hitlMandates, ["approvals"]);

  const clausePolicy = { fileName: "ai-policy.txt", clauses: [
    { id: "clause-1", ref: "1", heading: "Data Handling", text: "All client data must be stored in approved systems and must not be transmitted to external services without review.", source: "doc-extracted", confidence: 0.9 },
    { id: "clause-3", ref: "3", heading: "Human Review", text: "A qualified person must review and approve AI output before it is relied upon; human oversight is required.", source: "doc-extracted", confidence: 0.9 }
  ]};
  const derived = sb.normalizePolicyConstraints(clausePolicy);
  assert.ok(derived.hitlMandates.length > 0, "a human-review clause becomes a HITL mandate");
  assert.ok(derived.prohibitedUses.length > 0, "a data-handling clause becomes a boundary");
  assert.ok(RANK[derived.autonomyCeiling] < RANK["governed-autonomy"], "a restrictive policy lowers the derived autonomy ceiling");

  assert.equal(sb.normalizePolicyConstraints(null), null);
  assert.equal(sb.normalizePolicyConstraints({}), null, "an empty object is not a usable policy");
});

test("readiness: now / gated(with reason) / future per the rules", () => {
  const sb = policySandbox();
  const withAcceptance = { acceptanceCriteria: { value: "judged complete", source: "ai-inferred", confidence: null } };
  const noAcceptance = { acceptanceCriteria: { value: "", source: "ai-inferred", confidence: null } };

  // now: acceptance present, tier known, naturally assist-level (human-held)
  const now = sb.specReadinessFromPolicy(withAcceptance, govStep({ humanHeld: true }), sb.permittedAddressability(govStep({ humanHeld: true }), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "public" } }));
  assert.equal(now.readiness, "now");

  // gated: missing acceptance
  const gA = sb.specReadinessFromPolicy(noAcceptance, govStep({ humanHeld: true }), sb.permittedAddressability(govStep({ humanHeld: true }), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "public" } }));
  assert.equal(gA.readiness, "gated");
  assert.match(gA.reason, /acceptance/i, "the gated reason names the missing acceptance criteria");

  // gated: unknown data tier
  const gT = sb.specReadinessFromPolicy(withAcceptance, govStep(), sb.permittedAddressability(govStep(), { autonomyCeiling: "governed-autonomy" }));
  assert.equal(gT.readiness, "gated");
  assert.match(gT.reason, /tier|classif/i, "the gated reason names the unclassified tier");

  // gated: policy caps a data-op to assist-only (PII)
  const gP = sb.specReadinessFromPolicy(withAcceptance, govStep(), sb.permittedAddressability(govStep(), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "PII" } }));
  assert.equal(gP.readiness, "gated");
  assert.match(gP.reason, /PII|assist-only|policy/i, "the gated reason names the policy cap");

  // future: permitted above what the product can deliver (assist)
  const fut = sb.specReadinessFromPolicy(withAcceptance, govStep(), sb.permittedAddressability(govStep(), { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "internal" } }));
  assert.equal(fut.readiness, "future");
  assert.match(fut.reason, /capability|orchestration|action/i);
});

test("applyPolicyConstraintsToSpec populates constraints + escalation with provenance and attaches permittedAddressability", () => {
  const sb = policySandbox();
  const base = {
    goal: sb.recipeSpecTriple("g", "ai-inferred", null), context: sb.recipeSpecTriple("c", "ai-inferred", null),
    constraints: sb.recipeSpecTriple("", "ai-inferred", null), acceptanceCriteria: sb.recipeSpecTriple("a", "ai-inferred", null),
    decomposition: [], escalation: sb.recipeSpecTriple("", "ai-inferred", null), evalCases: [], readiness: "future"
  };
  const out = sb.applyPolicyConstraintsToSpec(base, govStep({ humanHeld: true, name: "Approve" }), { autonomyCeiling: "supervised-orchestration", dataTiers: { "*": "internal" }, toolAllowlist: ["Excel"], hitlMandates: ["sign-off"] });
  assert.ok(isTriple(out.constraints) && out.constraints.source === "ai-inferred", "constraints is an inferred triple");
  assert.match(out.constraints.value, /Data tier|Permitted addressability/, "constraints names tier + permitted addressability");
  assert.ok(isTriple(out.escalation), "escalation is a triple");
  assert.match(out.escalation.value, /person approves|Human-in-the-loop/i, "escalation carries HITL / human-hold");
  assert.ok(out.permittedAddressability && out.permittedAddressability.level, "the structured permitted cap is attached (for Change 5)");
  assert.equal(out.policyApplied, true);
});

test("RAILS: generated constraint + escalation text carries no banned economics token / firm name / banned phrase", () => {
  const sb = policySandbox();
  for (const gov of [govStep(), govStep({ humanHeld: true }), govStep({ stepType: "judgment" }), govStep({ capturedTier: "unknown" })]) {
    for (const pc of [{ autonomyCeiling: "governed-autonomy", dataTiers: { "*": "PII" } }, { autonomyCeiling: "assist", hitlMandates: ["review"], prohibitedUses: ["external send"], loggingRequirements: ["audit"] }]) {
      const permitted = sb.permittedAddressability(gov, pc);
      const blob = JSON.stringify([sb.specConstraintsTriple(gov, pc, permitted), sb.specEscalationTriple(gov, pc)]);
      assert.ok(!FORBIDDEN.test(blob), "no banned economics token");
      assert.ok(!FIRM_NAMES.test(blob) && !BANNED_PHRASE.test(blob), "no firm name / banned phrase");
    }
  }
});

test("buildRecipeSpec: the SAME unit under TWO policies yields two results; additive (no policy => Change 1)", () => {
  const sb = bigSandbox();
  const step = sb.makeStep(NEUTRAL_CELLS); // untyped, low-sensitivity => not human-held, tier from policy
  const a = sb.buildRecipeSpec(step.id, { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "public" } });
  const b = sb.buildRecipeSpec(step.id, { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "PII" } });
  assert.notEqual(a.readiness, b.readiness, "the two policies produce different readiness");
  assert.notEqual(a.constraints.value, b.constraints.value, "and different constraint text");
  assert.notEqual(a.permittedAddressability.level, b.permittedAddressability.level, "and a different permitted level");

  // additive: no policy loaded => Change 1 base spec (no policyApplied, readiness default)
  const bare = sb.buildRecipeSpec(step.id);
  assert.equal(bare.policyApplied, undefined, "no policy => the spec is unchanged from Change 1");
  assert.equal(bare.readiness, "future", "readiness stays at the Change 1 default");
  assert.equal(bare.constraints.source, "ai-inferred");
  assertWellFormed(bare, "no-policy spec");
});

test("buildRecipeSpec under a restrictive policy: a data-op on PII is gated with a surfaced reason and a lowered permitted level", () => {
  const sb = bigSandbox();
  const step = sb.makeStep(NEUTRAL_CELLS, "data-op"); // typed data-op => theoretical governed-autonomy
  const spec = sb.buildRecipeSpec(step.id, { autonomyCeiling: "governed-autonomy", dataTiers: { "*": "PII" } });
  assertWellFormed(spec, "policy spec");
  assert.equal(spec.readiness, "gated");
  assert.ok(spec.readinessReason && /PII|assist-only|policy/i.test(spec.readinessReason), "the gated reason is surfaced");
  assert.equal(spec.permittedAddressability.level, "assist", "PII clamps the data-op to assist");
  assert.ok(RANK[spec.permittedAddressability.level] < RANK[spec.permittedAddressability.theoretical], "permitted is below the theoretical potential");
});

test("ISOLATION (source): the policy code never calls the opportunity scorer and adds no server endpoint; rails clean", () => {
  const blob = [
    "normalizePolicyConstraints", "permittedAddressability", "unitAddressabilityCeiling", "theoreticalAddressability",
    "resolveUnitDataTier", "unitGovernanceShape", "specConstraintsTriple", "specEscalationTriple",
    "specReadinessFromPolicy", "applyPolicyConstraintsToSpec", "currentAiPolicy"
  ].map((fn) => extractFunction(source, fn)).join("\n");
  assert.ok(!/getStepOpportunityMeta/.test(blob), "scorer isolation: never calls getStepOpportunityMeta");
  assert.ok(!/patchField|persistState/.test(blob), "no grid write / no auto-harden");
  assert.ok(!/fetch\(|\/api\//.test(blob), "no new endpoint / model call — the policy is already uploaded via /api/extract-policy");
  assert.ok(!FORBIDDEN.test(blob), "no banned economics token");
  assert.ok(!FIRM_NAMES.test(blob) && !BANNED_PHRASE.test(blob) && !/\beliminate\b/i.test(blob), "no firm name / banned phrase / 'eliminate'");
  assert.ok(!HUMAN_PINK.test(blob), "no Human Pink minted");
  assert.ok(extractFunction(source, "getStepOpportunityMeta").length > 0, "the legacy scorer remains present and untouched");
});
