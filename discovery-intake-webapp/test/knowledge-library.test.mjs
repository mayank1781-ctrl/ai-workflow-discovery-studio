// V3-7 — shared, versioned knowledge library. Executed, deterministic tests (NO
// live LLM) over the client model: append-only frozen versioning, explicit
// application as a frozen provenance-carrying reference, version stability after a
// library edit, gated IR threading, and the decisive byte-identical-when-unused
// guarantee. Real shipped source extracted and evaluated (see helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction, extractConst } from "./helpers/extract.mjs";

const source = readAppSource();

// Small sandbox for the pure model helpers. makeId is stubbed with a counter so
// brand-new entries get distinct, deterministic ids.
function modelSandbox(state) {
  return buildSandbox(source, {
    consts: ["KNOWLEDGE_KINDS"],
    functions: [
      "buildKnowledgeEntryVersion", "knowledgeEntryCurrent", "normalizeKnowledgeKind",
      "buildAppliedKnowledgeRef", "applyKnowledgeRefToState", "removeAppliedKnowledgeFromState",
      "appliedKnowledgeForWorkflow", "deepFreeze"
    ],
    globals: {
      state: state || {},
      makeId: (() => { let n = 0; return () => `knowledge-${n += 1}`; })()
    }
  });
}

// IR sandbox — mirrors test/policy-ingestion.test.mjs (buildAgentRecipeIr + its
// full dependency set). The V3-7 appliedKnowledge field lives inside that fn.
function irSandbox() {
  const sandboxState = { questionHistory: [], evidenceArtifacts: [] };
  const fns = buildSandbox(source, {
    consts: [
      "ARTIFACT_TARGET_SURFACES", "ARTIFACT_SCOPE_OPTIONS", "NO_INTEGRATION_MVP_NOTE",
      "FUTURE_INTEGRATION_NOTE", "ARTIFACT_CRITICAL_CELLS", "ARTIFACT_CAUTION_AREAS",
      "TRANSITION_SIGNAL_RULES", "CELL_PLAIN_NAMES", "GRID_CELL_KEYS", "GRID_SOURCE_RANK",
      "GRID_CELL_LAYER", "POLICY_AREA_CUES"
    ],
    functions: [
      "artifactSurfaceLabel", "normalizeArtifactTargetSurface", "normalizeRecipeScope",
      "gridCellValue", "compilerCellText", "compilerCellSnapshot", "compilerEvidenceSummary",
      "inferRecipeDataSensitivity", "inferRecipeReuseFrequency", "inferWorkflowStability",
      "detectTransitionStep", "isDeveloperOrientedStep", "recommendArtifactTargetSurface",
      "artifactRecommendationReason", "buildRecipeDeploymentProfile", "scoreRecipeReadiness",
      "policyClip", "extractPolicyClauses", "matchPolicyClause", "policyReviewLine",
      "buildAgentRecipeIr", "artifactBullets", "artifactCautionSection",
      "getField", "patchField", "deriveLegacyCellSource", "newGridCell", "newGridStep",
      "newAiPatternEntry", "makeId"
    ],
    globals: {
      state: sandboxState,
      console: { info: () => {}, warn: () => {}, error: () => {} },
      currentGridStep: () => null
    }
  });
  const makeStep = () => fns.newGridStep();
  const fill = (step, key, value, sourceName = "user-stated", confidence = 0.95) =>
    fns.patchField(step, null, key, value, sourceName, confidence);
  return { ...fns, makeStep, fill };
}

const IR_OPTS = { targetSurface: "recommend" };

// --- Criterion: edit creates a version; prior preserved intact ----------------

