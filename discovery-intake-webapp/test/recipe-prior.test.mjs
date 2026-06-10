// Executed tests for PR 33 Slice 2 — classification correction. Prior recipes
// are preserved + timestamped ONLY when a new prompt actually lands (steer 2:
// a gate-panel detour with no generation rotates nothing); pattern edits land
// via patchField with user-edited provenance. Real shipped source extracted
// and evaluated (see test/helpers/extract.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAppSource, buildSandbox, extractFunction } from "./helpers/extract.mjs";

const source = readAppSource();

function classificationSandbox() {
  const state = {
    recipeCache: {}, recipeCachePrior: {}, recipeMeta: {},
    questionHistory: [], workflowGrid: { workflowFamily: "", steps: [] }
  };
  const fns = buildSandbox(source, {
    consts: ["GRID_CELL_KEYS", "GRID_SOURCE_RANK", "GRID_CELL_LAYER"],
    functions: [
      "rotateRecipeOnLanding",
      "applyPatternEdit",
      "applyFamilyEdit",
      "patchField",
      "getField",
      "deriveLegacyCellSource",
      "newGridStep",
      "newGridCell",
      "newAiPatternEntry",
      "makeId"
    ],
    globals: { state, console: { info: () => {}, warn: () => {}, error: () => {} }, currentGridStep: () => null }
  });
  return { ...fns, state };
}

test("prior rotation happens only when a prompt lands, preserved + timestamped with old labels", () => {
  const { rotateRecipeOnLanding, state } = classificationSandbox();
  // First landing: no prior exists.
  const hadPrior1 = rotateRecipeOnLanding("step-1", "PROMPT v1", { pattern: "Extract", family: "Finance & Reporting" });
  assert.equal(hadPrior1, false, "first landing has no prior to preserve");
  assert.equal(state.recipeCache["step-1"], "PROMPT v1");
  assert.equal(state.recipeCachePrior["step-1"], undefined, "no prior entry on first landing");
  assert.equal(state.recipeMeta["step-1"].pattern, "Extract", "labels recorded at generation");

  // Second landing: the prior is preserved, timestamped, with the OLD labels.
  const hadPrior2 = rotateRecipeOnLanding("step-1", "PROMPT v2", { pattern: "Classify", family: "Finance & Reporting" });
  assert.equal(hadPrior2, true);
  assert.equal(state.recipeCache["step-1"], "PROMPT v2");
  const prior = state.recipeCachePrior["step-1"];
  assert.equal(prior.prompt, "PROMPT v1", "prior prompt preserved verbatim");
  assert.equal(prior.pattern, "Extract", "prior carries the labels it was generated under");
  assert.ok(!Number.isNaN(Date.parse(prior.preservedAt)), "prior is timestamped");
  assert.equal(state.recipeMeta["step-1"].pattern, "Classify", "meta now reflects the new labels");
});

test("steer 2 structurally: rotation is called ONLY from the generation landing path", () => {
  // Exactly one call site (plus the definition) in the whole client.
  const calls = (source.match(/rotateRecipeOnLanding\(/g) || []).length;
  assert.equal(calls, 2, "definition + exactly one call site");
  const landing = extractFunction(source, "runRecipeGeneration");
  assert.ok(landing.includes("rotateRecipeOnLanding("), "the one call site is runRecipeGeneration (where prompts land)");
  // The gate panel and the gate router never rotate.
  assert.ok(!extractFunction(source, "renderRecipeGatePanel").includes("rotateRecipeOnLanding"), "gate panel never rotates");
  assert.ok(!extractFunction(source, "generateRecipePrompt").includes("rotateRecipeOnLanding"), "gate router never rotates");
});

test("pattern edit lands via patchField with user-edited provenance and always applies", () => {
  const { applyPatternEdit, getField, newGridStep, patchField } = classificationSandbox();
  const step = newGridStep();
  // Even over a user-stated pattern at confidence 1 (handoff confirm), an
  // explicit edit applies (refresh semantics at equal rank).
  patchField(step, "meta", "aiPattern", [{ pattern: "Extract", confidence: 1 }], "user-stated", 1);
  assert.equal(applyPatternEdit(step, "Classify"), true, "explicit edit always lands");
  const cell = getField(step, "meta", "aiPattern");
  assert.equal(cell.value[0].pattern, "Classify");
  assert.equal(cell.source, "user-edited", "provenance is user-edited");
  assert.equal(cell.state, "confirmed");
  // Garbage rejected.
  assert.equal(applyPatternEdit(step, "   "), false);
  assert.equal(applyPatternEdit(null, "Extract"), false);
});

test("family edit is workflow-level metadata; no-ops on same value", () => {
  const { applyFamilyEdit, state } = classificationSandbox();
  assert.equal(applyFamilyEdit("Finance & Reporting"), true);
  assert.equal(state.workflowGrid.workflowFamily, "Finance & Reporting");
  assert.equal(applyFamilyEdit("Finance & Reporting"), false, "same value is a no-op");
  assert.equal(applyFamilyEdit(""), false, "empty rejected");
});