test("editing an entry appends a new FROZEN version; the prior version stays intact", () => {
  const { buildKnowledgeEntryVersion, knowledgeEntryCurrent } = modelSandbox();
  const v1 = buildKnowledgeEntryVersion(null, { name: "Credit framework", body: "Step 1", originalSource: "Risk Policy 4", kind: "framework" }, "t1");
  assert.equal(v1.versions.length, 1);
  assert.equal(v1.versions[0].version, 1);
  assert.equal(v1.name, "Credit framework");
  assert.equal(v1.kind, "framework");
  assert.ok(Object.isFrozen(v1.versions[0]), "each version is deep-frozen");

  const v2 = buildKnowledgeEntryVersion(v1, { name: "Credit framework", body: "Step 1 and 2", originalSource: "Risk Policy 4", kind: "framework" }, "t2");
  assert.equal(v2.versions.length, 2, "an edit appends a version");
  assert.equal(v2.id, v1.id, "the entry id is stable across versions");
  assert.equal(v2.versions[0].body, "Step 1", "the prior version is preserved intact");
  assert.equal(v2.versions[1].body, "Step 1 and 2");
  assert.equal(knowledgeEntryCurrent(v2).version, 2);
  assert.equal(knowledgeEntryCurrent(v2).body, "Step 1 and 2");

  // An unknown kind falls back to "reference" (the entry shape is constrained).
  assert.equal(buildKnowledgeEntryVersion(null, { name: "X", kind: "bogus" }, "t").kind, "reference");
});

// --- Criterion: a reference carries provenance back to the library item -------

test("applying an entry stores a FROZEN reference with provenance back to the entry + original source", () => {
  const state = { appliedKnowledge: [] };
  const { applyKnowledgeRefToState, buildKnowledgeEntryVersion } = modelSandbox(state);
  const entry = buildKnowledgeEntryVersion(null, { name: "Data standard", body: "do x", originalSource: "Risk Policy 9", kind: "standard" }, "t1");
  assert.equal(applyKnowledgeRefToState(entry, "t-apply", { name: "Reviewer", email: "r@example.com" }), true);
  assert.equal(state.appliedKnowledge.length, 1);
  const ref = state.appliedKnowledge[0];
  assert.equal(ref.entryId, entry.id);
  assert.equal(ref.version, 1);
  assert.equal(ref.kind, "standard");
  assert.equal(ref.originalSource, "Risk Policy 9", "provenance back to the original source");
  assert.equal(ref.appliedBy.name, "Reviewer");
  assert.ok(Object.isFrozen(ref), "the applied reference is frozen (never mutated in place)");
});

// --- Criterion: editing the library never silently changes recipes using a prior version

test("editing the library AFTER applying never changes the applied reference; re-apply is the explicit upgrade", () => {
  const state = { appliedKnowledge: [] };
  const { applyKnowledgeRefToState, buildKnowledgeEntryVersion } = modelSandbox(state);
  const v1 = buildKnowledgeEntryVersion(null, { name: "F", body: "v1 body", kind: "framework" }, "t1");
  applyKnowledgeRefToState(v1, "t-apply", {});
  const appliedSnapshot = JSON.stringify(state.appliedKnowledge[0]);

  // The library entry is edited to v2 (a new object, server-side). The applied
  // reference on this workflow MUST be untouched — it still points at v1.
  const v2 = buildKnowledgeEntryVersion(v1, { name: "F", body: "v2 body", kind: "framework" }, "t2");
  assert.equal(JSON.stringify(state.appliedKnowledge[0]), appliedSnapshot, "a library edit does not change the applied reference");
  assert.equal(state.appliedKnowledge[0].version, 1);
  assert.equal(state.appliedKnowledge[0].body, "v1 body");

  // Only an EXPLICIT re-apply upgrades — and it replaces, never appends.
  applyKnowledgeRefToState(v2, "t-apply2", {});
  assert.equal(state.appliedKnowledge.length, 1, "re-apply of the same entry replaces, not appends");
  assert.equal(state.appliedKnowledge[0].version, 2);
  assert.equal(state.appliedKnowledge[0].body, "v2 body");
});

test("remove is explicit and leaves other applied refs intact; the workflow accessor gates to null when empty", () => {
  const state = { appliedKnowledge: [] };
  const { applyKnowledgeRefToState, removeAppliedKnowledgeFromState, appliedKnowledgeForWorkflow, buildKnowledgeEntryVersion } = modelSandbox(state);
  assert.equal(appliedKnowledgeForWorkflow(), null, "empty applied list gates to null (byte-identical baseline)");
  const a = buildKnowledgeEntryVersion(null, { name: "A" }, "t");
  const b = buildKnowledgeEntryVersion(null, { name: "B" }, "t");
  applyKnowledgeRefToState(a, "t", {});
  applyKnowledgeRefToState(b, "t", {});
  assert.equal(state.appliedKnowledge.length, 2);
  assert.ok(appliedKnowledgeForWorkflow(), "non-empty applied list returns the array");
  assert.equal(removeAppliedKnowledgeFromState(a.id), true);
  assert.deepEqual(state.appliedKnowledge.map((r) => r.entryId), [b.id], "only the named ref is removed");
  assert.equal(removeAppliedKnowledgeFromState("not-applied"), false, "no-op removal returns false (no fabricated change)");
});

// --- Criterion: applied knowledge flows into the IR with provenance ----------

test("applied knowledge flows into the IR as provenance-tagged items with the knowledge-library source", () => {
  const { makeStep, fill, buildAgentRecipeIr } = irSandbox();
  const step = makeStep();
  fill(step, "name", "Summarise portfolio changes");
  fill(step, "description", "Produce a written summary of portfolio changes.");
  const knowledge = [{ entryId: "knowledge-1", version: 2, name: "Credit framework", kind: "framework", originalSource: "Risk Policy 4" }];
  const ir = buildAgentRecipeIr(step, { knowledge }, IR_OPTS);
  assert.equal(ir.appliedKnowledge.length, 1);
  const k = ir.appliedKnowledge[0];
  assert.equal(k.name, "Credit framework");
  assert.equal(k.kind, "framework");
  assert.equal(k.version, 2);
  assert.equal(k.source, "knowledge-library");
  assert.equal(k.provenance.entryId, "knowledge-1");
  assert.equal(k.provenance.originalSource, "Risk Policy 4");
});

// --- Decisive: byte-identical IR when nothing is applied ----------------------

test("with no knowledge applied the IR is byte-identical to baseline (appliedKnowledge is [])", () => {
  const { makeStep, fill, buildAgentRecipeIr } = irSandbox();
  const step = makeStep();
  fill(step, "name", "Summarise portfolio changes");
  fill(step, "description", "Produce a written summary of portfolio changes.");
  // Same step, three "no knowledge" contexts — the IR must be identical, and
  // appliedKnowledge must be [] (mirrors policyCitations).
  const irNone = buildAgentRecipeIr(step, {}, IR_OPTS);
  const irNull = buildAgentRecipeIr(step, { knowledge: null }, IR_OPTS);
  const irEmpty = buildAgentRecipeIr(step, { knowledge: [] }, IR_OPTS);
  assert.deepEqual(irNone.appliedKnowledge, []);
  assert.deepEqual(irNull, irNone, "knowledge:null IR is byte-identical to the no-context IR");
  assert.deepEqual(irEmpty, irNone, "knowledge:[] IR is byte-identical to baseline");
  // Sanity: applying knowledge DOES change the IR, so the gate is real.
  const irWith = buildAgentRecipeIr(step, { knowledge: [{ entryId: "k1", version: 1, name: "X", kind: "standard", originalSource: "S" }] }, IR_OPTS);
  assert.notDeepEqual(irWith.appliedKnowledge, [], "applied knowledge changes the IR");
});

// --- Source-level: no model call, no recompute, display-only provenance -------

test("applying knowledge triggers no model call and recomputes no relied-on value", () => {
  for (const name of [
    "applyKnowledgeToWorkflow", "applyKnowledgeRefToState", "removeAppliedKnowledge",
    "removeAppliedKnowledgeFromState", "buildKnowledgeEntryVersion", "buildAppliedKnowledgeRef",
    "appliedKnowledgeForWorkflow"
  ]) {
    const body = extractFunction(source, name);
    assert.ok(!/requestJson|\bfetch\s*\(|\/api\//.test(body), `${name} must not call the server/model`);
    assert.ok(!/buildAgentRecipeIr|scoreRecipeReadiness|getStepOpportunityMeta|compileArtifactForStep|patchField/.test(body), `${name} must not recompute a relied-on value or write a grid cell`);
  }
});

test("the applied-knowledge provenance source is DISPLAY-ONLY — present in the badge, absent from GRID_SOURCE_RANK", () => {
  assert.ok(extractFunction(source, "provenanceBadgeHtml").includes("knowledge-library"), "knowledge-library is a distinct provenance display source");
  assert.ok(!extractConst(source, "GRID_SOURCE_RANK").includes("knowledge-library"), "knowledge-library never enters the write-precedence map");
});
